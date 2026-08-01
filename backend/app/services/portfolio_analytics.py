"""Quantitative portfolio analytics: mean-variance metrics, the efficient
frontier, the Capital Market Line and the Security Market Line — all computed
from the positions' *real* daily price history (Yahoo, GBp-normalised), so the
numbers describe the actual book rather than a simulation.

Long/short aware: weights are signed (short legs carry negative weight), and the
frontier is the unconstrained Merton frontier, which permits short-selling —
consistent with a long/short mandate.

Options and any line without resolvable equity history are excluded from the
statistical universe (no free feed carries historical option prices); they are
reported separately so the user knows what was left out.
"""

from __future__ import annotations

import datetime as dt

import numpy as np
from sqlalchemy.orm import Session, selectinload

from app import models
from app.services import fx, reports, securities

TRADING_DAYS = 252
RISK_FREE = 0.04  # annual risk-free rate used for Sharpe, CML and the SML
DEFAULT_BENCHMARK = "^GSPC"  # S&P 500 as the market proxy
_MIN_OBS = 40  # need a minimum of aligned observations for stable covariance


# --------------------------------------------------------------------------
# Return matrix
# --------------------------------------------------------------------------
def _aligned_returns(
    symbols: list[str], period: str
) -> tuple[list[dt.date], dict[str, np.ndarray]]:
    """Fetch each symbol's daily closes, align on the common trading dates, and
    return simple daily returns per symbol. Symbols with too little overlap are
    dropped."""
    closes: dict[str, dict[dt.date, float]] = {}
    for s in symbols:
        series = reports._daily_closes(s, period)
        if len(series) >= _MIN_OBS + 1:
            closes[s] = series
    if not closes:
        return [], {}

    # Common date axis = intersection of all symbols' dates (kept in order).
    common: set[dt.date] | None = None
    for series in closes.values():
        ks = set(series.keys())
        common = ks if common is None else (common & ks)
    if not common or len(common) < _MIN_OBS + 1:
        # Fall back to the union of the two longest series' intersection is too
        # strict; instead relax to dates present in the majority of symbols.
        from collections import Counter

        counter: Counter[dt.date] = Counter()
        for series in closes.values():
            counter.update(series.keys())
        threshold = max(2, int(len(closes) * 0.6))
        common = {d for d, c in counter.items() if c >= threshold}
        # Keep only symbols that cover most of that axis.
        closes = {
            s: series
            for s, series in closes.items()
            if len(set(series.keys()) & common) >= len(common) * 0.8
        }
        if not closes or len(common) < _MIN_OBS + 1:
            return [], {}

    dates = sorted(common)
    rets: dict[str, np.ndarray] = {}
    for s, series in closes.items():
        # Forward-fill missing marks on the common axis, then simple returns.
        prices = np.array([_ffill(series, dates, i) for i in range(len(dates))], dtype=float)
        prices = np.where(prices > 0, prices, np.nan)
        r = prices[1:] / prices[:-1] - 1.0
        if np.isnan(r).any():
            r = np.nan_to_num(r, nan=0.0)
        rets[s] = r
    return dates[1:], rets


def _ffill(series: dict[dt.date, float], dates: list[dt.date], i: int) -> float:
    d = dates[i]
    if d in series:
        return series[d]
    for j in range(i - 1, -1, -1):
        if dates[j] in series:
            return series[dates[j]]
    for j in range(i + 1, len(dates)):
        if dates[j] in series:
            return series[dates[j]]
    return float("nan")


# --------------------------------------------------------------------------
# Covariance (shrunk for invertibility)
# --------------------------------------------------------------------------
def _shrunk_cov(mat: np.ndarray, delta: float = 0.2) -> np.ndarray:
    """Sample covariance shrunk toward its diagonal (Ledoit-Wolf-style), plus a
    tiny ridge, so the matrix stays positive-definite and invertible even with
    highly correlated names or few observations."""
    s = np.cov(mat, rowvar=False, ddof=1)
    s = np.atleast_2d(s)
    diag = np.diag(np.diag(s))
    shrunk = (1 - delta) * s + delta * diag
    ridge = 1e-8 * np.trace(shrunk) / shrunk.shape[0]
    return shrunk + ridge * np.eye(shrunk.shape[0])


# --------------------------------------------------------------------------
# Scalar metric helpers
# --------------------------------------------------------------------------
def _ann_return(daily: np.ndarray) -> float:
    return float((1 + daily.mean()) ** TRADING_DAYS - 1)


def _ann_vol(daily: np.ndarray) -> float:
    return float(daily.std(ddof=1) * np.sqrt(TRADING_DAYS))


def _sharpe(daily: np.ndarray) -> float | None:
    sd = daily.std(ddof=1)
    if sd <= 0:
        return None
    rf_daily = RISK_FREE / TRADING_DAYS
    return float((daily.mean() - rf_daily) / sd * np.sqrt(TRADING_DAYS))


def _sortino(daily: np.ndarray) -> float | None:
    rf_daily = RISK_FREE / TRADING_DAYS
    downside = daily[daily < rf_daily] - rf_daily
    if downside.size == 0:
        return None
    dd = np.sqrt((downside**2).mean())
    if dd <= 0:
        return None
    return float((daily.mean() - rf_daily) / dd * np.sqrt(TRADING_DAYS))


def _max_drawdown(daily: np.ndarray) -> float:
    nav = np.cumprod(1 + daily)
    peak = np.maximum.accumulate(nav)
    return float((nav / peak - 1.0).min())


def _var_cvar(daily: np.ndarray, conf: float) -> tuple[float, float]:
    """Historical VaR/CVaR (loss as a positive fraction) at the given confidence."""
    q = np.quantile(daily, 1 - conf)
    tail = daily[daily <= q]
    cvar = tail.mean() if tail.size else q
    return float(-q), float(-cvar)


def _skew_kurt(daily: np.ndarray) -> tuple[float, float]:
    x = daily - daily.mean()
    sd = daily.std(ddof=0)
    if sd <= 0:
        return 0.0, 0.0
    skew = float((x**3).mean() / sd**3)
    kurt = float((x**4).mean() / sd**4 - 3.0)  # excess kurtosis
    return skew, kurt


def _beta_alpha(asset: np.ndarray, market: np.ndarray) -> tuple[float | None, float | None]:
    var_m = market.var(ddof=1)
    if var_m <= 0:
        return None, None
    cov = np.cov(asset, market, ddof=1)[0, 1]
    beta = cov / var_m
    rf_daily = RISK_FREE / TRADING_DAYS
    # Jensen alpha, annualised: mean asset excess minus beta*mean market excess.
    alpha_daily = (asset.mean() - rf_daily) - beta * (market.mean() - rf_daily)
    return float(beta), float((1 + alpha_daily) ** TRADING_DAYS - 1)


# --------------------------------------------------------------------------
# Efficient frontier (Merton closed form, short-selling allowed)
# --------------------------------------------------------------------------
def _frontier(mu: np.ndarray, cov: np.ndarray, rf: float) -> dict | None:
    try:
        inv = np.linalg.inv(cov)
    except np.linalg.LinAlgError:
        return None
    ones = np.ones(len(mu))
    A = float(ones @ inv @ ones)
    B = float(ones @ inv @ mu)
    C = float(mu @ inv @ mu)
    D = A * C - B * B
    if A <= 0 or abs(D) < 1e-12:
        return None

    # Global minimum-variance portfolio.
    w_gmv = inv @ ones / A
    mu_gmv = B / A
    var_gmv = 1.0 / A

    # Tangency portfolio (max Sharpe) w.r.t. the risk-free rate.
    excess = mu - rf * ones
    denom = float(ones @ inv @ excess)
    tangency = None
    if abs(denom) > 1e-9:
        w_tan = inv @ excess / denom
        mu_tan = float(mu @ w_tan)
        var_tan = float(w_tan @ cov @ w_tan)
        if var_tan > 0 and mu_tan > rf:
            tangency = {
                "ret": mu_tan,
                "vol": float(np.sqrt(var_tan)),
                "sharpe": (mu_tan - rf) / float(np.sqrt(var_tan)),
                "weights": w_tan.tolist(),
            }

    # Frontier curve: sweep target returns around the GMV and the assets.
    lo = min(mu_gmv, float(mu.min()))
    hi = max(float(mu.max()), mu_gmv + 2 * abs(mu_gmv - lo) + 1e-6)
    span = hi - lo
    lo -= 0.15 * span
    hi += 0.15 * span
    pts = []
    for m in np.linspace(lo, hi, 60):
        var = (A * m * m - 2 * B * m + C) / D
        if var > 0:
            pts.append({"vol": float(np.sqrt(var)), "ret": float(m)})

    return {
        "points": pts,
        "gmv": {"ret": float(mu_gmv), "vol": float(np.sqrt(var_gmv)), "weights": w_gmv.tolist()},
        "tangency": tangency,
    }


# --------------------------------------------------------------------------
# Main entry
# --------------------------------------------------------------------------
def analyze_portfolio(
    db: Session,
    portfolio_id: int,
    period: str,
    target_ccy: str,
    rates: dict,
    benchmark: str = DEFAULT_BENCHMARK,
) -> dict:
    portfolio = (
        db.query(models.Portfolio)
        .options(selectinload(models.Portfolio.positions))
        .filter(models.Portfolio.id == portfolio_id)
        .first()
    )
    if not portfolio:
        return {"ok": False, "error": "Portefeuille introuvable."}

    return _analyze_positions(
        list(portfolio.positions), period, target_ccy, rates, benchmark,
        label=f"Portefeuille {portfolio.ptf_id}",
    )


def _analyze_positions(
    positions: list[models.Position],
    period: str,
    target_ccy: str,
    rates: dict,
    benchmark: str,
    label: str,
) -> dict:
    # Market value (signed) per usable position; skip excluded and options.
    usable: list[dict] = []
    skipped: list[dict] = []
    for pos in positions:
        sym = (pos.data_symbol or pos.ticker or "").strip()
        mv = fx.convert(
            pos.quantity * pos.last_price * (pos.multiplier or 1.0),
            pos.currency, target_ccy, rates,
        )
        is_option = bool(pos.opt_right or pos.opt_strike)
        if pos.excluded:
            skipped.append({"ticker": pos.ticker, "reason": "exclue", "market_value": mv})
            continue
        if is_option or pos.asset_class in ("option", "future", "fx", "cash"):
            skipped.append({"ticker": pos.ticker, "reason": "dérivé/sans historique actions", "market_value": mv})
            continue
        if not sym:
            skipped.append({"ticker": pos.ticker, "reason": "symbole non résolu", "market_value": mv})
            continue
        usable.append({"pos": pos, "symbol": sym, "market_value": mv})

    if len(usable) < 2:
        return {
            "ok": False,
            "error": "Au moins deux lignes actions avec historique de prix sont nécessaires "
                     "pour l'analyse quantitative (frontière efficiente, CML, SML).",
            "skipped": skipped,
        }

    # Aggregate duplicate symbols (same name held twice) by summing MV.
    by_symbol: dict[str, dict] = {}
    for u in usable:
        s = u["symbol"]
        if s not in by_symbol:
            by_symbol[s] = {"symbol": s, "name": u["pos"].name, "market_value": 0.0,
                            "sector": u["pos"].sector or "N/A", "currency": u["pos"].currency}
        by_symbol[s]["market_value"] += u["market_value"]

    symbols = list(by_symbol.keys())
    dates, rets = _aligned_returns(symbols + [benchmark], period)
    if not dates or benchmark not in rets:
        return {
            "ok": False,
            "error": "Historique de prix insuffisant ou indisponible pour l'analyse "
                     "(marché/benchmark non récupérable).",
            "skipped": skipped,
        }

    market = rets.pop(benchmark)
    # Keep only symbols that survived alignment.
    symbols = [s for s in symbols if s in rets]
    if len(symbols) < 2:
        return {
            "ok": False,
            "error": "Trop peu de lignes avec un historique commun exploitable.",
            "skipped": skipped,
        }

    R = np.column_stack([rets[s] for s in symbols])  # T x N
    n = len(symbols)

    # Signed weights normalised by net exposure (long/short aware).
    mv_vec = np.array([by_symbol[s]["market_value"] for s in symbols], dtype=float)
    net = mv_vec.sum()
    gross = np.abs(mv_vec).sum()
    net_weight_basis = net if abs(net) > 0.2 * gross else gross
    weights = mv_vec / net_weight_basis if net_weight_basis != 0 else np.full(n, 1.0 / n)

    # Per-asset annualised stats.
    mu_daily = R.mean(axis=0)
    mu_ann = np.array([_ann_return(R[:, i]) for i in range(n)])
    vol_ann = np.array([_ann_vol(R[:, i]) for i in range(n)])
    cov_daily = _shrunk_cov(R)
    cov_ann = cov_daily * TRADING_DAYS
    mu_ann_arith = mu_daily * TRADING_DAYS  # arithmetic, for the frontier math

    # Portfolio daily return series and its metrics.
    port_daily = R @ weights
    port_ret = _ann_return(port_daily)
    port_vol = float(np.sqrt(weights @ cov_ann @ weights))
    port_beta, port_alpha = _beta_alpha(port_daily, market)
    var95, cvar95 = _var_cvar(port_daily, 0.95)
    var99, cvar99 = _var_cvar(port_daily, 0.99)
    skew, kurt = _skew_kurt(port_daily)
    market_ann = _ann_return(market)
    market_vol = _ann_vol(market)

    # Tracking error / information ratio vs benchmark.
    active = port_daily - market
    te = _ann_vol(active)
    info_ratio = (_ann_return(port_daily) - market_ann) / te if te > 0 else None

    # Up/down capture.
    up = market > 0
    down = market < 0
    up_cap = (port_daily[up].mean() / market[up].mean()) if up.any() and market[up].mean() != 0 else None
    down_cap = (port_daily[down].mean() / market[down].mean()) if down.any() and market[down].mean() != 0 else None

    # Diversification ratio & effective number of bets.
    w_vol = np.array([vol_ann[i] for i in range(n)])
    div_ratio = float(np.abs(weights) @ w_vol / port_vol) if port_vol > 0 else None
    gross_w = np.abs(weights)
    hhi = float((gross_w / gross_w.sum()) @ (gross_w / gross_w.sum())) if gross_w.sum() > 0 else None
    eff_bets = (1.0 / hhi) if hhi and hhi > 0 else None

    # Risk contribution of each asset: w_i * (Σ w)_i / (wᵀΣw).
    cov_w = cov_ann @ weights
    port_var = float(weights @ cov_ann @ weights)
    risk_contrib = (weights * cov_w / port_var) if port_var > 0 else np.zeros(n)

    # Per-asset detail (beta/alpha vs market, CAPM expected return for SML).
    assets = []
    rf = RISK_FREE
    for i, s in enumerate(symbols):
        beta_i, alpha_i = _beta_alpha(R[:, i], market)
        capm_expected = (rf + beta_i * (market_ann - rf)) if beta_i is not None else None
        corr_p = float(np.corrcoef(R[:, i], port_daily)[0, 1])
        assets.append({
            "symbol": s,
            "name": by_symbol[s]["name"],
            "sector": by_symbol[s]["sector"],
            "weight": float(weights[i]),
            "market_value": float(by_symbol[s]["market_value"]),
            "ann_return": float(mu_ann[i]),
            "ann_vol": float(vol_ann[i]),
            "beta": beta_i,
            "alpha": alpha_i,
            "sharpe": _sharpe(R[:, i]),
            "capm_expected": capm_expected,
            "mispricing": (float(mu_ann[i] - capm_expected) if capm_expected is not None else None),
            "corr_to_portfolio": corr_p,
            "risk_contribution": float(risk_contrib[i]),
        })
    assets.sort(key=lambda a: abs(a["weight"]), reverse=True)

    # Efficient frontier + CML from the tangency portfolio.
    frontier = _frontier(mu_ann_arith, cov_ann, rf)
    cml = None
    current_on_frontier = None
    if frontier:
        # Current portfolio point on the risk-return plane.
        current_on_frontier = {"vol": port_vol, "ret": mu_ann_arith @ weights}
        if frontier.get("tangency"):
            t = frontier["tangency"]
            # CML: from (0, rf) through the tangency portfolio, extended.
            max_vol = max([p["vol"] for p in frontier["points"]] + [port_vol, t["vol"]])
            slope = (t["ret"] - rf) / t["vol"] if t["vol"] > 0 else 0.0
            cml = {
                "slope": slope,
                "points": [
                    {"vol": 0.0, "ret": rf},
                    {"vol": float(max_vol * 1.05), "ret": float(rf + slope * max_vol * 1.05)},
                ],
            }
        # Attach GMV/tangency weight maps by symbol for readability.
        frontier["gmv"]["allocation"] = {symbols[i]: round(w, 4) for i, w in enumerate(frontier["gmv"]["weights"])}
        del frontier["gmv"]["weights"]
        if frontier.get("tangency"):
            frontier["tangency"]["allocation"] = {symbols[i]: round(w, 4) for i, w in enumerate(frontier["tangency"]["weights"])}
            del frontier["tangency"]["weights"]

    # Security Market Line: rf .. rf + (E[Rm]-rf) across beta in [min,max].
    betas = [a["beta"] for a in assets if a["beta"] is not None]
    sml = None
    if betas:
        b_lo = min(0.0, min(betas)) - 0.1
        b_hi = max(1.2, max(betas)) + 0.1
        sml = {
            "risk_free": rf,
            "market_return": market_ann,
            "points": [
                {"beta": float(b_lo), "ret": float(rf + b_lo * (market_ann - rf))},
                {"beta": float(b_hi), "ret": float(rf + b_hi * (market_ann - rf))},
            ],
        }

    # Correlation matrix among holdings.
    corr = np.corrcoef(R, rowvar=False)
    corr_matrix = {
        "symbols": symbols,
        "matrix": [[round(float(corr[i, j]), 3) for j in range(n)] for i in range(n)],
    }

    port_sharpe = _sharpe(port_daily)

    return {
        "ok": True,
        "label": label,
        "currency": target_ccy,
        "period": period,
        "benchmark": benchmark,
        "as_of": dates[-1].isoformat(),
        "observations": len(port_daily),
        "risk_free": rf,
        "portfolio": {
            "expected_return": float(mu_ann_arith @ weights),   # arithmetic (frontier-consistent)
            "annualised_return": float(port_ret),               # geometric realised
            "annualised_vol": float(port_vol),
            "sharpe": port_sharpe,
            "sortino": _sortino(port_daily),
            "max_drawdown": _max_drawdown(port_daily),
            "beta": port_beta,
            "alpha": port_alpha,
            "treynor": (float((port_ret - rf) / port_beta) if port_beta not in (None, 0) else None),
            "var_95": var95, "cvar_95": cvar95,
            "var_99": var99, "cvar_99": cvar99,
            "skew": skew, "excess_kurtosis": kurt,
            "tracking_error": te,
            "information_ratio": info_ratio,
            "up_capture": (float(up_cap) if up_cap is not None else None),
            "down_capture": (float(down_cap) if down_cap is not None else None),
            "diversification_ratio": div_ratio,
            "effective_bets": eff_bets,
            "net_exposure": float(net),
            "gross_exposure": float(gross),
        },
        "benchmark_stats": {
            "annualised_return": market_ann,
            "annualised_vol": market_vol,
            "sharpe": _sharpe(market),
        },
        "assets": assets,
        "frontier": frontier,
        "current_point": current_on_frontier,
        "cml": cml,
        "sml": sml,
        "correlation": corr_matrix,
        "skipped": skipped,
    }

"""Candidate screener: given the current portfolio, scan a regional universe
(Nasdaq, S&P 500, Europe, Asia) for names that would improve the book on the
mean-variance frontier, ranked by residual alpha.

Method — Treynor-Black security selection. The current portfolio is the
benchmark; each candidate's excess return is regressed on the portfolio's excess
return:

    r_c - rf = alpha + beta·(r_p - rf) + e

- alpha        = residual alpha (return NOT explained by exposure to what you
                 already hold).
- IR = alpha / std(e)  = the information (appraisal) ratio.

Adding a name raises the maximum attainable Sharpe from SR_p to
sqrt(SR_p² + IR²): so a positive residual alpha with a positive IR is precisely
"a stock that expands your efficient frontier". Candidates are filtered to
alpha>0 and IR>0 and ranked by IR — the marginal Sharpe contribution.
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from sqlalchemy.orm import Session, selectinload

from app import models
from app.services import portfolio_analytics as pa
from app.services import reports, screener_universes

TRADING_DAYS = 252
_MIN_OBS = 60
_MAX_WORKERS = 12
_CACHE_TTL = 600  # 10 min

# {(held_key, universe, period): (ts, result)}
_cache: dict[tuple, tuple[float, dict]] = {}
_lock = threading.Lock()

_SUFFIX_MARKET = {
    "PA": "Paris", "DE": "Xetra", "L": "Londres", "SW": "Zurich", "AS": "Amsterdam",
    "MI": "Milan", "MC": "Madrid", "ST": "Stockholm", "OL": "Oslo", "HE": "Helsinki",
    "CO": "Copenhague", "T": "Tokyo", "HK": "Hong Kong", "AX": "Sydney", "SI": "Singapour",
    "KS": "Séoul", "TW": "Taipei",
}


def _market_of(symbol: str) -> str:
    if "." in symbol:
        return _SUFFIX_MARKET.get(symbol.rsplit(".", 1)[1].upper(), "International")
    return "US"


def _ols_alpha_beta(y: np.ndarray, x: np.ndarray) -> tuple[float, float, np.ndarray]:
    """Regress y on x with intercept; return (alpha, beta, residuals)."""
    X = np.column_stack([np.ones_like(x), x])
    coef, *_ = np.linalg.lstsq(X, y, rcond=None)
    alpha, beta = float(coef[0]), float(coef[1])
    resid = y - X @ coef
    return alpha, beta, resid


def _evaluate(
    symbol: str, ctx: dict, period: str
) -> dict | None:
    """Score one candidate against the portfolio return context."""
    closes = reports._daily_closes(symbol, period)
    if len(closes) < _MIN_OBS + 1:
        return None
    price_dates = ctx["price_dates"]
    prices = np.array([pa._ffill(closes, price_dates, i) for i in range(len(price_dates))], dtype=float)
    if np.isnan(prices).mean() > 0.2:  # too little overlap with the book's window
        return None
    cand_ret = prices[1:] / prices[:-1] - 1.0
    port_ret = ctx["port_ret"]
    mask = ~np.isnan(cand_ret)
    if mask.sum() < _MIN_OBS:
        return None
    c = cand_ret[mask]
    p = port_ret[mask]
    rf = ctx["rf_daily"]

    alpha_d, beta, resid = _ols_alpha_beta(c - rf, p - rf)
    resid_std = resid.std(ddof=2) if resid.size > 2 else resid.std()
    if resid_std <= 0:
        return None
    ir = (alpha_d / resid_std) * np.sqrt(TRADING_DAYS)          # annualised appraisal ratio
    alpha_ann = (1 + alpha_d) ** TRADING_DAYS - 1
    corr = float(np.corrcoef(c, p)[0, 1])

    cand_ann_ret = (1 + c.mean()) ** TRADING_DAYS - 1
    cand_vol = c.std(ddof=1) * np.sqrt(TRADING_DAYS)
    cand_sharpe = ((c.mean() - rf) / c.std(ddof=1) * np.sqrt(TRADING_DAYS)) if c.std(ddof=1) > 0 else None

    sr_p = ctx["sharpe"] or 0.0
    new_sharpe = float(np.sqrt(max(sr_p, 0.0) ** 2 + max(ir, 0.0) ** 2))

    return {
        "symbol": symbol,
        "market": _market_of(symbol),
        "residual_alpha": float(alpha_ann),
        "information_ratio": float(ir),
        "beta_to_portfolio": beta,
        "correlation": corr,
        "ann_return": float(cand_ann_ret),
        "ann_vol": float(cand_vol),
        "sharpe": cand_sharpe,
        "sharpe_uplift": float(new_sharpe - max(sr_p, 0.0)),
        "new_portfolio_sharpe": new_sharpe,
        "observations": int(mask.sum()),
    }


def screen_portfolio(
    db: Session,
    portfolio_id: int,
    universe: str,
    period: str,
    target_ccy: str,
    rates: dict,
    limit: int = 25,
) -> dict:
    universe = universe.upper()
    tickers = screener_universes.universe(universe)
    if not tickers:
        return {"ok": False, "error": f"Univers inconnu: {universe}"}

    portfolio = (
        db.query(models.Portfolio)
        .options(selectinload(models.Portfolio.positions))
        .filter(models.Portfolio.id == portfolio_id)
        .first()
    )
    if not portfolio:
        return {"ok": False, "error": "Portefeuille introuvable."}

    ctx = pa.portfolio_return_context(list(portfolio.positions), period, target_ccy, rates)
    if ctx is None:
        return {
            "ok": False,
            "error": "Le portefeuille n'a pas assez de lignes actions avec historique "
                     "commun pour servir de référence au screening.",
        }

    held = ctx["held"]
    cache_key = (tuple(sorted(held)), universe, period)
    with _lock:
        hit = _cache.get(cache_key)
        if hit and time.time() - hit[0] < _CACHE_TTL:
            return hit[1]

    # Candidates = universe minus names already held (by root ticker too).
    held_roots = {h.split(".")[0] for h in held}
    candidates = [
        t for t in tickers
        if t.upper() not in held and t.split(".")[0].upper() not in held_roots
    ]

    results: list[dict] = []
    with ThreadPoolExecutor(max_workers=_MAX_WORKERS) as ex:
        for r in ex.map(lambda s: _evaluate(s, ctx, period), candidates):
            if r is not None:
                results.append(r)

    # Frontier-improving names: positive residual alpha AND positive appraisal ratio.
    improving = [r for r in results if r["residual_alpha"] > 0 and r["information_ratio"] > 0]
    improving.sort(key=lambda r: r["information_ratio"], reverse=True)

    out = {
        "ok": True,
        "universe": universe,
        "universe_label": screener_universes.LABELS.get(universe, universe),
        "period": period,
        "currency": target_ccy,
        "portfolio_sharpe": ctx["sharpe"],
        "held_count": len(held),
        "screened": len(results),
        "candidates_total": len(candidates),
        "results": improving[:limit],
    }
    with _lock:
        _cache[cache_key] = (time.time(), out)
    return out

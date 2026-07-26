"""Composite momentum indicator.

Five academically-grounded momentum legs, blended into one score and verdict:

1. FF5/FF6  — Fama-French factor regression (reuses taurus_factors): the
   market/size/value/profitability/investment loadings and the factor-adjusted
   alpha give the risk-factor context the momentum sits in.
2. Jegadeesh-Titman (1993) — cross-time price momentum, LONG term (12-1) and
   SHORT/intermediate term (6-1), plus the 1-month short-term reversal.
3. Residual momentum (Blitz-Huij-Martens 2011) — momentum of the FF-regression
   residuals, standardised by their own vol: stock-specific momentum stripped of
   factor exposure, inherently risk-adjusted.
4. Risk-adjusted (Sharpe) momentum — the 12-1 return divided by trailing vol.
5. Volatility-scaled & crash-protected momentum (Barroso-Santa-Clara 2015) —
   momentum scaled to a target volatility, with a crash-risk gauge that damps the
   score in the high-volatility regimes where momentum historically crashes.

Data: monthly closes/returns (Yahoo) + the regional Ken French factors. Honest
about coverage: legs that lack data are omitted and the composite reweights.
"""

from __future__ import annotations

import math

from app.services import securities, taurus_factors

TARGET_VOL = 0.12   # Barroso-Santa-Clara target annual vol for the momentum leg


def _tanh(x: float) -> float:
    return math.tanh(x)


def _std(xs: list[float]) -> float:
    n = len(xs)
    if n < 2:
        return 0.0
    m = sum(xs) / n
    return math.sqrt(sum((x - m) ** 2 for x in xs) / (n - 1))


def _jt(closes: list[float], months: int, skip: int) -> float | None:
    """Jegadeesh-Titman cumulative return over `months`, skipping the most recent
    `skip` months (monthly close series, oldest→newest)."""
    n = len(closes)
    end = n - 1 - skip
    start = end - months
    if start < 0 or closes[start] <= 0:
        return None
    return closes[end] / closes[start] - 1.0


def _residual_momentum(monthly_returns: dict[int, float], region: str) -> float | None:
    """Momentum of the FF-regression residuals, standardised by their std over
    the formation window (t-12..t-1, skip most recent month)."""
    import numpy as np

    factors = taurus_factors.load_factors(region)
    if not factors:
        return None
    common = sorted(set(monthly_returns) & set(factors))
    if len(common) < taurus_factors.MIN_OBS:
        return None
    common = common[-taurus_factors.LOOKBACK_MONTHS:]
    has_umd = all("UMD" in factors[ym] for ym in common)
    cols = ["Mkt-RF", "SMB", "HML", "RMW", "CMA"] + (["UMD"] if has_umd else [])
    rf = np.array([factors[ym]["RF"] for ym in common])
    y = np.array([monthly_returns[ym] for ym in common]) - rf
    T = len(common)
    X = np.column_stack([np.ones(T)] + [[factors[ym][c] for ym in common] for c in cols])
    if T <= X.shape[1]:
        return None
    beta = np.linalg.pinv(X.T @ X) @ (X.T @ y)
    resid = (y - X @ beta).tolist()
    # Formation window: skip the most recent month (index -1).
    window = resid[-13:-1] if len(resid) >= 13 else resid[:-1]
    if len(window) < 6:
        return None
    s = _std(window)
    if s <= 0:
        return None
    return (sum(window) / len(window)) / s


def momentum_signal(symbol: str, currency: str) -> dict | None:
    """Full composite momentum signal for one security, or None if the price
    history is too short (indices/short-listed names)."""
    series = securities.fetch_monthly_series(symbol)      # (rets{yyyymm}, closes[])
    if series is None:
        return None
    monthly_returns, monthly_closes = series
    if len(monthly_closes) < 14:
        return None

    region = taurus_factors.region_for(currency)

    # --- 2. Jegadeesh-Titman price momentum ---
    mom_12_1 = _jt(monthly_closes, 11, 1)   # 12-1 long term
    mom_6_1 = _jt(monthly_closes, 5, 1)     # 6-1 short/intermediate term
    reversal_1m = monthly_closes[-1] / monthly_closes[-2] - 1.0 if monthly_closes[-2] > 0 else None

    # --- 4. Risk-adjusted (Sharpe) momentum ---
    recent = [monthly_returns[k] for k in sorted(monthly_returns)][-12:]
    monthly_vol = _std(recent) * math.sqrt(12) if len(recent) >= 6 else None
    sharpe_mom = (mom_12_1 / monthly_vol) if (mom_12_1 is not None and monthly_vol and monthly_vol > 0) else None

    # --- 5. Volatility-scaled & crash-protected (Barroso-Santa-Clara) ---
    chart = securities.fetch_chart(symbol, "6mo")
    realized_vol = None
    if chart and chart["points"]:
        closes_d = [p["c"] for p in chart["points"]]
        realized_vol = securities.annualised_vol(closes_d)
    vol_scaled = None
    scale = None
    if mom_12_1 is not None and realized_vol and realized_vol > 0:
        scale = max(0.0, min(TARGET_VOL / realized_vol, 2.0))
        vol_scaled = mom_12_1 * scale
    if realized_vol is None:
        crash_risk = "inconnu"
    elif realized_vol > 0.45:
        crash_risk = "élevé"
    elif realized_vol > 0.28:
        crash_risk = "modéré"
    else:
        crash_risk = "faible"

    # --- 3. Residual (factor-adjusted) momentum ---
    residual_mom = _residual_momentum(monthly_returns, region)

    # --- 1. FF5/FF6 factor regression (context + alpha) ---
    alpha = taurus_factors.compute_alpha(monthly_returns, region)

    # --- Composite: squash each leg to [-1,1], weight, reweight over present legs ---
    legs: list[tuple[str, float, float]] = []  # (key, score, weight)
    if mom_12_1 is not None:
        legs.append(("jt_long", _tanh(mom_12_1 / 0.30), 0.28))
    if mom_6_1 is not None:
        legs.append(("jt_short", _tanh(mom_6_1 / 0.20), 0.12))
    if residual_mom is not None:
        legs.append(("residual", _tanh(residual_mom / 1.0), 0.24))
    if sharpe_mom is not None:
        legs.append(("risk_adj", _tanh(sharpe_mom / 1.0), 0.18))
    if vol_scaled is not None:
        legs.append(("vol_scaled", _tanh(vol_scaled / 0.30), 0.12))
    if alpha is not None:
        legs.append(("ff_alpha", _tanh(alpha["alpha_tstat"] / 2.0), 0.06))
    # 1-month reversal enters with a NEGATIVE sign (short-term reversal effect).
    if reversal_1m is not None:
        legs.append(("reversal", _tanh(-reversal_1m / 0.10), 0.06))

    if not legs:
        return None
    wsum = sum(w for _, _, w in legs)
    raw = sum(s * w for _, s, w in legs) / wsum   # −1..+1

    # Crash protection: damp a POSITIVE score in high-vol regimes (momentum
    # crashes strike after volatile rebounds); leave negative scores intact.
    damp = {"élevé": 0.5, "modéré": 0.8}.get(crash_risk, 1.0)
    if raw > 0:
        raw *= damp
    score = round(raw * 100.0, 1)   # −100..+100

    if score >= 40:
        verdict = "fort"
    elif score >= 15:
        verdict = "positif"
    elif score > -15:
        verdict = "neutre"
    elif score > -40:
        verdict = "négatif"
    else:
        verdict = "faible"

    return {
        "symbol": symbol,
        "score": score,
        "verdict": verdict,
        "crash_risk": crash_risk,
        "components": {
            "jt_long_12_1": _pct(mom_12_1),
            "jt_short_6_1": _pct(mom_6_1),
            "reversal_1m": _pct(reversal_1m),
            "residual_momentum": _round(residual_mom),
            "sharpe_momentum": _round(sharpe_mom),
            "vol_scaled_momentum": _pct(vol_scaled),
            "vol_scale_factor": _round(scale),
            "realized_vol": _pct(realized_vol),
            "target_vol": TARGET_VOL,
        },
        "ff": {
            "model": alpha["model"] if alpha else None,
            "alpha_annual": alpha["alpha_annual"] if alpha else None,
            "alpha_tstat": alpha["alpha_tstat"] if alpha else None,
            "market_beta": alpha["betas"].get("Mkt-RF") if alpha else None,
            "umd_beta": (alpha["betas"].get("UMD") if alpha else None),
            "significant": alpha["significant"] if alpha else None,
            "region": region,
        },
        "legs": [{"key": k, "score": round(s, 3), "weight": w} for k, s, w in legs],
    }


def _pct(x: float | None) -> float | None:
    return round(x * 100.0, 2) if x is not None else None


def _round(x: float | None) -> float | None:
    return round(x, 3) if x is not None else None

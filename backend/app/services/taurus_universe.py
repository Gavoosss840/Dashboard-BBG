"""Taurus composite signal over a peer universe.

The Taurus trading signal is a cross-sectional composite:
    composite = w_alpha·z(alpha_tstat) + w_mm·z(divergence) + w_mom·z(momentum)
where each leg is z-scored (median / MAD, Taurus style) across the universe.

A single security can't be z-scored in isolation, so we compute the three legs
for a diversified **peer universe** per region, cache the cross-sectional
median/MAD of each leg for the day, and place any queried stock inside that
distribution. The batch runs in a background thread (it fetches monthly prices
+ fundamentals per peer); the alpha leg for the queried stock is always
available immediately.
"""

from __future__ import annotations

import threading
import time

from concurrent.futures import ThreadPoolExecutor

from app.services import securities, taurus, taurus_factors

# Taurus weights (taurus/config.py)
W_ALPHA = 0.40
W_MM = 0.30
W_MOMENTUM = 0.30
CLIP = 3.0

# Diversified peer universes per region (large, liquid names across sectors).
# Enough breadth for a stable cross-sectional median/MAD without an over-heavy
# batch. US set adapted from the Taurus repo's own S&P fallback.
PEERS: dict[str, list[str]] = {
    "US": [
        "AAPL", "MSFT", "NVDA", "AVGO", "AMD", "ADBE", "CRM", "ORCL", "CSCO",
        "GOOGL", "META", "NFLX", "DIS", "VZ", "AMZN", "TSLA", "MCD", "HD", "NKE",
        "PG", "COST", "KO", "PEP", "WMT", "LLY", "UNH", "JNJ", "ABBV", "MRK",
        "JPM", "BAC", "WFC", "GS", "V", "MA", "RTX", "CAT", "GE", "HON", "BA",
        "XOM", "CVX", "COP", "LIN", "NEE", "DUK", "PLD", "AMT",
    ],
    "Europe": [
        "MC.PA", "OR.PA", "RMS.PA", "TTE.PA", "SAN.PA", "AI.PA", "SU.PA", "EL.PA",
        "BNP.PA", "CS.PA", "DG.PA", "AIR.PA", "SAF.PA", "BN.PA", "KER.PA",
        "SAP.DE", "SIE.DE", "ALV.DE", "DTE.DE", "MBG.DE", "BAS.DE", "BMW.DE",
        "NESN.SW", "ROG.SW", "NOVN.SW", "SHEL.L", "AZN.L", "HSBA.L", "ULVR.L", "BP.L",
    ],
    "Japan": [
        "7203.T", "6758.T", "6861.T", "9984.T", "8306.T", "9432.T", "6098.T",
        "7974.T", "6501.T", "8035.T", "4063.T", "9433.T", "8058.T", "8001.T",
        "6902.T", "7267.T", "6367.T", "6954.T", "4568.T", "8316.T", "6702.T",
        "9983.T", "4661.T", "6273.T", "7741.T",
    ],
    "AsiaPacific": [
        "0700.HK", "0941.HK", "1299.HK", "0388.HK", "0005.HK", "1810.HK", "9988.HK",
        "3690.HK", "0883.HK", "0175.HK", "BHP.AX", "CBA.AX", "CSL.AX", "NAB.AX",
        "WBC.AX", "D05.SI", "O39.SI", "U11.SI",
    ],
}

# state per region: {"status": "building"|"ready"|"failed", "dist": {...}, "ts": float}
_state_lock = threading.Lock()
_state: dict[str, dict] = {}
_DIST_TTL = 24 * 3600


def _legs_for(symbol: str, region: str) -> dict | None:
    """Compute the three raw Taurus legs for one symbol. Returns
    {alpha_tstat, divergence, momentum} or None if data is incomplete."""
    series = securities.fetch_monthly_series(symbol)
    if series is None:
        return None
    monthly_returns, monthly_closes = series

    alpha = taurus_factors.compute_alpha(monthly_returns, region)
    mom = taurus.monthly_momentum(monthly_closes)
    if alpha is None or mom is None:
        return None

    # MM divergence needs fundamentals; reuse the monthly series for sigma.
    fund = securities.fetch_fundamentals(symbol)
    divergence = None
    if fund:
        v = fund.get("valuation", {})
        h = fund.get("health", {})
        p = fund.get("profitability", {})
        prof = fund.get("profile", {})
        market_cap = v.get("market_cap")
        pb = v.get("price_to_book")
        total_equity = market_cap / pb if market_cap and pb and pb > 0 else None
        if market_cap and h.get("total_debt") is not None and total_equity:
            monthly_rets = list(monthly_returns.values())
            sigma = None
            if len(monthly_rets) >= 6:
                mean = sum(monthly_rets) / len(monthly_rets)
                var = sum((r - mean) ** 2 for r in monthly_rets) / (len(monthly_rets) - 1)
                sigma = (var ** 0.5) * (12 ** 0.5)
            mm = taurus.mm_valuation(
                market_cap=market_cap, total_debt=h.get("total_debt") or 0.0,
                cash=h.get("total_cash") or 0.0, total_equity=total_equity,
                ebit=p.get("ebitda") or 0.0, interest_expense=0.0,
                tax_rate=taurus.DEFAULT_TAX_RATE, fcf=h.get("free_cashflow") or 0.0,
                sector=prof.get("sector") or "Unknown",
                sigma_equity=sigma or taurus.DEFAULT_SIGMA_EQUITY,
                beta_levered=v.get("beta"), growth=p.get("revenue_growth"),
            )
            if mm:
                divergence = mm["divergence_pct"]

    return {"alpha_tstat": alpha["alpha_tstat"], "divergence": divergence, "momentum": mom}


def signal_for(symbol: str, currency: str) -> dict | None:
    """Full Taurus signal for one security: the detailed FF5/6 alpha, the
    momentum score, the MM divergence, and the composite z-score placed within
    the peer-universe distribution. Returns None when the alpha can't be
    computed (e.g. an index or a too-recent listing)."""
    region = taurus_factors.region_for(currency)
    series = securities.fetch_monthly_series(symbol)
    if series is None:
        return None
    monthly_returns, monthly_closes = series

    alpha = taurus_factors.compute_alpha(monthly_returns, region)
    if alpha is None:
        return None
    mom = taurus.monthly_momentum(monthly_closes)

    # MM divergence: reuse the monthly series for the volatility estimate.
    divergence = None
    fund = securities.fetch_fundamentals(symbol)
    if fund:
        v = fund.get("valuation", {})
        h = fund.get("health", {})
        p = fund.get("profitability", {})
        prof = fund.get("profile", {})
        market_cap = v.get("market_cap")
        pb = v.get("price_to_book")
        total_equity = market_cap / pb if market_cap and pb and pb > 0 else None
        if market_cap and h.get("total_debt") is not None and total_equity:
            rets = list(monthly_returns.values())
            sigma = None
            if len(rets) >= 6:
                mean = sum(rets) / len(rets)
                var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
                sigma = (var ** 0.5) * (12 ** 0.5)
            mm = taurus.mm_valuation(
                market_cap=market_cap, total_debt=h.get("total_debt") or 0.0,
                cash=h.get("total_cash") or 0.0, total_equity=total_equity,
                ebit=p.get("ebitda") or 0.0, interest_expense=0.0,
                tax_rate=taurus.DEFAULT_TAX_RATE, fcf=h.get("free_cashflow") or 0.0,
                sector=prof.get("sector") or "Unknown",
                sigma_equity=sigma or taurus.DEFAULT_SIGMA_EQUITY,
                beta_levered=v.get("beta"), growth=p.get("revenue_growth"),
            )
            if mm:
                divergence = mm["divergence_pct"]

    legs = {"alpha_tstat": alpha["alpha_tstat"], "divergence": divergence, "momentum": mom}
    composite = compute_composite(legs, region)

    return {
        "region": region,
        "alpha": alpha,
        "momentum_score": mom,
        "divergence": divergence,
        "composite": composite,
    }


def _median_mad(values: list[float]) -> tuple[float, float]:
    s = sorted(values)
    n = len(s)
    med = s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) / 2
    devs = sorted(abs(x - med) for x in s)
    mad = devs[n // 2] if n % 2 else (devs[n // 2 - 1] + devs[n // 2]) / 2
    return med, mad


def _build_distribution(region: str) -> None:
    """Background: compute the three legs across the peer universe and store the
    cross-sectional median/MAD per leg."""
    peers = PEERS.get(region, PEERS["US"])
    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda s: _legs_for(s, region), peers))
    except Exception:
        results = []

    alphas = [r["alpha_tstat"] for r in results if r and r["alpha_tstat"] is not None]
    divs = [r["divergence"] for r in results if r and r["divergence"] is not None]
    moms = [r["momentum"] for r in results if r and r["momentum"] is not None]

    if len(alphas) < 8 or len(moms) < 8:
        with _state_lock:
            _state[region] = {"status": "failed", "ts": time.time()}
        return

    dist = {
        "alpha": _median_mad(alphas),
        "divergence": _median_mad(divs) if len(divs) >= 8 else None,
        "momentum": _median_mad(moms),
        "n_peers": len(alphas),
    }
    with _state_lock:
        _state[region] = {"status": "ready", "dist": dist, "ts": time.time()}


def get_distribution(region: str) -> dict:
    """Return {status, dist?} for a region, kicking off a background build when
    the cache is cold or stale."""
    with _state_lock:
        st = _state.get(region)
        if st and st["status"] == "ready" and time.time() - st["ts"] < _DIST_TTL:
            return st
        if st and st["status"] == "building":
            return st
        _state[region] = {"status": "building", "ts": time.time()}
    threading.Thread(target=_build_distribution, args=(region,), daemon=True).start()
    return {"status": "building"}


def _z(value: float, med_mad: tuple[float, float]) -> float:
    med, mad = med_mad
    if mad <= 0:
        return 0.0
    z = (value - med) / (mad * 1.4826)
    return max(-CLIP, min(CLIP, z))


def compute_composite(legs: dict, region: str) -> dict:
    """Combine the three legs into the Taurus composite z-score, using the
    cached peer distribution. Returns status 'building' when the universe isn't
    ready yet (the alpha leg is still returned to the caller separately)."""
    dist_state = get_distribution(region)
    if dist_state["status"] != "ready":
        return {"status": dist_state["status"]}

    dist = dist_state["dist"]
    z_alpha = _z(legs["alpha_tstat"], dist["alpha"]) if legs.get("alpha_tstat") is not None else None
    z_div = _z(legs["divergence"], dist["divergence"]) if (legs.get("divergence") is not None and dist["divergence"]) else None
    z_mom = _z(legs["momentum"], dist["momentum"]) if legs.get("momentum") is not None else None

    # Re-weight over the legs actually available so a missing MM leg doesn't
    # silently pull the composite toward zero.
    parts = []
    if z_alpha is not None:
        parts.append((W_ALPHA, z_alpha))
    if z_div is not None:
        parts.append((W_MM, z_div))
    if z_mom is not None:
        parts.append((W_MOMENTUM, z_mom))
    if not parts:
        return {"status": "ready", "composite": None}
    wsum = sum(w for w, _ in parts)
    composite = sum(w * z for w, z in parts) / wsum

    if composite >= 0.5:
        stance = "LONG"
    elif composite <= -0.5:
        stance = "SHORT"
    else:
        stance = "NEUTRE"

    return {
        "status": "ready",
        "composite": composite,
        "stance": stance,
        "z_alpha": z_alpha,
        "z_divergence": z_div,
        "z_momentum": z_mom,
        "weights": {"alpha": W_ALPHA, "mm": W_MM, "momentum": W_MOMENTUM},
        "n_peers": dist["n_peers"],
        "region": region,
    }

"""Taurus valuation engine — faithful port of the strategy's MM screen.

Source: Gavoosss840/Trading-strategy-Taurus, `taurus/capital_structure.py`
(Modigliani-Miller capital-structure valuation) and `taurus/momentum.py`
(vol-adjusted Sharpe momentum). The math below reproduces the original
strategy exactly, adapted to a single security valued from Yahoo fundamentals
at time T rather than a full cross-sectional universe.

The full Taurus trading signal is a cross-sectional composite:
    composite = w_alpha·z(alpha_tstat) + w_mm·z(divergence) + w_mom·z(mom)
The FF5/FF6 alpha term is a universe-ranking signal (60-month factor
regression over the whole index), not a per-stock point value — it is
produced by the batch pipeline, not here. What a single-name terminal can
compute faithfully is the **MM intrinsic valuation** (the divergence: is the
company over/under-valued right now, and by how much) plus the **vol-adjusted
momentum** as trend confirmation. Those two are ported below verbatim.
"""

from __future__ import annotations

import math

from scipy.stats import norm, t as _t_dist

# ---- Taurus config constants (taurus/config.py) ----
RISK_FREE_RATE_ANNUAL = 0.045
RETURN_DF = 5.0                 # Student-t degrees of freedom (fat tails)
LEVERAGE_GAP_THRESHOLD = 0.25   # 25% divergence to flag under/over-valued
MIN_INTEREST_COVERAGE = 1.5
DEFAULT_TAX_RATE = 0.21
DEFAULT_SIGMA_EQUITY = 0.30

# Industry-specific distress cost rates (taurus/capital_structure.py).
# Fraction of firm value destroyed in bankruptcy — intangible-heavy sectors
# lose more (IP, talent, contracts); asset-heavy sectors recover via liquidation.
SECTOR_DISTRESS_RATE: dict[str, float] = {
    "Information Technology": 0.40,
    "Technology": 0.40,             # Yahoo's label for the IT sector
    "Communication Services": 0.35,
    "Health Care": 0.35,
    "Healthcare": 0.35,             # Yahoo's label
    "Consumer Discretionary": 0.25,
    "Consumer Cyclical": 0.25,      # Yahoo's label
    "Consumer Staples": 0.20,
    "Consumer Defensive": 0.20,     # Yahoo's label
    "Industrials": 0.18,
    "Materials": 0.15,
    "Basic Materials": 0.15,        # Yahoo's label
    "Energy": 0.15,
    "Financials": 0.10,
    "Financial Services": 0.10,     # Yahoo's label
    "Real Estate": 0.08,
    "Utilities": 0.10,
    "Unknown": 0.20,
}


def _distress_rate(sector: str) -> float:
    return SECTOR_DISTRESS_RATE.get(sector, SECTOR_DISTRESS_RATE["Unknown"])


def _credit_spread(leverage_ratio: float) -> float:
    """Credit spread as a function of leverage D/E (taurus/capital_structure.py).
    D/E<0.5 ~100bps, D/E=1 ~200bps, D/E=2 ~400bps, capped 1000bps."""
    spread = 0.005 + 0.03 * min(leverage_ratio, 5.0)
    return float(min(max(spread, 0.005), 0.10))


def mm_valuation(
    *,
    market_cap: float,
    total_debt: float,
    cash: float,
    total_equity: float,
    ebit: float,
    interest_expense: float,
    tax_rate: float,
    fcf: float,
    sector: str,
    sigma_equity: float,
    rf: float = RISK_FREE_RATE_ANNUAL,
    return_df: float | None = RETURN_DF,
) -> dict | None:
    """Modigliani-Miller theoretical value for one stock. Faithful port of
    `taurus.capital_structure._mm_valuation`.

    VL = VU + PV(tax shield) − PV(distress) − PV(agency)
    divergence = (VL − market_cap) / market_cap  → over/under-valuation.
    """
    market_cap = float(market_cap or 0)
    total_debt = float(total_debt or 0)
    cash = float(cash or 0)
    total_equity = float(total_equity or 1)
    ebit = float(ebit or 0)
    interest_expense = float(interest_expense or 0)
    tax_rate = float(tax_rate or DEFAULT_TAX_RATE)
    fcf = float(fcf or 0)
    sigma_equity = float(sigma_equity or DEFAULT_SIGMA_EQUITY)
    sector = str(sector or "Unknown")

    if market_cap <= 0:
        return None

    # Net debt & enterprise value
    net_debt = max(total_debt - cash, 0.0)
    ev = market_cap + net_debt

    # 1. PV of the tax shield (impute a 5% coupon when interest is missing)
    if interest_expense == 0 and total_debt > 0:
        interest_expense = total_debt * 0.05
    annual_tax_shield = tax_rate * interest_expense
    leverage_ratio = total_debt / max(total_equity, 1.0)
    spread = _credit_spread(leverage_ratio)
    shield_discount = rf + spread
    pv_tax_shield = annual_tax_shield / shield_discount if shield_discount > 0 else 0.0

    # 2. Unlevered value
    vu = market_cap + net_debt - pv_tax_shield

    # 3. Financial distress costs via the Merton default model
    E = max(market_cap, 1.0)
    D = max(total_debt, 1.0)
    v_firm = max(ev, 1.0)
    sigma_assets = sigma_equity * (E / (E + D))   # de-lever equity vol
    T = 1.0
    try:
        d2 = (math.log(v_firm / D) + (rf - 0.5 * sigma_assets ** 2) * T) / (
            sigma_assets * math.sqrt(T)
        )
        if return_df is not None and return_df > 2:
            prob_default = float(_t_dist.cdf(-d2, df=return_df))
        else:
            prob_default = float(norm.cdf(-d2))
    except Exception:
        prob_default = 0.0
    distress_rate = _distress_rate(sector)
    pv_distress = prob_default * distress_rate * v_firm

    # 4. Agency costs of leverage and of excess free cash-flow
    agency_score = 0.0
    if leverage_ratio > 2.0:
        agency_score += (leverage_ratio - 2.0) * 0.05
    fcf_yield = abs(fcf) / market_cap if market_cap > 0 else 0.0
    if fcf_yield > 0.10:
        agency_score += (fcf_yield - 0.10) * 0.5
    pv_agency = agency_score * market_cap

    # 5. Levered theoretical value & divergence
    vl = vu + pv_tax_shield - pv_distress - pv_agency
    divergence_pct = (vl - market_cap) / market_cap * 100.0

    # interest coverage guard (forces overleveraged/SHORT when thin)
    ic_ratio = ebit / interest_expense if interest_expense > 0 else float("inf")
    threshold = LEVERAGE_GAP_THRESHOLD * 100
    underleveraged = divergence_pct > threshold
    overleveraged = divergence_pct < -threshold or ic_ratio < MIN_INTEREST_COVERAGE

    return {
        "vu": vu,
        "ev": ev,
        "net_debt": net_debt,
        "pv_tax_shield": pv_tax_shield,
        "pv_distress": pv_distress,
        "pv_agency": pv_agency,
        "vl_theoretical": vl,
        "divergence_pct": divergence_pct,
        "prob_default": prob_default,
        "credit_spread": spread,
        "distress_rate": distress_rate,
        "leverage_ratio": leverage_ratio,
        "ic_ratio": ic_ratio if math.isfinite(ic_ratio) else None,
        "underleveraged": underleveraged,
        "overleveraged": overleveraged,
        "sigma_assets": sigma_assets,
    }


def vol_adjusted_momentum(closes: list[float]) -> dict | None:
    """Vol-adjusted (Sharpe) momentum — port of `taurus.momentum`.

    Jegadeesh-Titman 12-month trailing return skipping the most recent month,
    divided by trailing volatility (Barroso & Santa-Clara 2015). `closes` is a
    daily close series (oldest→newest), ~1y. Returns raw momentum, annualised
    vol and the Sharpe-momentum score.
    """
    if not closes or len(closes) < 60:
        return None
    # 12M skip 1M on a daily series: skip last ~21 trading days, look back ~252
    skip = 21
    window = 252
    end = len(closes) - 1 - skip
    start = end - window + 1
    if start < 0:
        start = 0
    p_start = closes[start]
    p_end = closes[end]
    if p_start <= 0:
        return None
    mom_raw = p_end / p_start - 1.0

    # trailing annualised vol over the same window (daily → ×√252)
    seg = closes[start : end + 1]
    rets = [seg[i] / seg[i - 1] - 1.0 for i in range(1, len(seg)) if seg[i - 1] > 0]
    if len(rets) < 20:
        return {"mom_raw": mom_raw, "mom_vol": None, "mom_sharpe": None}
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    vol = math.sqrt(var) * math.sqrt(252)
    mom_sharpe = mom_raw / vol if vol > 0 else None
    return {"mom_raw": mom_raw, "mom_vol": vol, "mom_sharpe": mom_sharpe}

"""Valuation engine: is the security over- or under-valued right now?

Two engines share one output shape (so the UI renders both identically):

- **Taurus** (`app.services.taurus`) — the user's proprietary Modigliani-Miller
  capital-structure model, ported bit-for-bit from the Trading-strategy-Taurus
  repo. When the fundamentals needed for it are present, it is authoritative:
  the MM divergence *is* the over/under-valuation verdict, with its full
  decomposition (unlevered value, tax shield, distress, agency, default
  probability) plus vol-adjusted momentum as trend confirmation.

- **Standard blend** — a transparent fallback (analyst target, Graham,
  Lynch/PEG, DCF-lite) used when Taurus can't run (e.g. an index, an ETF, or a
  stock missing balance-sheet data).

Both return: model, fair_value, price, upside_pct, verdict, confidence,
components[]. The Taurus path additionally carries a `taurus` block with the
MM breakdown. Aide à la décision interne — pas un conseil d'investissement.
"""

from __future__ import annotations

from app.services import taurus

DISCOUNT_RATE = 0.09  # required return for the DCF-lite component
TERMINAL_GROWTH = 0.025
UNDERVALUED_THRESHOLD = 15.0  # % upside beyond which the standard blend calls it under-valued
OVERVALUED_THRESHOLD = -15.0


# --------------------------------------------------------------------------- #
#  Taurus MM valuation                                                          #
# --------------------------------------------------------------------------- #

def _verdict(upside_pct: float, threshold: float) -> str:
    if upside_pct >= threshold:
        return "undervalued"
    if upside_pct <= -threshold:
        return "overvalued"
    return "fair"


def compute_taurus_valuation(
    price: float,
    fundamentals: dict,
    sigma_equity: float | None,
    momentum_closes: list[float] | None,
) -> dict | None:
    """Run the Taurus MM engine on Yahoo fundamentals. Returns the full verdict
    dict, or None when the balance-sheet inputs are missing."""
    v = fundamentals.get("valuation", {})
    p = fundamentals.get("profitability", {})
    h = fundamentals.get("health", {})
    prof = fundamentals.get("profile", {})

    market_cap = v.get("market_cap")
    total_debt = h.get("total_debt")
    pb = v.get("price_to_book")
    # Book equity from market cap / price-to-book; both come from Yahoo.
    total_equity = market_cap / pb if market_cap and pb and pb > 0 else None
    if not market_cap or total_debt is None or total_equity is None:
        return None

    mm = taurus.mm_valuation(
        market_cap=market_cap,
        total_debt=total_debt,
        cash=h.get("total_cash") or 0.0,
        total_equity=total_equity,
        ebit=p.get("ebitda") or 0.0,          # EBITDA proxies EBIT for the coverage guard
        interest_expense=0.0,                  # imputed from debt inside the engine
        tax_rate=taurus.DEFAULT_TAX_RATE,
        fcf=h.get("free_cashflow") or 0.0,
        sector=prof.get("sector") or "Unknown",
        sigma_equity=sigma_equity or taurus.DEFAULT_SIGMA_EQUITY,
    )
    if mm is None:
        return None

    divergence = mm["divergence_pct"]
    fair_value = price * (1 + divergence / 100.0)
    threshold = taurus.LEVERAGE_GAP_THRESHOLD * 100  # 25%

    momentum = taurus.vol_adjusted_momentum(momentum_closes) if momentum_closes else None

    # Confidence from input completeness + how far the signal is from the band.
    have_real_vol = sigma_equity is not None
    have_fcf = bool(h.get("free_cashflow"))
    filled = sum([have_real_vol, have_fcf, bool(h.get("total_cash")), momentum is not None])
    confidence = ["faible", "moyenne", "bonne", "bonne", "élevée"][filled]

    return {
        "model": "taurus",
        "fair_value": fair_value,
        "price": price,
        "upside_pct": divergence,
        "verdict": _verdict(divergence, threshold),
        "threshold_pct": threshold,
        "confidence": confidence,
        "components": [
            {
                "key": "mm",
                "label": "Valeur théorique MM (Taurus)",
                "fair_value": fair_value,
                "weight": 1.0,
                "detail": "Modigliani-Miller: VE − coûts de détresse − coûts d'agence",
                "upside_pct": divergence,
            }
        ],
        "taurus": {
            "vl_theoretical": mm["vl_theoretical"],
            "market_cap": market_cap,
            "enterprise_value": mm["ev"],
            "net_debt": mm["net_debt"],
            "pv_tax_shield": mm["pv_tax_shield"],
            "pv_distress": mm["pv_distress"],
            "pv_agency": mm["pv_agency"],
            "prob_default": mm["prob_default"],
            "credit_spread": mm["credit_spread"],
            "distress_rate": mm["distress_rate"],
            "leverage_ratio": mm["leverage_ratio"],
            "ic_ratio": mm["ic_ratio"],
            "underleveraged": mm["underleveraged"],
            "overleveraged": mm["overleveraged"],
            "sigma_equity": sigma_equity,
            "sigma_assets": mm["sigma_assets"],
            "momentum": momentum,
        },
    }


# --------------------------------------------------------------------------- #
#  Standard transparent blend (fallback)                                        #
# --------------------------------------------------------------------------- #

def _standard_components(price: float, f: dict) -> list[dict]:
    v = f.get("valuation", {})
    p = f.get("profitability", {})
    h = f.get("health", {})
    o = f.get("ownership", {})
    a = f.get("analyst", {})
    out: list[dict] = []

    target = a.get("target_mean")
    if target and target > 0:
        n = a.get("num_analysts") or 0
        weight = 0.2 + 0.2 * min(n, 20) / 20
        out.append({
            "key": "analyst",
            "label": "Objectif analystes (12 mois)",
            "fair_value": float(target),
            "weight": weight,
            "detail": f"Objectif moyen de {n} analystes" if n else "Objectif moyen des analystes",
        })

    eps = p.get("eps")
    pb = v.get("price_to_book")
    if eps and eps > 0 and pb and 0 < pb <= 10:
        bvps = price / pb
        graham = (22.5 * eps * bvps) ** 0.5
        out.append({
            "key": "graham",
            "label": "Nombre de Graham (value)",
            "fair_value": graham,
            "weight": 0.2,
            "detail": f"√(22,5 × BPA {eps:.2f} × actif net/action {bvps:.2f})",
        })

    growth = p.get("earnings_growth")
    if eps and eps > 0 and growth and growth > 0:
        g_pct = max(5.0, min(growth * 100, 25.0))
        lynch = eps * g_pct
        out.append({
            "key": "lynch",
            "label": "Juste PEG = 1 (croissance)",
            "fair_value": lynch,
            "weight": 0.2,
            "detail": f"BPA {eps:.2f} × croissance retenue {g_pct:.0f}% (PEG 1)",
        })

    fcf = h.get("free_cashflow")
    shares = o.get("shares_outstanding")
    if fcf and fcf > 0 and shares and shares > 0:
        fcf_ps = fcf / shares
        g1 = p.get("revenue_growth")
        g1 = max(0.0, min(g1, 0.15)) if g1 is not None else 0.04
        value = 0.0
        cf = fcf_ps
        for year in range(1, 6):
            cf *= 1 + g1
            value += cf / (1 + DISCOUNT_RATE) ** year
        terminal = cf * (1 + TERMINAL_GROWTH) / (DISCOUNT_RATE - TERMINAL_GROWTH)
        value += terminal / (1 + DISCOUNT_RATE) ** 5
        out.append({
            "key": "dcf",
            "label": "DCF simplifié (FCF)",
            "fair_value": value,
            "weight": 0.25,
            "detail": f"FCF/action {fcf_ps:.2f}, croissance {g1 * 100:.0f}% 5 ans, actualisation {DISCOUNT_RATE * 100:.0f}%",
        })

    return out


def _standard_valuation(price: float, fundamentals: dict) -> dict | None:
    components = _standard_components(price, fundamentals)
    if not components:
        return None
    total_weight = sum(c["weight"] for c in components)
    fair_value = sum(c["fair_value"] * c["weight"] for c in components) / total_weight
    upside_pct = (fair_value / price - 1) * 100
    for c in components:
        c["upside_pct"] = (c["fair_value"] / price - 1) * 100
    return {
        "model": "standard",
        "fair_value": fair_value,
        "price": price,
        "upside_pct": upside_pct,
        "verdict": _verdict(upside_pct, UNDERVALUED_THRESHOLD),
        "threshold_pct": UNDERVALUED_THRESHOLD,
        "confidence": ["faible", "faible", "moyenne", "bonne", "élevée"][min(len(components), 4)],
        "components": components,
    }


# --------------------------------------------------------------------------- #
#  Public entry point                                                           #
# --------------------------------------------------------------------------- #

def compute_valuation(
    price: float,
    fundamentals: dict | None,
    sigma_equity: float | None = None,
    momentum_closes: list[float] | None = None,
) -> dict | None:
    """Taurus MM when its inputs are present, otherwise the standard blend."""
    if not fundamentals or not price or price <= 0:
        return None
    taurus_val = compute_taurus_valuation(price, fundamentals, sigma_equity, momentum_closes)
    if taurus_val is not None:
        return taurus_val
    return _standard_valuation(price, fundamentals)

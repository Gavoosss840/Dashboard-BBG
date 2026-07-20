"""Valuation engine: is the security over- or under-valued right now?

Produces a fair-value estimate, the upside/downside vs the current price and
a verdict. Component-based: each model contributes an estimate and a weight,
and the blend is a weighted average of whatever is computable for the ticker.

>>> TAURUS <<<
The proprietary Taurus model plugs in below (`taurus_components`). Until its
exact formulas are provided, it returns None and the engine falls back to the
transparent standard blend (analyst target, Graham, Lynch/PEG, DCF-lite).
The API response carries `model: "standard" | "taurus"` so the UI can label
which engine produced the verdict.
"""

from __future__ import annotations

DISCOUNT_RATE = 0.09  # required return for the DCF-lite component
TERMINAL_GROWTH = 0.025
UNDERVALUED_THRESHOLD = 15.0  # % upside beyond which we call it under-valued
OVERVALUED_THRESHOLD = -15.0


def taurus_components(price: float, f: dict) -> list[dict] | None:
    """Placeholder for the Taurus formulas (built in a separate working
    session). Replace the body with the real calculation; each returned
    component is {"key", "label", "fair_value", "weight", "detail"}.
    Returning None hands over to the standard blend."""
    return None


def _standard_components(price: float, f: dict) -> list[dict]:
    v = f.get("valuation", {})
    p = f.get("profitability", {})
    h = f.get("health", {})
    o = f.get("ownership", {})
    a = f.get("analyst", {})
    out: list[dict] = []

    # 1) Analyst consensus target — the market's forward view
    target = a.get("target_mean")
    if target and target > 0:
        n = a.get("num_analysts") or 0
        weight = 0.2 + 0.2 * min(n, 20) / 20  # more analysts, more weight
        out.append({
            "key": "analyst",
            "label": "Objectif analystes (12 mois)",
            "fair_value": float(target),
            "weight": weight,
            "detail": f"Objectif moyen de {n} analystes" if n else "Objectif moyen des analystes",
        })

    # 2) Revised Graham number: sqrt(22.5 × EPS × book value per share).
    # Skipped when P/B is extreme — buyback-shrunken book values make the
    # formula meaningless for asset-light compounders.
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

    # 3) Lynch fair value: growth stock is fairly priced at PEG = 1
    growth = p.get("earnings_growth")
    if eps and eps > 0 and growth and growth > 0:
        g_pct = max(5.0, min(growth * 100, 25.0))  # cap the exuberance
        lynch = eps * g_pct
        out.append({
            "key": "lynch",
            "label": "Juste PEG = 1 (croissance)",
            "fair_value": lynch,
            "weight": 0.2,
            "detail": f"BPA {eps:.2f} × croissance retenue {g_pct:.0f}% (PEG 1)",
        })

    # 4) DCF-lite on free cash-flow per share
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


def compute_valuation(price: float, fundamentals: dict | None) -> dict | None:
    """Blend whatever components are computable into one verdict."""
    if not fundamentals or not price or price <= 0:
        return None

    components = taurus_components(price, fundamentals)
    model = "taurus"
    if components is None:
        components = _standard_components(price, fundamentals)
        model = "standard"
    if not components:
        return None

    total_weight = sum(c["weight"] for c in components)
    fair_value = sum(c["fair_value"] * c["weight"] for c in components) / total_weight
    upside_pct = (fair_value / price - 1) * 100

    if upside_pct >= UNDERVALUED_THRESHOLD:
        verdict = "undervalued"
    elif upside_pct <= OVERVALUED_THRESHOLD:
        verdict = "overvalued"
    else:
        verdict = "fair"

    for c in components:
        c["upside_pct"] = (c["fair_value"] / price - 1) * 100

    return {
        "model": model,
        "fair_value": fair_value,
        "price": price,
        "upside_pct": upside_pct,
        "verdict": verdict,
        # 4 components = full read; fewer = partial data, temper the signal
        "confidence": ["faible", "faible", "moyenne", "bonne", "élevée"][min(len(components), 4)],
        "components": components,
    }

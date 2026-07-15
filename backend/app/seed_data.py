"""Deterministic mock-data generator for Boulet Capital's internal terminal.

All figures are illustrative placeholders (NOT real market data / real client
data) meant to make every module of the terminal exercisable end to end.
Swap this out for real IBKR feeds and a real client ledger once available.
"""

from __future__ import annotations

import datetime as dt
import math
import random

from sqlalchemy.orm import Session

from app import models
from app.utils import AS_OF, business_days_between

random.seed(42)

FX_RATES_VS_USD = {
    "USD": 1.0,
    "EUR": 0.92,
    "CHF": 0.81,
    "HKD": 7.80,
    "JPY": 149.0,
    "GBP": 0.77,
    "AED": 3.67,
}


def _bridged_walk(start_value: float, end_value: float, n_days: int, daily_vol: float) -> list[float]:
    """Random walk from start_value to end_value with a plausible daily wiggle."""
    if n_days <= 1:
        return [end_value]
    raw = [start_value]
    for _ in range(n_days - 1):
        shock = random.gauss(0, daily_vol)
        raw.append(raw[-1] * (1 + shock))
    path = []
    for i, val in enumerate(raw):
        frac = i / (n_days - 1)
        correction = 1 + frac * (end_value / raw[-1] - 1)
        path.append(val * correction)
    return path


def seed(db: Session) -> None:
    if db.query(models.User).count() > 0:
        return  # already seeded

    # ---------------- FX ----------------
    for ccy, rate in FX_RATES_VS_USD.items():
        db.add(models.FXRate(ccy=ccy, rate_vs_usd=rate, updated_at=dt.datetime.combine(AS_OF, dt.time(8, 0))))

    # ---------------- Users (associates) ----------------
    users = [
        models.User(
            name="Hugo Boulet",
            email="hugo.boulet1@outlook.com",
            role="admin",
            title="Founder & Portfolio Manager",
            phone="+33 6 00 00 00 01",
            avatar_initials="HB",
            joined_date=dt.date(2022, 1, 1),
            bio="Fondateur de Boulet Capital. Gestion discrétionnaire actions + arbitrage algorithmique.",
        ),
        models.User(
            name="Claire Fontaine",
            email="claire.fontaine@bouletcapital.com",
            role="associate",
            title="Client Relationship & Compliance",
            phone="+33 6 00 00 00 02",
            avatar_initials="CF",
            joined_date=dt.date(2024, 3, 1),
            bio="Suivi clients, KYC/AML, reporting.",
        ),
        models.User(
            name="Marco Rossi",
            email="marco.rossi@bouletcapital.com",
            role="analyst",
            title="Quant Analyst - Arbitrage Desk",
            phone="+41 79 000 00 03",
            avatar_initials="MR",
            joined_date=dt.date(2025, 6, 1),
            bio="Développement et suivi des stratégies d'arbitrage algorithmique.",
        ),
    ]
    db.add_all(users)
    db.flush()
    hugo, claire, marco = users

    # ---------------- Clients ----------------
    client_defs = [
        dict(name="Marc Dupont", client_type="individual", entry_date=dt.date(2022, 1, 5),
             base_currency="EUR", country="France", deposit=850_000, ann_return=0.11, vol=0.14,
             bucket="stock_picking"),
        dict(name="Jean-Marc Lefèvre", client_type="individual", entry_date=dt.date(2023, 3, 1),
             base_currency="EUR", country="France", deposit=1_200_000, ann_return=0.09, vol=0.13,
             bucket="mixed"),
        dict(name="Sophie Bernard", client_type="individual", entry_date=dt.date(2023, 9, 15),
             base_currency="CHF", country="Suisse", deposit=2_000_000, ann_return=0.075, vol=0.09,
             bucket="algo_arbitrage"),
        dict(name="Thomas Weber", client_type="individual", entry_date=dt.date(2024, 1, 10),
             base_currency="USD", country="Etats-Unis", deposit=650_000, ann_return=0.13, vol=0.18,
             bucket="stock_picking"),
        dict(name="Al Rashid Holdings", client_type="entity", entry_date=dt.date(2024, 6, 1),
             base_currency="AED", country="Emirats Arabes Unis", deposit=3_500_000, ann_return=0.08,
             vol=0.10, bucket="mixed"),
        dict(name="Chen Wei", client_type="individual", entry_date=dt.date(2024, 11, 20),
             base_currency="HKD", country="Hong Kong", deposit=900_000, ann_return=0.10, vol=0.16,
             bucket="stock_picking"),
        dict(name="Family Office Nakamura", client_type="entity", entry_date=dt.date(2025, 2, 14),
             base_currency="JPY", country="Japon", deposit=280_000_000, ann_return=0.065, vol=0.08,
             bucket="algo_arbitrage"),
        dict(name="Oliver Whitfield", client_type="individual", entry_date=dt.date(2025, 5, 1),
             base_currency="GBP", country="Royaume-Uni", deposit=480_000, ann_return=0.095, vol=0.15,
             bucket="mixed"),
    ]

    equity_universe = [
        ("AAPL", "Apple Inc.", "Technology", "North America", "USD"),
        ("MSFT", "Microsoft Corp.", "Technology", "North America", "USD"),
        ("NVDA", "NVIDIA Corp.", "Technology", "North America", "USD"),
        ("ASML", "ASML Holding", "Technology", "Europe", "EUR"),
        ("NESN", "Nestlé SA", "Consumer Staples", "Europe", "CHF"),
        ("MC", "LVMH", "Consumer Discretionary", "Europe", "EUR"),
        ("0700", "Tencent Holdings", "Technology", "Asia", "HKD"),
        ("7203", "Toyota Motor Corp.", "Industrials", "Asia", "JPY"),
        ("SHEL", "Shell Plc", "Energy", "Europe", "GBP"),
        ("JPM", "JPMorgan Chase", "Financials", "North America", "USD"),
        ("SPY", "SPDR S&P 500 ETF", "Diversified", "North America", "USD"),
        ("GLD", "SPDR Gold Shares", "Commodities", "Global", "USD"),
        ("BTC", "Bitcoin", "Crypto", "Global", "USD"),
    ]

    clients: list[models.Client] = []
    portfolios: list[models.Portfolio] = []
    ptf_counter = 8890120

    for idx, cdef in enumerate(client_defs):
        rm = claire if idx % 2 == 0 else hugo
        client = models.Client(
            name=cdef["name"],
            client_type=cdef["client_type"],
            status="active",
            entry_date=cdef["entry_date"],
            base_currency=cdef["base_currency"],
            country=cdef["country"],
            email=f"contact@{cdef['name'].lower().replace(' ', '').replace(chr(232),'e')}.example",
            phone="+00 0 00 00 00 00",
            risk_profile=random.choice(["conservative", "balanced", "growth"]),
            kyc_status="verified",
            relationship_manager=rm,
            notes="",
        )
        db.add(client)
        db.flush()
        clients.append(client)

        # Mandate
        mgmt_fee = round(random.uniform(1.0, 2.0), 2)
        perf_fee = round(random.uniform(10.0, 20.0), 1)
        mandate = models.Mandate(
            client_id=client.id,
            mandate_type="discretionary",
            status="active",
            signing_date=cdef["entry_date"],
            renewal_date=dt.date(cdef["entry_date"].year + 2, cdef["entry_date"].month, min(cdef["entry_date"].day, 28)) if cdef["entry_date"].year + 2 <= 2027 else None,
            mgmt_fee_pct=mgmt_fee,
            perf_fee_pct=perf_fee,
            hurdle_rate_pct=random.choice([0.0, 0.0, 3.0, 5.0]),
            high_water_mark=cdef["deposit"],
            benchmark=random.choice(["MSCI World", "S&P 500", "SMI", "Cash + 3%"]),
            notice_period_days=random.choice([30, 60, 90]),
            document_ref=f"MND-{client.id:04d}-{cdef['entry_date'].year}",
        )
        db.add(mandate)

        # Portfolio
        ptf_counter += random.randint(3, 97)
        portfolio = models.Portfolio(
            ptf_id=f"U{ptf_counter}",
            client_id=client.id,
            base_currency=cdef["base_currency"],
            strategy_bucket=cdef["bucket"],
            custodian="Interactive Brokers",
            inception_nav=cdef["deposit"],
        )
        db.add(portfolio)
        db.flush()
        portfolios.append(portfolio)

        # Initial deposit cash flow
        db.add(models.CashFlow(
            client_id=client.id, date=cdef["entry_date"], flow_type="deposit",
            amount=cdef["deposit"], currency=cdef["base_currency"],
        ))
        # A top-up for some clients
        if idx % 3 == 0:
            topup_date = cdef["entry_date"] + dt.timedelta(days=250)
            if topup_date < AS_OF:
                topup = round(cdef["deposit"] * random.uniform(0.1, 0.3), -2)
                db.add(models.CashFlow(
                    client_id=client.id, date=topup_date, flow_type="deposit",
                    amount=topup, currency=cdef["base_currency"],
                ))

        # Positions: pick 4-7 tickers, sized in the portfolio's base currency
        n_positions = random.randint(4, 7)
        chosen = random.sample(equity_universe, n_positions)
        remaining = cdef["deposit"] * random.uniform(0.92, 1.05)
        weights = [random.random() for _ in chosen]
        wsum = sum(weights)
        target_end_value = 0.0
        for (ticker, name, sector, region, ccy), w in zip(chosen, weights):
            alloc_base_ccy = remaining * (w / wsum)
            # convert allocation from portfolio base ccy to position currency
            alloc_pos_ccy = alloc_base_ccy / FX_RATES_VS_USD[cdef["base_currency"]] * FX_RATES_VS_USD[ccy]
            price = round(random.uniform(20, 900), 2) if ticker != "BTC" else round(random.uniform(55000, 120000), 2)
            qty = round(alloc_pos_ccy / price, 4)
            cost_drift = random.uniform(-0.18, 0.22)
            avg_cost = round(price / (1 + cost_drift), 2)
            db.add(models.Position(
                portfolio_id=portfolio.id, ticker=ticker, name=name, asset_class=(
                    "crypto" if ticker == "BTC" else "etf" if ticker in ("SPY", "GLD") else "equity"
                ), sector=sector, region=region, currency=ccy,
                quantity=qty, avg_cost=avg_cost, last_price=price,
            ))
            mv_base_ccy = qty * price / FX_RATES_VS_USD[ccy] * FX_RATES_VS_USD[cdef["base_currency"]]
            target_end_value += mv_base_ccy

        # NAV history: bridged random walk from inception to today, ending near target_end_value
        days = business_days_between(cdef["entry_date"], AS_OF)
        n = len(days)
        daily_vol = cdef["vol"] / math.sqrt(252)
        path = _bridged_walk(cdef["deposit"], max(target_end_value, cdef["deposit"] * 0.5), n, daily_vol)
        # only keep every 3rd point for the first 2 years to limit row count, weekly-ish after that
        for i, (day, nav) in enumerate(zip(days, path)):
            if n > 500 and i % 3 != 0 and i != n - 1:
                continue
            db.add(models.NavHistory(portfolio_id=portfolio.id, date=day, nav=round(nav, 2)))

        # Fee transactions: quarterly management fee since entry, plus perf fee at each year-end
        q_date = cdef["entry_date"]
        approx_nav = cdef["deposit"]
        while q_date < AS_OF:
            q_date = q_date + dt.timedelta(days=91)
            if q_date > AS_OF:
                break
            fee_amount = round(approx_nav * (mgmt_fee / 100) / 4, 2)
            status = "paid" if (AS_OF - q_date).days > 30 else random.choice(["invoiced", "pending"])
            db.add(models.Transaction(
                client_id=client.id, transaction_type="management_fee", amount=fee_amount,
                currency=cdef["base_currency"], status=status, issue_date=q_date,
                due_date=q_date + dt.timedelta(days=30),
                paid_date=q_date + dt.timedelta(days=random.randint(2, 25)) if status == "paid" else None,
                invoice_ref=f"INV-{client.id:04d}-{q_date.strftime('%Y%m%d')}",
                description=f"Frais de gestion T{((q_date.month - 1) // 3) + 1} {q_date.year}",
            ))
            approx_nav *= (1 + cdef["ann_return"] / 4)

        if target_end_value > cdef["deposit"]:
            perf_gain = target_end_value - cdef["deposit"]
            perf_amount = round(perf_gain * (perf_fee / 100), 2)
            db.add(models.Transaction(
                client_id=client.id, transaction_type="performance_fee", amount=perf_amount,
                currency=cdef["base_currency"], status="draft", issue_date=AS_OF,
                due_date=AS_OF + dt.timedelta(days=30), paid_date=None,
                invoice_ref=f"INV-PERF-{client.id:04d}-{AS_OF.year}",
                description=f"Performance fee (estimée, {AS_OF.year})",
            ))

    db.flush()

    # ---------------- CRM pipeline ----------------
    crm_defs = [
        dict(name="Isabelle Moreau", contact_type="prospect", stage="negotiation", source="Introducer - Genève",
             estimated_aum=1_500_000, currency="CHF", owner=hugo, next_action="Envoyer proposition de mandat",
             next_action_date=AS_OF + dt.timedelta(days=5)),
        dict(name="Ahmed Al Farsi", contact_type="prospect", stage="meeting", source="Réseau EAM Dubai",
             estimated_aum=4_000_000, currency="AED", owner=hugo, next_action="Call de suivi",
             next_action_date=AS_OF + dt.timedelta(days=10)),
        dict(name="Laurent Girard", contact_type="prospect", stage="lead", source="LinkedIn",
             estimated_aum=300_000, currency="EUR", owner=claire, next_action="Qualifier le besoin",
             next_action_date=AS_OF + dt.timedelta(days=3)),
        dict(name="Priya Nair", contact_type="prospect", stage="contacted", source="Conférence Londres",
             estimated_aum=800_000, currency="GBP", owner=claire, next_action="Envoyer track record",
             next_action_date=AS_OF + dt.timedelta(days=7)),
        dict(name="Fund Placement Partners Ltd", contact_type="introducer", stage="onboarded", source="Direct",
             estimated_aum=0, currency="USD", owner=hugo, next_action="Revue trimestrielle partenariat",
             next_action_date=AS_OF + dt.timedelta(days=45)),
        dict(name="Kenji Watanabe", contact_type="prospect", stage="lost", source="Salon patrimonial Tokyo",
             estimated_aum=600_000, currency="JPY", owner=claire, next_action="Relancer dans 6 mois",
             next_action_date=AS_OF + dt.timedelta(days=180)),
    ]
    for c in crm_defs:
        db.add(models.CrmContact(
            name=c["name"], contact_type=c["contact_type"], stage=c["stage"], source=c["source"],
            estimated_aum=c["estimated_aum"], currency=c["currency"], owner=c["owner"],
            next_action=c["next_action"], next_action_date=c["next_action_date"],
            last_contact_date=AS_OF - dt.timedelta(days=random.randint(1, 20)),
            notes="",
        ))

    # ---------------- Watchlist ----------------
    for ticker, name, sector, region, ccy in equity_universe:
        db.add(models.WatchlistItem(
            ticker=ticker, name=name, asset_class=(
                "crypto" if ticker == "BTC" else "etf" if ticker in ("SPY", "GLD") else "equity"
            ), currency=ccy,
            last_price=round(random.uniform(20, 900), 2) if ticker != "BTC" else round(random.uniform(55000, 120000), 2),
            day_change_pct=round(random.uniform(-3.5, 3.5), 2),
            target_price=None,
            added_by=random.choice([hugo, marco]),
            notes="", tags=sector,
        ))

    # ---------------- News ----------------
    news_defs = [
        ("La Fed maintient ses taux, marchés en légère hausse", "Reuters", "monetary policy"),
        ("Saison des résultats T2: les megacaps tech au rendez-vous", "Bloomberg", "AAPL,MSFT,NVDA"),
        ("Le secteur du luxe résiste malgré le ralentissement chinois", "Les Echos", "MC"),
        ("Volatilité en baisse: le VIX proche de ses plus bas annuels", "CNBC", "SPY"),
        ("Bitcoin franchit un nouveau seuil psychologique", "CoinDesk", "BTC"),
        ("Le yen sous pression, la BoJ sous surveillance", "Nikkei", "7203"),
        ("Tensions énergétiques: le pétrole en hausse", "FT", "SHEL"),
        ("Les banques centrales du Golfe suivent la Fed", "Gulf Business", ""),
    ]
    for i, (headline, source, tickers) in enumerate(news_defs):
        db.add(models.NewsItem(
            headline=headline, summary=f"{headline}. Résumé synthétique généré pour le module actualités (donnée de démonstration).",
            source=source, url="https://example.com/news", published_at=dt.datetime.combine(
                AS_OF - dt.timedelta(days=i), dt.time(random.randint(7, 19), random.choice([0, 15, 30, 45]))
            ), tickers=tickers, sentiment=random.choice(["positive", "neutral", "negative"]),
        ))

    # ---------------- Earnings calendar ----------------
    earnings_tickers = ["AAPL", "MSFT", "NVDA", "ASML", "JPM", "0700", "SHEL"]
    for i, ticker in enumerate(earnings_tickers):
        event_date = AS_OF + dt.timedelta(days=[-6, -2, 3, 5, 9, 14, 21][i])
        db.add(models.EarningsEvent(
            ticker=ticker, company=next(n for t, n, *_ in equity_universe if t == ticker),
            event_date=event_date, time_of_day=random.choice(["BMO", "AMC"]),
            eps_estimate=round(random.uniform(0.5, 6.0), 2),
            eps_actual=round(random.uniform(0.5, 6.0), 2) if event_date <= AS_OF else None,
            revenue_estimate_m=round(random.uniform(500, 90000), 1),
            revenue_actual_m=round(random.uniform(500, 90000), 1) if event_date <= AS_OF else None,
            alert_enabled=True,
            held_in_portfolio=True,
        ))

    # ---------------- Reference / glossary ----------------
    reference_defs = [
        ("fees", "Management Fee", "Frais de gestion annuel prélevé sur l'AUM, facturé pro-rata temporis (généralement trimestriellement). Typiquement 1%-2%/an dans ce book."),
        ("fees", "Performance Fee", "Commission de surperformance prélevée sur les gains au-delà du High-Water Mark (et du Hurdle Rate si applicable). Typiquement 10%-20%."),
        ("fees", "High-Water Mark (HWM)", "Plus haute valeur liquidative jamais atteinte par le portefeuille du client. La performance fee ne s'applique que sur les gains dépassant ce seuil."),
        ("fees", "Hurdle Rate", "Taux de rendement minimum que le portefeuille doit dépasser avant que la performance fee ne s'applique."),
        ("glossary", "NAV (Net Asset Value)", "Valeur liquidative du portefeuille = valeur de marché des positions + cash."),
        ("glossary", "TWR (Time-Weighted Return)", "Rendement neutralisant l'effet des flux de capitaux (dépôts/retraits), utilisé pour comparer la performance de gestion pure."),
        ("glossary", "IRR (Internal Rate of Return)", "Taux de rendement tenant compte du timing des flux de capitaux, utilisé pour la performance perçue par le client."),
        ("glossary", "Drawdown", "Baisse depuis le dernier plus haut de la NAV, exprimée en %."),
        ("glossary", "Sharpe Ratio", "Rendement excédentaire par unité de risque (volatilité)."),
        ("glossary", "Risk Parity / ERC", "Allocation de capital telle que chaque poche contribue à parts égales au risque total du portefeuille global."),
        ("procedure", "Onboarding client", "1) KYC/AML, 2) Signature du mandat de gestion, 3) Ouverture compte custodian (IBKR), 4) Dépôt initial, 5) Paramétrage du portefeuille."),
        ("procedure", "Cycle de facturation", "Frais de gestion facturés trimestriellement à terme échu. Performance fee calculée annuellement (ou au retrait) sur gains au-dessus du HWM."),
        ("legal", "Mandat discrétionnaire vs conseil", "Discrétionnaire: le gérant décide et exécute. Conseil (advisory): le gérant recommande, le client valide chaque opération."),
    ]
    for category, title, content in reference_defs:
        db.add(models.ReferenceEntry(category=category, title=title, content=content, tags=category))

    # ---------------- Allocation buckets (risk parity) ----------------
    bucket_defs = [
        ("Stock Picking", "stock_picking", 0.0009, 0.018, "#3b82f6"),
        ("Arbitrage Algorithmique", "algo_arbitrage", 0.0004, 0.006, "#22c55e"),
    ]
    for name, key, mu, sigma, color in bucket_defs:
        # AUM is recomputed live from portfolio market values by the allocation router.
        bucket = models.AllocationBucket(name=name, aum=0.0, currency="USD", lookback_days=60, color=color)
        db.add(bucket)
        db.flush()
        for i in range(180):
            day = AS_OF - dt.timedelta(days=179 - i)
            if day.weekday() >= 5:
                continue
            ret = random.gauss(mu, sigma) * 100
            db.add(models.AllocationReturn(bucket_id=bucket.id, date=day, daily_return_pct=round(ret, 4)))

    db.commit()

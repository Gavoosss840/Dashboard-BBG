from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app import models
from app.database import get_db
from app.services import securities, taurus_universe, valuation

router = APIRouter(prefix="/api/securities", tags=["securities"])


def _root_symbol(symbol: str) -> str:
    """IBKR/display tickers don't carry Yahoo suffixes: '0700.HK' -> '0700'."""
    return symbol.split(".")[0].upper()


@router.get("/search")
def search_securities(q: str = Query(..., min_length=1)):
    return securities.search(q)


@router.get("/markets")
def markets_overview():
    """Global market snapshot: indices, FX, commodities, crypto, US rates."""
    return securities.market_overview()


@router.get("/metrics")
def security_metrics(symbols: str = Query(..., description="Comma-separated Yahoo symbols")):
    """Configurable-column metrics (P/E, beta, margins, dividend yield...) for a
    set of symbols. Powers the custom columns on the watchlist and portfolios."""
    wanted = [s.strip() for s in symbols.split(",") if s.strip()][:60]
    return securities.metrics_for(wanted)


@router.get("/news")
def live_news(db: Session = Depends(get_db)):
    """Aggregated latest headlines for the whole watchlist."""
    items = db.query(models.WatchlistItem).all()
    symbols = [(item.data_symbol or item.ticker) for item in items]
    return securities.aggregate_news(symbols)


@router.get("/tape")
def ticker_tape(db: Session = Depends(get_db)):
    """Quotes for every watchlist item, for the scrolling tape."""
    items = db.query(models.WatchlistItem).order_by(models.WatchlistItem.ticker).all()
    symbols = [(item.data_symbol or item.ticker) for item in items]
    quotes = securities.fetch_quotes(symbols)
    out = []
    for item, symbol in zip(items, symbols):
        quote = quotes.get(symbol)
        if quote is None:
            out.append({
                "symbol": symbol, "display": item.ticker,
                "price": item.last_price, "change_pct": item.day_change_pct,
                "currency": item.currency, "stale": True,
            })
        else:
            out.append({
                "symbol": symbol, "display": item.ticker,
                "price": quote["price"], "change_pct": quote["change_pct"],
                "currency": quote["currency"], "stale": False,
            })
    return out


@router.get("/{symbol}/chart")
def security_chart(symbol: str, range: str = Query("1mo")):
    chart = securities.fetch_chart(symbol, range)
    if chart is None:
        raise HTTPException(status_code=404, detail=f"Pas de données graphique pour {symbol} (période {range}).")
    return chart


@router.get("/{symbol}/quote")
def security_quote(symbol: str):
    quote = securities.fetch_quote(symbol)
    if quote is None:
        raise HTTPException(status_code=404, detail=f"Titre introuvable: {symbol}")
    return quote


@router.get("/{symbol}/taurus-signal")
def taurus_signal(symbol: str):
    """Full Taurus composite signal: FF5/6 alpha, momentum, MM divergence and
    the composite z-score vs the peer universe. The composite may report
    status 'building' while the universe batch runs — poll again shortly."""
    quote = securities.fetch_quote(symbol)
    if quote is None:
        raise HTTPException(status_code=404, detail=f"Titre introuvable: {symbol}")
    signal = taurus_universe.signal_for(symbol, quote["currency"])
    if signal is None:
        raise HTTPException(
            status_code=422,
            detail="Signal Taurus indisponible pour cet instrument (indice, ETF, ou historique insuffisant).",
        )
    return signal


@router.get("/{symbol}/overview")
def security_overview(symbol: str, db: Session = Depends(get_db)):
    quote = securities.fetch_quote(symbol)
    if quote is None:
        raise HTTPException(status_code=404, detail=f"Titre introuvable: {symbol}")

    fundamentals = securities.fetch_fundamentals(symbol)
    # RSS headline feed, scoped to this exact ticker — the v1 search endpoint
    # returns generic market news for non-US symbols.
    news = securities.fetch_ticker_news(symbol, limit=12)

    # Taurus MM valuation needs realised volatility and a momentum series; a 1y
    # daily chart supplies both (cached, so this is cheap on repeat views).
    sigma_equity = None
    momentum_closes = None
    chart = securities.fetch_chart(symbol, "1y")
    if chart and chart["points"]:
        momentum_closes = [pt["c"] for pt in chart["points"]]
        sigma_equity = securities.annualised_vol(momentum_closes)
    valuation_result = valuation.compute_valuation(
        quote["price"], fundamentals, sigma_equity=sigma_equity, momentum_closes=momentum_closes
    )

    # Cross-reference with internal portfolios (positions use the IBKR/display ticker).
    # Filtered at the DB level, not loaded-then-filtered-in-Python — a large
    # IBKR-synced book can hold thousands of position rows platform-wide, and
    # this endpoint is hit on every security page view.
    root = _root_symbol(symbol)
    positions = (
        db.query(models.Position)
        .filter(func.upper(models.Position.ticker) == root)
        .options(joinedload(models.Position.portfolio).joinedload(models.Portfolio.client))
        .all()
    )
    holdings = []
    total_qty = 0.0
    for pos in positions:
        client = pos.portfolio.client if pos.portfolio else None
        holdings.append({
            "client_id": client.id if client else None,
            "client_name": client.name if client else "?",
            "ptf_id": pos.portfolio.ptf_id if pos.portfolio else "",
            "quantity": pos.quantity,
            "avg_cost": pos.avg_cost,
            "currency": pos.currency,
        })
        total_qty += pos.quantity

    watch = (
        db.query(models.WatchlistItem)
        .filter(
            (models.WatchlistItem.data_symbol == symbol)
            | (models.WatchlistItem.ticker == root)
        )
        .first()
    )

    return {
        "quote": quote,
        "fundamentals": fundamentals,
        "valuation": valuation_result,
        "news": news,
        "holdings": holdings,
        "total_quantity": total_qty,
        "in_watchlist": watch is not None,
        "watchlist_item_id": watch.id if watch else None,
    }

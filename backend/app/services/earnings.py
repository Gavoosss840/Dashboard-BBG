"""Live earnings calendar, sourced from Yahoo for every watchlist ticker.

Unlike a manually-seeded calendar, this tracks the platform's actual
watchlist: for each item, the next reported earnings date (Yahoo's
calendarEvents) is upserted into EarningsEvent — moving the date if it
shifted, never duplicating a ticker's upcoming event. The consensus EPS and
revenue estimates from the same calendarEvents block are stored alongside;
Yahoo still doesn't reliably expose the BMO/AMC time slot, so that stays "?".
"""

from __future__ import annotations

import datetime as dt

from sqlalchemy.orm import Session

from app import models
from app.services import securities


def sync_earnings_from_watchlist(db: Session) -> models.SyncLog:
    log = models.SyncLog(kind="earnings", started_at=dt.datetime.utcnow())
    db.add(log)
    db.commit()

    try:
        items = db.query(models.WatchlistItem).all()
        today = dt.date.today()
        updated = 0
        skipped: list[str] = []

        for item in items:
            symbol = item.data_symbol or item.ticker
            fundamentals = securities.fetch_fundamentals(symbol)
            calendar = fundamentals.get("calendar", {}) if fundamentals else {}
            ts = calendar.get("next_earnings_date")
            if not ts:
                skipped.append(symbol)
                continue
            event_date = dt.date.fromtimestamp(ts)
            if event_date < today:
                skipped.append(symbol)
                continue

            eps_estimate = calendar.get("eps_estimate")
            rev_estimate = calendar.get("revenue_estimate")
            # Yahoo reports revenue estimate in raw currency units; the model and
            # UI use millions.
            rev_estimate_m = rev_estimate / 1e6 if rev_estimate else None

            quote = securities.fetch_quote(symbol)
            company = (quote["name"] if quote else None) or item.name or item.ticker
            held = db.query(models.Position.id).filter(models.Position.ticker == item.ticker).first() is not None

            # One upcoming row per ticker — update in place if the date
            # shifted, instead of accumulating a new row every sync.
            row = (
                db.query(models.EarningsEvent)
                .filter(models.EarningsEvent.ticker == item.ticker, models.EarningsEvent.event_date >= today)
                .order_by(models.EarningsEvent.event_date)
                .first()
            )
            if row:
                row.event_date = event_date
                row.company = company
                row.held_in_portfolio = held
                row.eps_estimate = eps_estimate
                row.revenue_estimate_m = rev_estimate_m
            else:
                db.add(models.EarningsEvent(
                    ticker=item.ticker, company=company, event_date=event_date,
                    time_of_day="?", alert_enabled=True, held_in_portfolio=held,
                    eps_estimate=eps_estimate, revenue_estimate_m=rev_estimate_m,
                ))
            updated += 1

        message = f"{updated} valeur(s) avec une date de résultats connue sur {len(items)} dans la watchlist."
        if skipped:
            message += f" Pas de date disponible pour: {', '.join(skipped)}."
        log.status = "success"
        log.message = message
    except Exception as exc:
        log.status = "error"
        log.message = str(exc)
    log.finished_at = dt.datetime.utcnow()
    db.commit()
    return log

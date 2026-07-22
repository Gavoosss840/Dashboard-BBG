"""Risk layer: the trade must pass every rule, or it is blocked.

Position size, sector exposure, portfolio drawdown, stop loss discipline and
an emergency kill switch — evaluated server-side against live portfolio data
so the verdict reflects the book as it actually is."""

import datetime as dt

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session, selectinload

from app import models
from app.database import get_db
from app.services import fx, pnl

router = APIRouter(prefix="/api/risk", tags=["risk"])


def _get_settings(db: Session) -> models.RiskSettings:
    row = db.query(models.RiskSettings).first()
    if row is None:
        row = models.RiskSettings()
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def _settings_out(s: models.RiskSettings) -> dict:
    return {
        "max_position_pct": s.max_position_pct,
        "max_sector_pct": s.max_sector_pct,
        "max_drawdown_pct": s.max_drawdown_pct,
        "stop_loss_pct": s.stop_loss_pct,
        "kill_switch": s.kill_switch,
    }


@router.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return _settings_out(_get_settings(db))


class RiskSettingsUpdate(BaseModel):
    max_position_pct: float | None = None
    max_sector_pct: float | None = None
    max_drawdown_pct: float | None = None
    stop_loss_pct: float | None = None
    kill_switch: bool | None = None


@router.patch("/settings")
def update_settings(payload: RiskSettingsUpdate, db: Session = Depends(get_db)):
    s = _get_settings(db)
    for field, value in payload.model_dump(exclude_none=True).items():
        setattr(s, field, value)
    db.commit()
    db.refresh(s)
    return _settings_out(s)


class RiskCheckRequest(BaseModel):
    symbol: str
    amount: float           # proposed position size
    currency: str = "USD"   # currency of the amount
    price: float | None = None    # current price, for the stop-loss level
    sector: str | None = None     # sector of the security (from fundamentals)


def _current_drawdown_pct(portfolios: list[models.Portfolio], rates: dict) -> float | None:
    """Drawdown of the whole book: summed daily NAV history vs its peak."""
    by_date: dict[dt.date, float] = {}
    for p in portfolios:
        for h in p.nav_history:
            by_date[h.date] = by_date.get(h.date, 0.0) + fx.convert(h.nav, p.base_currency, "USD", rates)
    if len(by_date) < 2:
        return None
    series = [by_date[d] for d in sorted(by_date)]
    peak = max(series)
    current = series[-1]
    if peak <= 0:
        return None
    return (1 - current / peak) * 100


@router.post("/check")
def check_trade(payload: RiskCheckRequest, db: Session = Depends(get_db)):
    s = _get_settings(db)
    rates = fx.get_rates(db)
    portfolios = (
        db.query(models.Portfolio)
        # selectinload — two one-to-many collections on the same parent would
        # multiply rows if joined directly (positions x cash_balances).
        .options(selectinload(models.Portfolio.positions), selectinload(models.Portfolio.cash_balances))
        .all()
    )
    nav_usd = sum(pnl.portfolio_current_nav(p, rates, "USD") for p in portfolios)
    amount_usd = fx.convert(payload.amount, payload.currency, "USD", rates)

    rules: list[dict] = []
    blocked = False

    # 00 — kill switch overrides everything
    if s.kill_switch:
        rules.append({
            "key": "kill_switch", "label": "Kill switch", "status": "blocked",
            "detail": "Arrêt d'urgence activé — aucun nouveau trade n'est autorisé.",
        })
        blocked = True
    else:
        rules.append({
            "key": "kill_switch", "label": "Kill switch", "status": "pass",
            "detail": "Désactivé.",
        })

    # 01 — position size vs the book
    if nav_usd > 0:
        pos_pct = amount_usd / nav_usd * 100
        ok = pos_pct <= s.max_position_pct
        rules.append({
            "key": "position_size", "label": "Taille de position", "status": "pass" if ok else "blocked",
            "detail": f"{pos_pct:.1f}% de la NAV (limite {s.max_position_pct:.0f}%).",
        })
        blocked = blocked or not ok
    else:
        rules.append({
            "key": "position_size", "label": "Taille de position", "status": "info",
            "detail": "NAV nulle — impossible d'évaluer la taille relative.",
        })

    # 02 — drawdown freeze
    dd = _current_drawdown_pct(portfolios, rates)
    if dd is None:
        rules.append({
            "key": "drawdown", "label": "Drawdown", "status": "info",
            "detail": "Pas encore d'historique de NAV pour mesurer le drawdown.",
        })
    else:
        ok = dd <= s.max_drawdown_pct
        rules.append({
            "key": "drawdown", "label": "Drawdown", "status": "pass" if ok else "blocked",
            "detail": f"Drawdown actuel {dd:.1f}% depuis le plus haut (gel au-delà de {s.max_drawdown_pct:.0f}%).",
        })
        blocked = blocked or not ok

    # 03 — sector exposure after the trade
    sector = (payload.sector or "").strip()
    if sector and nav_usd > 0:
        sector_mv = sum(
            pnl.position_market_value(pos, rates, "USD")
            for p in portfolios
            for pos in p.positions
            if not pos.excluded and (pos.sector or "").strip().lower() == sector.lower()
        )
        after_pct = (sector_mv + amount_usd) / nav_usd * 100
        ok = after_pct <= s.max_sector_pct
        rules.append({
            "key": "exposure", "label": f"Exposition secteur ({sector})", "status": "pass" if ok else "blocked",
            "detail": f"{after_pct:.1f}% de la NAV après le trade (limite {s.max_sector_pct:.0f}%).",
        })
        blocked = blocked or not ok
    else:
        rules.append({
            "key": "exposure", "label": "Exposition secteur", "status": "info",
            "detail": "Secteur inconnu ou NAV nulle — règle non évaluée.",
        })

    # 04 — stop loss: always defined, it is the discipline, not a blocker
    stop_price = payload.price * (1 - s.stop_loss_pct / 100) if payload.price else None
    rules.append({
        "key": "stop_loss", "label": "Stop loss", "status": "info",
        "detail": (
            f"Niveau d'invalidation à {stop_price:.2f} ({s.stop_loss_pct:.0f}% sous le cours)."
            if stop_price is not None
            else f"Règle: sortie stricte à {s.stop_loss_pct:.0f}% sous le prix d'entrée."
        ),
    })

    return {
        "verdict": "BLOCKED" if blocked else "PASS",
        "rules": rules,
        "suggested_stop": stop_price,
        "nav_usd": nav_usd,
        "amount_usd": amount_usd,
    }

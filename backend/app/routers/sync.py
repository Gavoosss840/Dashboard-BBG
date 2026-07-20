import xml.etree.ElementTree as ET

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db
from app.services import backup, earnings, ibkr, ibkr_credentials, market_data

router = APIRouter(prefix="/api/sync", tags=["sync"])


def _require_admin(request: Request) -> None:
    if getattr(request.state, "role", "") != "admin":
        raise HTTPException(status_code=403, detail="Seul un administrateur peut gérer les connexions IBKR.")


def _last_log(db: Session, kind: str) -> models.SyncLog | None:
    return (
        db.query(models.SyncLog)
        .filter(models.SyncLog.kind == kind)
        .order_by(models.SyncLog.started_at.desc())
        .first()
    )


@router.get("/status", response_model=schemas.SyncStatusOut)
def sync_status(db: Session = Depends(get_db)):
    return schemas.SyncStatusOut(
        ibkr_configured=ibkr.is_configured(),
        ibkr_connections=len(ibkr.flex_connections()),
        last_ibkr_sync=_last_log(db, "ibkr"),
        last_market_refresh=_last_log(db, "market_data"),
        last_backup=_last_log(db, "backup"),
        last_earnings_sync=_last_log(db, "earnings"),
    )


@router.post("/ibkr", response_model=schemas.SyncLogOut)
def trigger_ibkr_sync(db: Session = Depends(get_db)):
    return ibkr.run_sync(db)


@router.post("/market-data", response_model=schemas.SyncLogOut)
def trigger_market_refresh(db: Session = Depends(get_db)):
    return market_data.refresh_market_data(db)


@router.post("/backup", response_model=schemas.SyncLogOut)
def trigger_backup(db: Session = Depends(get_db)):
    return backup.run_backup(db)


@router.post("/earnings", response_model=schemas.SyncLogOut)
def trigger_earnings_sync(db: Session = Depends(get_db)):
    return earnings.sync_earnings_from_watchlist(db)


# ---------------- IBKR connections (entered via the UI, admin-only) ----------------
# Stored in a local file next to the database, never in it — see
# app/services/ibkr_credentials.py for why. Tokens are never returned in
# full by these endpoints, only masked.

@router.get("/ibkr-connections", response_model=list[schemas.IbkrConnectionOut])
def list_ibkr_connections(request: Request):
    _require_admin(request)
    return ibkr_credentials.list_connections_masked()


@router.post("/ibkr-connections", response_model=schemas.IbkrConnectionOut)
def create_ibkr_connection(body: schemas.IbkrConnectionCreate, request: Request):
    _require_admin(request)
    if not body.token.strip() or not body.query_id.strip():
        raise HTTPException(status_code=400, detail="Token et Query ID sont requis.")
    row = ibkr_credentials.add_connection(body.label, body.token, body.query_id)
    return next(m for m in ibkr_credentials.list_connections_masked() if m["id"] == row["id"])


@router.delete("/ibkr-connections/{connection_id}")
def delete_ibkr_connection(connection_id: str, request: Request):
    _require_admin(request)
    if not ibkr_credentials.delete_connection(connection_id):
        raise HTTPException(status_code=404, detail="Connexion introuvable.")
    return {"ok": True}


@router.post("/ibkr-connections/{connection_id}/test", response_model=schemas.IbkrTestResult)
def test_ibkr_connection(connection_id: str, request: Request):
    _require_admin(request)
    row = ibkr_credentials.get_connection(connection_id)
    if not row:
        raise HTTPException(status_code=404, detail="Connexion introuvable.")
    try:
        xml_text = ibkr.fetch_flex_statement(row["token"], row["query_id"], max_wait_seconds=30)
        root = ET.fromstring(xml_text)
        accounts = sorted({
            stmt.get("accountId") for stmt in root.iter("FlexStatement") if stmt.get("accountId")
        })
        message = f"Connexion réussie — compte(s) trouvé(s) : {', '.join(accounts)}." if accounts else \
            "Connexion réussie, mais aucun compte trouvé dans le relevé."
        return schemas.IbkrTestResult(ok=True, accounts=accounts, message=message)
    except Exception as exc:
        return schemas.IbkrTestResult(ok=False, accounts=[], message=str(exc))

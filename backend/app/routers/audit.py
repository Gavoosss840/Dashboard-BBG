from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.orm import Session

from app import models, schemas
from app.database import get_db

router = APIRouter(prefix="/api/audit", tags=["audit"])


@router.get("", response_model=list[schemas.AuditLogOut])
def list_audit_logs(
    request: Request,
    limit: int = Query(200, le=1000),
    db: Session = Depends(get_db),
):
    if getattr(request.state, "role", "") != "admin":
        raise HTTPException(status_code=403, detail="Seul un administrateur peut consulter le journal d'audit.")
    return (
        db.query(models.AuditLog)
        .order_by(models.AuditLog.timestamp.desc())
        .limit(limit)
        .all()
    )

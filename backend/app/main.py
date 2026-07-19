import datetime as dt
import re
import threading
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import models
from app.auth import decode_token
from app.database import Base, SessionLocal, engine
from app.migrate import ensure_schema
from app.routers import (
    allocation,
    audit,
    auth,
    clients,
    compliance,
    crm,
    dashboard,
    financier,
    fx,
    mandates,
    market,
    portfolios,
    reference,
    securities,
    sync,
    users,
)
from app.seed_data import seed
from app.services import backup, ibkr, market_data

Base.metadata.create_all(bind=engine)
ensure_schema(engine, Base)

with SessionLocal() as db:
    seed(db)


def _stale(kind: str, hours: int, db) -> bool:
    last = (
        db.query(models.SyncLog)
        .filter(models.SyncLog.kind == kind, models.SyncLog.status == "success")
        .order_by(models.SyncLog.started_at.desc())
        .first()
    )
    return last is None or (dt.datetime.utcnow() - last.started_at) > dt.timedelta(hours=hours)


def _scheduler_loop() -> None:
    """Background maintenance: runs at startup, then re-checks every 30 min so a
    platform left running for days keeps its data and backups fresh."""
    while True:
        for kind, hours, runner, guard in (
            ("backup", 24, backup.run_backup, lambda: True),
            ("ibkr", 12, ibkr.run_sync, ibkr.is_configured),
            ("market_data", 4, market_data.refresh_market_data, lambda: True),
        ):
            try:
                if not guard():
                    continue
                with SessionLocal() as db:
                    if _stale(kind, hours, db):
                        runner(db)
            except Exception:
                pass  # each run is individually logged in SyncLog
        time.sleep(30 * 60)


threading.Thread(target=_scheduler_loop, daemon=True).start()

app = FastAPI(title="Boulet Capital - Internal Terminal", version="0.1.0")

PUBLIC_API_PATHS = {
    "/api/health",
    "/api/auth/login",
    "/api/auth/bootstrap",
    "/api/auth/bootstrap-status",
}

MUTATING_METHODS = {"POST", "PATCH", "PUT", "DELETE"}
_CLIENT_DELETE_RE = re.compile(r"^/api/clients/\d+$")


def _role_denies(role: str, method: str, path: str) -> str | None:
    """RBAC policy. Returns a refusal message, or None when allowed.

    admin      → everything
    associate/analyst → everything except managing users and deleting clients
    viewer     → read-only (may still change their own password)
    """
    if method not in MUTATING_METHODS:
        return None
    if path == "/api/auth/change-password":
        return None
    if role == "admin":
        return None
    if role == "viewer":
        return "Votre rôle (lecture seule) ne permet pas de modifier des données."
    if path.startswith("/api/users"):
        return "Seul un administrateur peut gérer les utilisateurs."
    if method == "DELETE" and _CLIENT_DELETE_RE.match(path):
        return "Seul un administrateur peut supprimer un client."
    return None


def _write_audit(user_id: int | None, user_name: str, method: str, path: str, status_code: int) -> None:
    try:
        with SessionLocal() as db:
            db.add(models.AuditLog(
                timestamp=dt.datetime.utcnow(),
                user_id=user_id,
                user_name=user_name,
                method=method,
                path=path[:300],
                status_code=status_code,
            ))
            db.commit()
    except Exception:
        pass  # auditing must never take the API down


@app.middleware("http")
async def require_auth(request: Request, call_next):
    path = request.url.path
    method = request.method
    if method == "OPTIONS" or not path.startswith("/api/"):
        return await call_next(request)

    if path in PUBLIC_API_PATHS:
        response = await call_next(request)
        if method in MUTATING_METHODS:  # login/bootstrap attempts, success or failure
            _write_audit(None, "(non connecté)", method, path, response.status_code)
        return response

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
    try:
        payload = decode_token(auth_header.removeprefix("Bearer "))
    except Exception:
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired session"})

    user_id = int(payload["sub"])
    request.state.user_id = payload["sub"]

    with SessionLocal() as db:
        row = db.query(models.User.role, models.User.name).filter(models.User.id == user_id).first()
    role, user_name = (row[0], row[1]) if row else ("", "?")
    request.state.role = role

    denial = _role_denies(role, method, path)
    if denial is not None:
        _write_audit(user_id, user_name, method, path, 403)
        return JSONResponse(status_code=403, content={"detail": denial})

    response = await call_next(request)
    if method in MUTATING_METHODS:
        _write_audit(user_id, user_name, method, path, response.status_code)
    return response


# Registered last so it wraps outermost — CORS headers must land on every
# response, including the 401s the auth middleware returns above.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(clients.router)
app.include_router(portfolios.router)
app.include_router(financier.router)
app.include_router(mandates.router)
app.include_router(crm.router)
app.include_router(market.router)
app.include_router(reference.router)
app.include_router(users.router)
app.include_router(allocation.router)
app.include_router(fx.router)
app.include_router(compliance.router)
app.include_router(sync.router)
app.include_router(audit.router)
app.include_router(securities.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}

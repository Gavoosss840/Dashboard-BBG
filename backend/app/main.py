import datetime as dt
import threading

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app import models
from app.auth import decode_token
from app.database import Base, SessionLocal, engine
from app.migrate import ensure_schema
from app.routers import (
    allocation,
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
    sync,
    users,
)
from app.seed_data import seed
from app.services import ibkr, market_data

Base.metadata.create_all(bind=engine)
ensure_schema(engine, Base)

with SessionLocal() as db:
    seed(db)


def _startup_sync() -> None:
    """Background refresh on startup: IBKR (if configured and stale) + prices/FX."""
    def stale(kind: str, hours: int, db) -> bool:
        last = (
            db.query(models.SyncLog)
            .filter(models.SyncLog.kind == kind, models.SyncLog.status == "success")
            .order_by(models.SyncLog.started_at.desc())
            .first()
        )
        return last is None or (dt.datetime.utcnow() - last.started_at) > dt.timedelta(hours=hours)

    try:
        with SessionLocal() as db:
            if ibkr.is_configured() and stale("ibkr", 12, db):
                ibkr.run_sync(db)
        with SessionLocal() as db:
            if stale("market_data", 4, db):
                market_data.refresh_market_data(db)
    except Exception:
        pass  # runs are individually logged in SyncLog; never block startup


threading.Thread(target=_startup_sync, daemon=True).start()

app = FastAPI(title="Boulet Capital - Internal Terminal", version="0.1.0")

PUBLIC_API_PATHS = {
    "/api/health",
    "/api/auth/login",
    "/api/auth/bootstrap",
    "/api/auth/bootstrap-status",
}


@app.middleware("http")
async def require_auth(request: Request, call_next):
    path = request.url.path
    if request.method == "OPTIONS" or not path.startswith("/api/") or path in PUBLIC_API_PATHS:
        return await call_next(request)

    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
    try:
        payload = decode_token(auth_header.removeprefix("Bearer "))
    except Exception:
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired session"})
    request.state.user_id = payload["sub"]
    return await call_next(request)


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


@app.get("/api/health")
def health():
    return {"status": "ok"}

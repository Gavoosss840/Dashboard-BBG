from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, SessionLocal, engine
from app.routers import (
    allocation,
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
    users,
)
from app.seed_data import seed

Base.metadata.create_all(bind=engine)

with SessionLocal() as db:
    seed(db)

app = FastAPI(title="Boulet Capital - Internal Terminal", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"http://(localhost|127\.0\.0\.1):\d+",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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


@app.get("/api/health")
def health():
    return {"status": "ok"}

import datetime as dt

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class User(Base):
    """Associates / staff of Boulet Capital."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(160))
    role: Mapped[str] = mapped_column(String(40), default="associate")
    title: Mapped[str] = mapped_column(String(120), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    avatar_initials: Mapped[str] = mapped_column(String(4), default="")
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    joined_date: Mapped[dt.date] = mapped_column(Date, default=dt.date.today)
    bio: Mapped[str] = mapped_column(Text, default="")


class Client(Base):
    __tablename__ = "clients"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    client_type: Mapped[str] = mapped_column(String(20), default="individual")
    status: Mapped[str] = mapped_column(String(20), default="active")
    entry_date: Mapped[dt.date] = mapped_column(Date)
    base_currency: Mapped[str] = mapped_column(String(3), default="EUR")
    country: Mapped[str] = mapped_column(String(80), default="")
    email: Mapped[str] = mapped_column(String(160), default="")
    phone: Mapped[str] = mapped_column(String(40), default="")
    risk_profile: Mapped[str] = mapped_column(String(20), default="balanced")
    kyc_status: Mapped[str] = mapped_column(String(20), default="verified")
    relationship_manager_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id"), nullable=True
    )
    notes: Mapped[str] = mapped_column(Text, default="")

    relationship_manager: Mapped["User"] = relationship()
    mandates: Mapped[list["Mandate"]] = relationship(back_populates="client")
    portfolios: Mapped[list["Portfolio"]] = relationship(back_populates="client")
    cash_flows: Mapped[list["CashFlow"]] = relationship(back_populates="client")
    transactions: Mapped[list["Transaction"]] = relationship(back_populates="client")


class Mandate(Base):
    __tablename__ = "mandates"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    mandate_type: Mapped[str] = mapped_column(String(30), default="discretionary")
    status: Mapped[str] = mapped_column(String(20), default="active")
    signing_date: Mapped[dt.date] = mapped_column(Date)
    renewal_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    mgmt_fee_pct: Mapped[float] = mapped_column(Float, default=1.5)
    perf_fee_pct: Mapped[float] = mapped_column(Float, default=15.0)
    hurdle_rate_pct: Mapped[float] = mapped_column(Float, default=0.0)
    high_water_mark: Mapped[float] = mapped_column(Float, default=0.0)
    benchmark: Mapped[str] = mapped_column(String(60), default="")
    notice_period_days: Mapped[int] = mapped_column(Integer, default=30)
    document_ref: Mapped[str] = mapped_column(String(120), default="")

    client: Mapped["Client"] = relationship(back_populates="mandates")


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[int] = mapped_column(primary_key=True)
    ptf_id: Mapped[str] = mapped_column(String(30))
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    base_currency: Mapped[str] = mapped_column(String(3), default="EUR")
    strategy_bucket: Mapped[str] = mapped_column(String(30), default="stock_picking")
    custodian: Mapped[str] = mapped_column(String(60), default="Interactive Brokers")
    inception_nav: Mapped[float] = mapped_column(Float, default=0.0)

    client: Mapped["Client"] = relationship(back_populates="portfolios")
    positions: Mapped[list["Position"]] = relationship(back_populates="portfolio")
    nav_history: Mapped[list["NavHistory"]] = relationship(back_populates="portfolio")


class Position(Base):
    __tablename__ = "positions"

    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"))
    ticker: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(160))
    asset_class: Mapped[str] = mapped_column(String(30), default="equity")
    sector: Mapped[str] = mapped_column(String(60), default="")
    region: Mapped[str] = mapped_column(String(60), default="")
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    quantity: Mapped[float] = mapped_column(Float)
    avg_cost: Mapped[float] = mapped_column(Float)
    last_price: Mapped[float] = mapped_column(Float)

    portfolio: Mapped["Portfolio"] = relationship(back_populates="positions")


class NavHistory(Base):
    __tablename__ = "nav_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    portfolio_id: Mapped[int] = mapped_column(ForeignKey("portfolios.id"))
    date: Mapped[dt.date] = mapped_column(Date)
    nav: Mapped[float] = mapped_column(Float)

    portfolio: Mapped["Portfolio"] = relationship(back_populates="nav_history")


class CashFlow(Base):
    __tablename__ = "cash_flows"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    date: Mapped[dt.date] = mapped_column(Date)
    flow_type: Mapped[str] = mapped_column(String(20), default="deposit")
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")

    client: Mapped["Client"] = relationship(back_populates="cash_flows")


class Transaction(Base):
    """Fee / invoice tracker between Boulet Capital and its clients."""

    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    transaction_type: Mapped[str] = mapped_column(String(30), default="management_fee")
    amount: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    status: Mapped[str] = mapped_column(String(20), default="draft")
    issue_date: Mapped[dt.date] = mapped_column(Date)
    due_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    paid_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    invoice_ref: Mapped[str] = mapped_column(String(60), default="")
    description: Mapped[str] = mapped_column(Text, default="")

    client: Mapped["Client"] = relationship(back_populates="transactions")


class CrmContact(Base):
    __tablename__ = "crm_contacts"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    contact_type: Mapped[str] = mapped_column(String(20), default="prospect")
    stage: Mapped[str] = mapped_column(String(20), default="lead")
    source: Mapped[str] = mapped_column(String(80), default="")
    estimated_aum: Mapped[float] = mapped_column(Float, default=0.0)
    currency: Mapped[str] = mapped_column(String(3), default="EUR")
    owner_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    next_action: Mapped[str] = mapped_column(String(200), default="")
    next_action_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    last_contact_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    linked_client_id: Mapped[int | None] = mapped_column(
        ForeignKey("clients.id"), nullable=True
    )
    notes: Mapped[str] = mapped_column(Text, default="")

    owner: Mapped["User"] = relationship()


class WatchlistItem(Base):
    __tablename__ = "watchlist_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String(20))
    name: Mapped[str] = mapped_column(String(160))
    asset_class: Mapped[str] = mapped_column(String(30), default="equity")
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    last_price: Mapped[float] = mapped_column(Float)
    day_change_pct: Mapped[float] = mapped_column(Float, default=0.0)
    target_price: Mapped[float | None] = mapped_column(Float, nullable=True)
    added_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(String(200), default="")

    added_by: Mapped["User"] = relationship()


class NewsItem(Base):
    __tablename__ = "news_items"

    id: Mapped[int] = mapped_column(primary_key=True)
    headline: Mapped[str] = mapped_column(String(280))
    summary: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(80), default="")
    url: Mapped[str] = mapped_column(String(400), default="")
    published_at: Mapped[dt.datetime] = mapped_column(DateTime)
    tickers: Mapped[str] = mapped_column(String(200), default="")
    sentiment: Mapped[str] = mapped_column(String(20), default="neutral")


class EarningsEvent(Base):
    __tablename__ = "earnings_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    ticker: Mapped[str] = mapped_column(String(20))
    company: Mapped[str] = mapped_column(String(160))
    event_date: Mapped[dt.date] = mapped_column(Date)
    time_of_day: Mapped[str] = mapped_column(String(10), default="AMC")
    eps_estimate: Mapped[float | None] = mapped_column(Float, nullable=True)
    eps_actual: Mapped[float | None] = mapped_column(Float, nullable=True)
    revenue_estimate_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    revenue_actual_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    alert_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    held_in_portfolio: Mapped[bool] = mapped_column(Boolean, default=False)


class ReferenceEntry(Base):
    __tablename__ = "reference_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    category: Mapped[str] = mapped_column(String(40), default="glossary")
    title: Mapped[str] = mapped_column(String(160))
    content: Mapped[str] = mapped_column(Text, default="")
    tags: Mapped[str] = mapped_column(String(200), default="")


class AllocationBucket(Base):
    """A capital pocket for the risk-parity allocation tool (e.g. Stock Picking / Algo Arbitrage)."""

    __tablename__ = "allocation_buckets"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    aum: Mapped[float] = mapped_column(Float)
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    lookback_days: Mapped[int] = mapped_column(Integer, default=60)
    color: Mapped[str] = mapped_column(String(20), default="")


class AllocationReturn(Base):
    """Daily returns per bucket, used to compute realized volatility for risk parity."""

    __tablename__ = "allocation_returns"

    id: Mapped[int] = mapped_column(primary_key=True)
    bucket_id: Mapped[int] = mapped_column(ForeignKey("allocation_buckets.id"))
    date: Mapped[dt.date] = mapped_column(Date)
    daily_return_pct: Mapped[float] = mapped_column(Float)


class FXRate(Base):
    """Rate expressed as units of CCY per 1 USD (USD is the pivot)."""

    __tablename__ = "fx_rates"

    id: Mapped[int] = mapped_column(primary_key=True)
    ccy: Mapped[str] = mapped_column(String(3), unique=True)
    rate_vs_usd: Mapped[float] = mapped_column(Float)
    updated_at: Mapped[dt.datetime] = mapped_column(DateTime, default=dt.datetime.utcnow)


class ComplianceDocument(Base):
    """A KYC/AML/suitability document tracked per client, with an expiry to renew."""

    __tablename__ = "compliance_documents"

    id: Mapped[int] = mapped_column(primary_key=True)
    client_id: Mapped[int] = mapped_column(ForeignKey("clients.id"))
    doc_type: Mapped[str] = mapped_column(String(60))
    issued_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    expiry_date: Mapped[dt.date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str] = mapped_column(Text, default="")

    client: Mapped["Client"] = relationship()

"""Full security data from Yahoo Finance: quotes, charts, fundamentals, news.

Three access levels, by decreasing reliability:
  - v8 chart endpoint: open, no auth — prices, OHLCV, rich meta (name,
    exchange, day range, 52-week range). The backbone.
  - v1 search endpoint: open — symbol lookup + per-ticker news.
  - v10 quoteSummary: needs the cookie+crumb dance — fundamentals (market
    cap, PE, margins, analyst view) and the company profile. Fetched with a
    cached crumb session, and every consumer treats it as optional: if Yahoo
    tightens access the security page degrades gracefully to chart data.

Quotes are near-real-time: real-time for US listings, possibly 15-min
delayed on some other exchanges (Yahoo's licensing, not ours).
"""

from __future__ import annotations

import threading
import time
from concurrent.futures import ThreadPoolExecutor

import requests

_HEADERS = {"User-Agent": "Mozilla/5.0 (BouletCapital internal terminal)"}

CHART_URL = "https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
SEARCH_URL = "https://query1.finance.yahoo.com/v1/finance/search"
SUMMARY_URL = "https://query1.finance.yahoo.com/v10/finance/quoteSummary/{symbol}"
CRUMB_URL = "https://query1.finance.yahoo.com/v1/test/getcrumb"

RANGE_INTERVALS = {
    "1d": "5m", "5d": "30m", "1mo": "1d", "6mo": "1d",
    "ytd": "1d", "1y": "1d", "5y": "1wk", "max": "1mo",
}

# ---------- Crumb session (for quoteSummary) ----------

_crumb_lock = threading.Lock()
_crumb_session: requests.Session | None = None
_crumb: str | None = None


def _get_crumb_session(force_refresh: bool = False) -> tuple[requests.Session, str] | None:
    global _crumb_session, _crumb
    with _crumb_lock:
        if _crumb_session is not None and _crumb and not force_refresh:
            return _crumb_session, _crumb
        try:
            s = requests.Session()
            s.headers.update(_HEADERS)
            s.get("https://fc.yahoo.com", timeout=15)
            crumb = s.get(CRUMB_URL, timeout=15).text.strip()
            if not crumb or "<" in crumb:
                return None
            _crumb_session, _crumb = s, crumb
            return s, crumb
        except Exception:
            return None


# ---------- Quotes (chart meta) with a short cache for the tape ----------

_quote_cache: dict[str, tuple[float, dict]] = {}
QUOTE_TTL_SECONDS = 20


def fetch_quote(symbol: str) -> dict | None:
    """Price + change + meta from the chart endpoint, cached briefly."""
    now = time.time()
    cached = _quote_cache.get(symbol)
    if cached and now - cached[0] < QUOTE_TTL_SECONDS:
        return cached[1]
    try:
        resp = requests.get(
            CHART_URL.format(symbol=symbol),
            params={"range": "1d", "interval": "5m"},
            headers=_HEADERS, timeout=15,
        )
        if resp.status_code != 200:
            return None
        meta = resp.json()["chart"]["result"][0]["meta"]
        price = meta.get("regularMarketPrice")
        prev = meta.get("chartPreviousClose") or meta.get("previousClose")
        if price is None:
            return None
        quote = {
            "symbol": meta.get("symbol", symbol),
            "name": meta.get("longName") or meta.get("shortName") or symbol,
            "currency": meta.get("currency", "USD"),
            "exchange": meta.get("fullExchangeName") or meta.get("exchangeName", ""),
            "price": float(price),
            "previous_close": float(prev) if prev else None,
            "change_pct": ((price / prev) - 1) * 100 if prev else 0.0,
            "day_high": meta.get("regularMarketDayHigh"),
            "day_low": meta.get("regularMarketDayLow"),
            "volume": meta.get("regularMarketVolume"),
            "fifty_two_week_high": meta.get("fiftyTwoWeekHigh"),
            "fifty_two_week_low": meta.get("fiftyTwoWeekLow"),
            "instrument_type": meta.get("instrumentType", ""),
        }
        _quote_cache[symbol] = (now, quote)
        return quote
    except Exception:
        return None


def fetch_quotes(symbols: list[str]) -> dict[str, dict | None]:
    with ThreadPoolExecutor(max_workers=8) as pool:
        results = list(pool.map(fetch_quote, symbols))
    return dict(zip(symbols, results))


# ---------- Chart series (cached: intraday moves fast, history doesn't) ----------

_chart_cache: dict[tuple[str, str], tuple[float, dict]] = {}


def _chart_ttl(range_key: str) -> int:
    return 60 if range_key in ("1d", "5d") else 600


def fetch_chart(symbol: str, range_key: str) -> dict | None:
    interval = RANGE_INTERVALS.get(range_key)
    if interval is None:
        return None
    cached = _chart_cache.get((symbol, range_key))
    if cached and time.time() - cached[0] < _chart_ttl(range_key):
        return cached[1]
    try:
        resp = requests.get(
            CHART_URL.format(symbol=symbol),
            params={"range": range_key, "interval": interval},
            headers=_HEADERS, timeout=20,
        )
        if resp.status_code != 200:
            return None
        result = resp.json()["chart"]["result"][0]
        meta = result["meta"]
        timestamps = result.get("timestamp") or []
        quote = (result.get("indicators", {}).get("quote") or [{}])[0]
        closes = quote.get("close") or []
        volumes = quote.get("volume") or []
        points = [
            {"t": t, "c": round(c, 6), "v": v or 0}
            for t, c, v in zip(timestamps, closes, volumes + [None] * len(timestamps))
            if c is not None
        ]
        chart = {
            "symbol": meta.get("symbol", symbol),
            "currency": meta.get("currency", "USD"),
            "range": range_key,
            "previous_close": meta.get("chartPreviousClose") or meta.get("previousClose"),
            "points": points,
        }
        _chart_cache[(symbol, range_key)] = (time.time(), chart)
        return chart
    except Exception:
        return None


def annualised_vol(closes: list[float]) -> float | None:
    """Annualised volatility from a daily close series (×√252)."""
    rets = [closes[i] / closes[i - 1] - 1.0 for i in range(1, len(closes)) if closes[i - 1] > 0]
    if len(rets) < 20:
        return None
    mean = sum(rets) / len(rets)
    var = sum((r - mean) ** 2 for r in rets) / (len(rets) - 1)
    return (var ** 0.5) * (252 ** 0.5)


# ---------- Search (symbols + news) ----------

def search(query: str, quotes_count: int = 8, news_count: int = 6) -> dict:
    try:
        resp = requests.get(
            SEARCH_URL,
            params={"q": query, "quotesCount": quotes_count, "newsCount": news_count},
            headers=_HEADERS, timeout=15,
        )
        data = resp.json() if resp.status_code == 200 else {}
    except Exception:
        data = {}
    quotes = [
        {
            "symbol": q.get("symbol"),
            "name": q.get("longname") or q.get("shortname") or q.get("symbol"),
            "exchange": q.get("exchDisp", ""),
            "type": q.get("quoteType", ""),
            "sector": q.get("sector"),
            "industry": q.get("industry"),
        }
        for q in data.get("quotes", [])
        if q.get("symbol") and q.get("quoteType") in ("EQUITY", "ETF", "INDEX", "CRYPTOCURRENCY", "CURRENCY", "FUTURE", "MUTUALFUND")
    ]
    news = [
        {
            "title": n.get("title", ""),
            "publisher": n.get("publisher", ""),
            "link": n.get("link", ""),
            "published_at": n.get("providerPublishTime"),
        }
        for n in data.get("news", [])
        if n.get("title")
    ]
    return {"quotes": quotes, "news": news}


# ---------- Fundamentals (quoteSummary, best effort) ----------

_SUMMARY_MODULES = (
    "assetProfile,summaryDetail,defaultKeyStatistics,financialData,"
    "calendarEvents,earnings,recommendationTrend"
)

_fund_cache: dict[str, tuple[float, dict | None]] = {}
FUND_TTL_SECONDS = 1800  # fundamentals move on earnings, not on ticks


def _fmt_field(container: dict, key: str):
    v = container.get(key)
    if isinstance(v, dict):
        return v.get("raw")
    return v


def fetch_fundamentals(symbol: str) -> dict | None:
    cached = _fund_cache.get(symbol)
    if cached and time.time() - cached[0] < FUND_TTL_SECONDS:
        return cached[1]
    pair = _get_crumb_session()
    if pair is None:
        return None
    session, crumb = pair
    try:
        resp = session.get(
            SUMMARY_URL.format(symbol=symbol),
            params={"modules": _SUMMARY_MODULES, "crumb": crumb},
            timeout=20,
        )
        if resp.status_code in (401, 403):
            pair = _get_crumb_session(force_refresh=True)
            if pair is None:
                return None
            session, crumb = pair
            resp = session.get(
                SUMMARY_URL.format(symbol=symbol),
                params={"modules": _SUMMARY_MODULES, "crumb": crumb},
                timeout=20,
            )
        if resp.status_code != 200:
            return None
        result = (resp.json().get("quoteSummary", {}).get("result") or [None])[0]
        if not result:
            return None
        sd = result.get("summaryDetail", {})
        ks = result.get("defaultKeyStatistics", {})
        fd = result.get("financialData", {})
        ap = result.get("assetProfile", {})
        ce = result.get("calendarEvents", {})
        earnings = result.get("earnings", {})
        reco_trend = (result.get("recommendationTrend", {}).get("trend") or [])
        current_trend = next((t for t in reco_trend if t.get("period") == "0m"), None)

        earnings_dates = [
            d.get("raw") for d in (ce.get("earnings", {}).get("earningsDate") or []) if d.get("raw")
        ]
        quarterly_eps = [
            {"quarter": q.get("date"), "actual": _fmt_field(q, "actual"), "estimate": _fmt_field(q, "estimate")}
            for q in (earnings.get("earningsChart", {}).get("quarterly") or [])
        ]
        yearly_financials = [
            {"year": y.get("date"), "revenue": _fmt_field(y, "revenue"), "earnings": _fmt_field(y, "earnings")}
            for y in (earnings.get("financialsChart", {}).get("yearly") or [])
        ]
        officers = [
            {"name": o.get("name"), "title": o.get("title")}
            for o in (ap.get("companyOfficers") or [])[:6]
            if o.get("name")
        ]

        out = {
            "valuation": {
                "market_cap": _fmt_field(sd, "marketCap"),
                "enterprise_value": _fmt_field(ks, "enterpriseValue"),
                "trailing_pe": _fmt_field(sd, "trailingPE"),
                "forward_pe": _fmt_field(ks, "forwardPE"),
                "peg": _fmt_field(ks, "pegRatio"),
                "price_to_book": _fmt_field(ks, "priceToBook"),
                "price_to_sales": _fmt_field(sd, "priceToSalesTrailing12Months"),
                "ev_to_ebitda": _fmt_field(ks, "enterpriseToEbitda"),
                "ev_to_revenue": _fmt_field(ks, "enterpriseToRevenue"),
                "beta": _fmt_field(sd, "beta"),
            },
            "profitability": {
                "revenue": _fmt_field(fd, "totalRevenue"),
                "revenue_growth": _fmt_field(fd, "revenueGrowth"),
                "earnings_growth": _fmt_field(fd, "earningsGrowth"),
                "gross_margin": _fmt_field(fd, "grossMargins"),
                "operating_margin": _fmt_field(fd, "operatingMargins"),
                "profit_margin": _fmt_field(fd, "profitMargins"),
                "ebitda": _fmt_field(fd, "ebitda"),
                "roe": _fmt_field(fd, "returnOnEquity"),
                "roa": _fmt_field(fd, "returnOnAssets"),
                "eps": _fmt_field(ks, "trailingEps"),
                "forward_eps": _fmt_field(ks, "forwardEps"),
            },
            "health": {
                "total_cash": _fmt_field(fd, "totalCash"),
                "total_debt": _fmt_field(fd, "totalDebt"),
                "debt_to_equity": _fmt_field(fd, "debtToEquity"),
                "current_ratio": _fmt_field(fd, "currentRatio"),
                "quick_ratio": _fmt_field(fd, "quickRatio"),
                "free_cashflow": _fmt_field(fd, "freeCashflow"),
                "operating_cashflow": _fmt_field(fd, "operatingCashflow"),
            },
            "dividend": {
                "yield": _fmt_field(sd, "dividendYield"),
                "rate": _fmt_field(sd, "dividendRate"),
                "payout_ratio": _fmt_field(sd, "payoutRatio"),
                "ex_dividend_date": _fmt_field(sd, "exDividendDate"),
                "five_year_avg_yield": _fmt_field(sd, "fiveYearAvgDividendYield"),
            },
            "ownership": {
                "shares_outstanding": _fmt_field(ks, "sharesOutstanding"),
                "float_shares": _fmt_field(ks, "floatShares"),
                "held_insiders": _fmt_field(ks, "heldPercentInsiders"),
                "held_institutions": _fmt_field(ks, "heldPercentInstitutions"),
                "short_ratio": _fmt_field(ks, "shortRatio"),
                "short_percent_float": _fmt_field(ks, "shortPercentOfFloat"),
                "avg_volume": _fmt_field(sd, "averageVolume"),
            },
            "analyst": {
                "recommendation": fd.get("recommendationKey"),
                "recommendation_mean": _fmt_field(fd, "recommendationMean"),
                "num_analysts": _fmt_field(fd, "numberOfAnalystOpinions"),
                "target_low": _fmt_field(fd, "targetLowPrice"),
                "target_mean": _fmt_field(fd, "targetMeanPrice"),
                "target_median": _fmt_field(fd, "targetMedianPrice"),
                "target_high": _fmt_field(fd, "targetHighPrice"),
                "trend": {
                    "strong_buy": current_trend.get("strongBuy", 0),
                    "buy": current_trend.get("buy", 0),
                    "hold": current_trend.get("hold", 0),
                    "sell": current_trend.get("sell", 0),
                    "strong_sell": current_trend.get("strongSell", 0),
                }
                if current_trend
                else None,
            },
            "calendar": {"next_earnings_date": min(earnings_dates) if earnings_dates else None},
            "earnings_history": {"quarterly_eps": quarterly_eps, "yearly_financials": yearly_financials},
            "profile": {
                "sector": ap.get("sector"),
                "industry": ap.get("industry"),
                "employees": ap.get("fullTimeEmployees"),
                "website": ap.get("website"),
                "country": ap.get("country"),
                "city": ap.get("city"),
                "description": ap.get("longBusinessSummary"),
                "officers": officers,
            },
        }
        _fund_cache[symbol] = (time.time(), out)
        return out
    except Exception:
        return None


# ---------- Global market overview (indices, FX, commodities, crypto, rates) ----------

MARKET_GROUPS: list[tuple[str, list[str]]] = [
    ("indices", ["^GSPC", "^IXIC", "^DJI", "^FCHI", "^GDAXI", "^FTSE", "^STOXX50E", "^N225", "^HSI"]),
    ("fx", ["EURUSD=X", "GBPUSD=X", "USDJPY=X", "USDCHF=X", "EURCHF=X", "EURGBP=X"]),
    ("commodities", ["GC=F", "SI=F", "CL=F", "BZ=F", "NG=F", "HG=F"]),
    ("crypto", ["BTC-USD", "ETH-USD", "SOL-USD"]),
    ("rates", ["^IRX", "^FVX", "^TNX", "^TYX"]),
]


def market_overview() -> list[dict]:
    all_symbols = [s for _, syms in MARKET_GROUPS for s in syms]
    quotes = fetch_quotes(all_symbols)  # parallel + 20 s cache
    out = []
    for key, syms in MARKET_GROUPS:
        rows = []
        for s in syms:
            q = quotes.get(s)
            if q is not None:
                rows.append(q)
        out.append({"group": key, "quotes": rows})
    return out


# ---------- Aggregated live news across a set of symbols ----------

_news_cache: dict[str, tuple[float, list[dict]]] = {}
NEWS_TTL_SECONDS = 300


def aggregate_news(symbols: list[str], limit: int = 30) -> list[dict]:
    """Latest headlines across the watchlist, deduplicated and time-sorted."""
    queries = symbols[:12] if symbols else ["stock market"]
    key = ",".join(sorted(queries))
    cached = _news_cache.get(key)
    if cached and time.time() - cached[0] < NEWS_TTL_SECONDS:
        return cached[1]

    def one(sym: str) -> list[dict]:
        items = search(sym, quotes_count=0, news_count=8)["news"]
        for n in items:
            n["symbol"] = sym
        return items

    with ThreadPoolExecutor(max_workers=6) as pool:
        batches = list(pool.map(one, queries))

    seen: set[str] = set()
    merged: list[dict] = []
    for batch in batches:
        for n in batch:
            dedupe = n.get("link") or n.get("title", "")
            if dedupe in seen:
                continue
            seen.add(dedupe)
            merged.append(n)
    merged.sort(key=lambda n: n.get("published_at") or 0, reverse=True)
    result = merged[:limit]
    _news_cache[key] = (time.time(), result)
    return result

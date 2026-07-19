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


# ---------- Chart series ----------

def fetch_chart(symbol: str, range_key: str) -> dict | None:
    interval = RANGE_INTERVALS.get(range_key)
    if interval is None:
        return None
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
        return {
            "symbol": meta.get("symbol", symbol),
            "currency": meta.get("currency", "USD"),
            "range": range_key,
            "previous_close": meta.get("chartPreviousClose") or meta.get("previousClose"),
            "points": points,
        }
    except Exception:
        return None


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

_SUMMARY_MODULES = "assetProfile,summaryDetail,defaultKeyStatistics,financialData"


def _fmt_field(container: dict, key: str):
    v = container.get(key)
    if isinstance(v, dict):
        return v.get("raw")
    return v


def fetch_fundamentals(symbol: str) -> dict | None:
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
        return {
            "market_cap": _fmt_field(sd, "marketCap"),
            "trailing_pe": _fmt_field(sd, "trailingPE"),
            "forward_pe": _fmt_field(ks, "forwardPE"),
            "eps": _fmt_field(ks, "trailingEps"),
            "dividend_yield": _fmt_field(sd, "dividendYield"),
            "beta": _fmt_field(sd, "beta"),
            "avg_volume": _fmt_field(sd, "averageVolume"),
            "profit_margin": _fmt_field(fd, "profitMargins"),
            "revenue": _fmt_field(fd, "totalRevenue"),
            "revenue_growth": _fmt_field(fd, "revenueGrowth"),
            "target_mean_price": _fmt_field(fd, "targetMeanPrice"),
            "recommendation": fd.get("recommendationKey"),
            "num_analysts": _fmt_field(fd, "numberOfAnalystOpinions"),
            "sector": ap.get("sector"),
            "industry": ap.get("industry"),
            "employees": ap.get("fullTimeEmployees"),
            "website": ap.get("website"),
            "country": ap.get("country"),
            "description": ap.get("longBusinessSummary"),
        }
    except Exception:
        return None

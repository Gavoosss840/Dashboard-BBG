"""Black-76 pricing for options on futures — used to reconstruct an option's
historical value in reports.

No free data feed carries historical option prices (ICE/NYMEX license them,
Yahoo exposes only the current chain). But the underlying future's daily history
IS free (Yahoo continuous-future symbols), so we mark the option to model:
Black-76 priced off the underlying each day, with the implied volatility
CALIBRATED to the option's current observed price so the model line meets
today's reality. It is explicitly a model, not observed prices.
"""

from __future__ import annotations

import math

# IBKR underlying future root -> Yahoo continuous-future symbol (daily history).
# Micro contracts track their standard sibling (MCL≈CL, MGC≈GC, MES≈ES...).
_FUTURE_ROOT_TO_YAHOO = {
    "CL": "CL=F", "MCL": "CL=F", "QM": "CL=F",       # WTI crude
    "BZ": "BZ=F", "MBZ": "BZ=F",                      # Brent
    "NG": "NG=F", "QG": "NG=F",                       # Nat gas
    "GC": "GC=F", "MGC": "GC=F",                      # Gold
    "SI": "SI=F", "SIL": "SI=F",                      # Silver
    "HG": "HG=F",                                     # Copper
    "ES": "ES=F", "MES": "ES=F",                      # S&P 500
    "NQ": "NQ=F", "MNQ": "NQ=F",                      # Nasdaq 100
    "YM": "YM=F", "MYM": "YM=F",                      # Dow
    "RTY": "RTY=F", "M2K": "RTY=F",                   # Russell 2000
    "ZC": "ZC=F", "ZW": "ZW=F", "ZS": "ZS=F",         # Corn / wheat / soy
    "ZB": "ZB=F", "ZN": "ZN=F", "ZF": "ZF=F",         # Treasuries
    "6E": "EURUSD=X", "6J": "JPY=X", "6B": "GBPUSD=X",  # FX futures
}


def _root(underlying_symbol: str) -> str:
    """Strip the contract-month/year code from an IBKR future symbol.

    'MCLU6' -> 'MCL', 'CLZ25' -> 'CL'. Month codes are a single letter
    (F,G,H,J,K,M,N,Q,U,V,X,Z) followed by 1-2 year digits.
    """
    s = (underlying_symbol or "").upper().strip()
    for i in range(len(s) - 1, 0, -1):
        if s[i].isdigit():
            continue
        # s[i] is the (last) non-digit — the month code; everything before is root
        return s[:i]
    return s


def yahoo_underlying(underlying_symbol: str) -> str | None:
    return _FUTURE_ROOT_TO_YAHOO.get(_root(underlying_symbol))


def _norm_cdf(x: float) -> float:
    return 0.5 * (1.0 + math.erf(x / math.sqrt(2.0)))


def black76(F: float, K: float, T: float, sigma: float, r: float, right: str) -> float:
    """Black-76 price of a European option on a future.

    F forward/future price, K strike, T years to expiry, sigma vol, r risk-free,
    right 'C' or 'P'. Degenerate inputs collapse to the discounted intrinsic.
    """
    if T <= 0 or sigma <= 0 or F <= 0 or K <= 0:
        intrinsic = max(0.0, (F - K) if right == "C" else (K - F))
        return math.exp(-r * T) * intrinsic
    vol_t = sigma * math.sqrt(T)
    d1 = (math.log(F / K) + 0.5 * vol_t * vol_t) / vol_t
    d2 = d1 - vol_t
    disc = math.exp(-r * T)
    if right == "C":
        return disc * (F * _norm_cdf(d1) - K * _norm_cdf(d2))
    return disc * (K * _norm_cdf(-d2) - F * _norm_cdf(-d1))


def implied_vol(price: float, F: float, K: float, T: float, r: float, right: str) -> float | None:
    """Back out the volatility that reprices `price` under Black-76 (bisection).

    Returns None if the target is below intrinsic (no positive-vol solution).
    """
    if price <= 0 or T <= 0 or F <= 0 or K <= 0:
        return None
    intrinsic = math.exp(-r * T) * max(0.0, (F - K) if right == "C" else (K - F))
    if price < intrinsic - 1e-6:
        return None
    lo, hi = 1e-4, 5.0
    p_hi = black76(F, K, T, hi, r, right)
    if p_hi < price:  # even 500% vol can't reach it — cap
        return hi
    for _ in range(100):
        mid = 0.5 * (lo + hi)
        p_mid = black76(F, K, T, mid, r, right)
        if abs(p_mid - price) < 1e-6:
            return mid
        if p_mid < price:
            lo = mid
        else:
            hi = mid
    return 0.5 * (lo + hi)

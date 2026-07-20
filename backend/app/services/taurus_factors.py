"""Taurus alpha leg — CAPM + Fama-French 5/6 → SML alpha with HC1 errors.

Faithful port of `taurus/factors.py` (vectorised OLS, HC1 heteroskedasticity-
consistent intercept SE, Student-t critical value) applied to a single security
valued at time T, with the appropriate **regional** Ken French factor set
(US / Europe / Japan / Asia-Pacific) chosen from the listing.

Data source: Kenneth French's data library (monthly factors, values in percent
→ divided by 100), cached in-process for the day.
"""

from __future__ import annotations

import io
import threading
import time
import zipfile

import numpy as np
import requests
from scipy.stats import t as _t_dist

# Taurus config (taurus/config.py)
USE_UMD_FACTOR = True    # FF6: strip the momentum premium from alpha
RETURN_DF = 5.0          # Student-t degrees of freedom
LOOKBACK_MONTHS = 60
MIN_OBS = 24             # hard minimum overlapping months

_KF_BASE = "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"

# Regional 5-factor + momentum datasets. Region is inferred from the listing.
_FF5_FILES = {
    "US": "F-F_Research_Data_5_Factors_2x3_CSV.zip",
    "Europe": "Europe_5_Factors_CSV.zip",
    "Japan": "Japan_5_Factors_CSV.zip",
    "AsiaPacific": "Asia_Pacific_ex_Japan_5_Factors_CSV.zip",
}
_MOM_FILES = {
    "US": "F-F_Momentum_Factor_CSV.zip",
    "Europe": "Europe_Mom_Factor_CSV.zip",
    "Japan": "Japan_Mom_Factor_CSV.zip",
    "AsiaPacific": "Asia_Pacific_ex_Japan_Mom_Factor_CSV.zip",
}

# Yahoo currency → Ken French regional factor bucket.
_CCY_REGION = {
    "USD": "US", "CAD": "US",
    "EUR": "Europe", "GBP": "Europe", "GBp": "Europe", "CHF": "Europe",
    "SEK": "Europe", "NOK": "Europe", "DKK": "Europe",
    "JPY": "Japan",
    "HKD": "AsiaPacific", "AUD": "AsiaPacific", "SGD": "AsiaPacific",
    "TWD": "AsiaPacific", "KRW": "AsiaPacific", "NZD": "AsiaPacific",
}


def region_for(currency: str) -> str:
    return _CCY_REGION.get(currency, "US")


# --------------------------------------------------------------------------- #
#  Ken French factor loader (cached ~24h in-process)                            #
# --------------------------------------------------------------------------- #

_factor_lock = threading.Lock()
_factor_cache: dict[str, tuple[float, dict[int, dict]]] = {}
FACTOR_TTL = 24 * 3600


def _is_number(s: str) -> bool:
    try:
        float(s)
        return True
    except ValueError:
        return False


def _parse_kf_csv(text: str) -> dict[int, dict[str, float]]:
    """Parse a Ken French monthly CSV: rows 'YYYYMM, v1, v2, ...' in percent.
    Returns {yyyymm: {colname: decimal}}. Stops at the first non-monthly row
    (the annual section that follows)."""
    lines = text.splitlines()
    header_cols: list[str] | None = None
    out: dict[int, dict[str, float]] = {}
    for line in lines:
        parts = [c.strip() for c in line.split(",")]
        first = parts[0]
        if header_cols is None:
            # Header row: empty first cell followed by factor-name columns
            # (never pure numbers). Works for FF5 (",Mkt-RF,SMB,…") and the
            # single-column momentum file (",Mom").
            rest = [p for p in parts[1:] if p]
            if first == "" and rest and not any(_is_number(p) for p in rest):
                header_cols = parts[1:]
            continue
        if len(first) == 6 and first.isdigit():
            ym = int(first)
            vals: dict[str, float] = {}
            for col, raw in zip(header_cols, parts[1:]):
                try:
                    vals[col] = float(raw) / 100.0
                except ValueError:
                    vals[col] = float("nan")
            out[ym] = vals
        elif out:
            break  # reached the annual block after the monthly series
    return out


def _download_factor_file(filename: str) -> dict[int, dict[str, float]]:
    resp = requests.get(_KF_BASE + filename, timeout=30)
    resp.raise_for_status()
    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    name = [n for n in zf.namelist() if n.upper().endswith(".CSV")][0]
    return _parse_kf_csv(zf.read(name).decode("latin-1"))


def load_factors(region: str, use_umd: bool = USE_UMD_FACTOR) -> dict[int, dict] | None:
    """{yyyymm: {Mkt-RF, SMB, HML, RMW, CMA, RF [, UMD]}} for a region, cached."""
    key = f"{region}:{use_umd}"
    with _factor_lock:
        cached = _factor_cache.get(key)
        if cached and time.time() - cached[0] < FACTOR_TTL:
            return cached[1]
    try:
        ff5 = _download_factor_file(_FF5_FILES.get(region, _FF5_FILES["US"]))
        if use_umd:
            try:
                mom = _download_factor_file(_MOM_FILES.get(region, _MOM_FILES["US"]))
                mom_col = None
                for ym, row in mom.items():
                    cols = [c for c in row if c]
                    if cols:
                        mom_col = cols[0]
                        break
                if mom_col:
                    for ym, row in ff5.items():
                        m = mom.get(ym)
                        row["UMD"] = m[mom_col] if m and m.get(mom_col) is not None else 0.0
            except Exception:
                pass  # FF5 without momentum is still valid
    except Exception:
        return None
    with _factor_lock:
        _factor_cache[key] = (time.time(), ff5)
    return ff5


# --------------------------------------------------------------------------- #
#  Single-stock FF5/FF6 alpha (vectorised OLS + HC1)                             #
# --------------------------------------------------------------------------- #

def compute_alpha(
    monthly_returns: dict[int, float],
    region: str,
    use_umd: bool = USE_UMD_FACTOR,
    return_df: float | None = RETURN_DF,
) -> dict | None:
    """Regress one stock's monthly excess returns on the regional FF5/FF6
    factors. `monthly_returns` is {yyyymm: simple_return}. Faithful to
    `taurus.factors.compute_ff5_alpha` (single-column Y).

    Returns alpha_monthly, alpha_annual, alpha_tstat, factor betas, r_squared,
    n_obs, model, significant (|t| ≥ Student-t crit).
    """
    factors = load_factors(region, use_umd)
    if not factors:
        return None

    common = sorted(set(monthly_returns) & set(factors))
    if len(common) < MIN_OBS:
        return None
    common = common[-LOOKBACK_MONTHS:]  # most recent ≤60 months

    has_umd = use_umd and all("UMD" in factors[ym] for ym in common)
    cols = ["Mkt-RF", "SMB", "HML", "RMW", "CMA"] + (["UMD"] if has_umd else [])

    rf = np.array([factors[ym]["RF"] for ym in common])
    y = np.array([monthly_returns[ym] for ym in common]) - rf  # excess returns
    T = len(common)
    X = np.column_stack([np.ones(T)] + [[factors[ym][c] for ym in common] for c in cols])
    K = X.shape[1]
    if T <= K:
        return None

    XtX_inv = np.linalg.pinv(X.T @ X)
    beta = XtX_inv @ (X.T @ y)
    resid = y - X @ beta

    # HC1 heteroskedasticity-consistent SE for the intercept
    df_corr = T / (T - K)
    q = X @ XtX_inv[:, 0]
    v00 = float(np.sum(q ** 2 * resid ** 2) * df_corr)
    se_alpha = np.sqrt(max(v00, 1e-16))

    alpha_m = float(beta[0])
    alpha_a = (1 + alpha_m) ** 12 - 1
    t_stat = alpha_m / se_alpha if se_alpha > 0 else 0.0

    ss_res = float(np.sum(resid ** 2))
    ss_tot = float(np.sum((y - y.mean()) ** 2))
    r2 = 1.0 - ss_res / ss_tot if ss_tot > 0 else 0.0

    df_resid = T - K
    if return_df is not None and return_df > 2:
        t_crit = float(_t_dist.ppf(0.975, df=min(df_resid, return_df)))
    else:
        t_crit = 1.96

    betas = {c: float(b) for c, b in zip(cols, beta[1:])}
    return {
        "alpha_monthly": alpha_m,
        "alpha_annual": alpha_a,
        "alpha_tstat": float(t_stat),
        "betas": betas,
        "r_squared": r2,
        "n_obs": T,
        "model": "FF6" if has_umd else "FF5",
        "region": region,
        "significant": bool(abs(t_stat) >= t_crit),
        "t_crit": t_crit,
    }

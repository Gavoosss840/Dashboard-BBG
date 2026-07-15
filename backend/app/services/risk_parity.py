"""Pure (Equal) Risk Contribution allocation engine.

For exactly 2 capital buckets, ERC weights are mathematically equivalent to
inverse-volatility weighting, independent of the correlation between the
buckets:

    w_i ∝ 1 / sigma_i

This module implements the general N-bucket ERC solver so the tool keeps
working transparently if a third strategy bucket (e.g. a macro book) is
added later. With N=2 it converges to the closed-form inverse-vol result.
"""

from __future__ import annotations

import numpy as np
from scipy.optimize import minimize

TRADING_DAYS_PER_YEAR = 252


def annualized_vol(daily_returns_pct: list[float]) -> float:
    if len(daily_returns_pct) < 2:
        return 0.0
    returns = np.array(daily_returns_pct) / 100.0
    return float(np.std(returns, ddof=1) * np.sqrt(TRADING_DAYS_PER_YEAR))


def covariance_matrix(returns_by_bucket: list[list[float]]) -> np.ndarray:
    """returns_by_bucket: list of aligned daily-return series (in %) per bucket."""
    matrix = np.array(returns_by_bucket) / 100.0
    return np.cov(matrix) * TRADING_DAYS_PER_YEAR


def _risk_contributions(weights: np.ndarray, cov: np.ndarray) -> np.ndarray:
    port_var = weights @ cov @ weights
    if port_var <= 0:
        return np.zeros_like(weights)
    marginal = cov @ weights
    return weights * marginal / np.sqrt(port_var)


def erc_weights(cov: np.ndarray) -> np.ndarray:
    """Solve for pure equal-risk-contribution weights. No min/max caps (by design)."""
    n = cov.shape[0]

    if n == 1:
        return np.array([1.0])

    if n == 2:
        # Closed form, exact and correlation-independent for the 2-bucket case.
        sigma = np.sqrt(np.diag(cov))
        inv = 1.0 / np.where(sigma == 0, 1e-9, sigma)
        return inv / inv.sum()

    w0 = np.ones(n) / n

    def objective(w: np.ndarray) -> float:
        rc = _risk_contributions(w, cov)
        avg = rc.mean()
        return float(np.sum((rc - avg) ** 2))

    constraints = [{"type": "eq", "fun": lambda w: np.sum(w) - 1.0}]
    bounds = [(1e-6, 1.0)] * n
    result = minimize(
        objective,
        w0,
        method="SLSQP",
        bounds=bounds,
        constraints=constraints,
        options={"ftol": 1e-14, "maxiter": 2000},
    )
    weights = result.x
    return weights / weights.sum()

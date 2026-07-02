"""
Synthetic fraud dataset (Phase 4.1).

We generate ~10k normal transactions and ~1k fraudulent ones with deliberate
fraud signals so a simple classifier can hit >0.9 ROC-AUC on a holdout. This
data is purely for training / demo — never touches production traffic.

Fraud signals injected:
  - Large amounts (top 1% of normal distribution).
  - Off-hour timestamps (00:00 - 05:00 local).
  - Bursty velocity (5+ tx in last 5min).
  - Lots of activity in the last 24h.

Schema returned by `generate(n_normal, n_fraud, seed)`:
  X : np.ndarray of shape (N, FEATURE_DIM)
  y : np.ndarray of shape (N,)  with values 0 (normal) / 1 (fraud)
"""
import numpy as np

from .features import FEATURE_NAMES, FEATURE_DIM


def _make_normal(rng: np.random.Generator, n: int) -> np.ndarray:
    """Normal transaction distribution."""
    log_amount       = rng.normal(loc=4.5, scale=1.0, size=n)            # ~$90 median
    hour             = rng.integers(7, 22, size=n).astype(float)         # business hours
    dow              = rng.integers(0, 7,  size=n).astype(float)
    rolling_24h_cnt  = rng.poisson(lam=3.0, size=n).astype(float)
    rolling_24h_sum  = np.log1p(np.exp(log_amount) * (rolling_24h_cnt + 1))
    velocity_5min    = rng.poisson(lam=0.2, size=n).astype(float)

    h_rad = 2 * np.pi * hour / 24.0
    d_rad = 2 * np.pi * dow  / 7.0
    return np.column_stack([
        log_amount,
        np.sin(h_rad), np.cos(h_rad),
        np.sin(d_rad), np.cos(d_rad),
        rolling_24h_cnt,
        rolling_24h_sum,
    ])


def _make_fraud(rng: np.random.Generator, n: int) -> np.ndarray:
    """Fraud distribution with planted signals."""
    log_amount       = rng.normal(loc=7.5, scale=1.2, size=n)            # ~$1800 median
    hour             = rng.integers(0, 6, size=n).astype(float)          # off-hours
    dow              = rng.integers(0, 7, size=n).astype(float)
    rolling_24h_cnt  = rng.poisson(lam=12.0, size=n).astype(float)       # heavy activity
    rolling_24h_sum  = np.log1p(np.exp(log_amount) * (rolling_24h_cnt + 1))
    velocity_5min    = rng.poisson(lam=4.0, size=n).astype(float)        # bursty

    h_rad = 2 * np.pi * hour / 24.0
    d_rad = 2 * np.pi * dow  / 7.0
    return np.column_stack([
        log_amount,
        np.sin(h_rad), np.cos(h_rad),
        np.sin(d_rad), np.cos(d_rad),
        rolling_24h_cnt,
        rolling_24h_sum,
    ])


def generate(n_normal: int = 10_000, n_fraud: int = 1_000, seed: int = 42):
    rng = np.random.default_rng(seed)
    X_n = _make_normal(rng, n_normal)
    X_f = _make_fraud(rng, n_fraud)
    X   = np.vstack([X_n, X_f])
    y   = np.concatenate([np.zeros(n_normal, dtype=int), np.ones(n_fraud, dtype=int)])

    # shuffle in place
    idx = rng.permutation(len(y))
    assert X.shape[1] == FEATURE_DIM, f"expected {FEATURE_DIM} cols, got {X.shape[1]}"
    return X[idx], y[idx], FEATURE_NAMES

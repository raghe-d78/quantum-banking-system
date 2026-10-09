"""
Synthetic fraud dataset (Phase 4.1, extended to feature schema v2).

Columns = FEATURE_NAMES: 7 transaction features, has_document, 9 CV features.

Document features are planted honestly:
  - 35 % of normal and 55 % of fraudulent transactions carry a document.
  - Normal documents: high OCR confidence, low tampering, amount matches,
    valid dates, no duplicates.
  - Fraudulent documents: elevated tampering / ELA signals, frequent amount
    mismatch, post-dated or stale dates, occasional duplicates, lower layout
    consistency and signature similarity.
  - Without a document, CV columns take the neutral values, so the models
    must learn that "no document" is uninformative, not suspicious.
This is a demo generator; the comparative report states that plainly.
"""
import numpy as np

from .features import CV_FEATURE_NAMES, CV_NEUTRAL, FEATURE_DIM, FEATURE_NAMES

P_DOC_NORMAL = 0.35
P_DOC_FRAUD  = 0.55


def _tx_block(rng, n, fraud: bool) -> np.ndarray:
    if not fraud:
        log_amount = rng.normal(4.5, 1.0, n); hour = rng.integers(7, 22, n).astype(float)
        cnt = rng.poisson(3.0, n).astype(float)
    else:
        log_amount = rng.normal(7.5, 1.2, n); hour = rng.integers(0, 6, n).astype(float)
        cnt = rng.poisson(12.0, n).astype(float)
    dow = rng.integers(0, 7, n).astype(float)
    rolling_sum = np.log1p(np.exp(log_amount) * (cnt + 1))
    h = 2 * np.pi * hour / 24.0; d = 2 * np.pi * dow / 7.0
    return np.column_stack([log_amount, np.sin(h), np.cos(h), np.sin(d), np.cos(d), cnt, rolling_sum])


def _cv_block(rng, n, fraud: bool) -> np.ndarray:
    p_doc = P_DOC_FRAUD if fraud else P_DOC_NORMAL
    has = rng.random(n) < p_doc
    neutral = np.array([CV_NEUTRAL[k] for k in CV_FEATURE_NAMES])
    out = np.tile(neutral, (n, 1))
    m = has.sum()
    if m:
        if not fraud:
            feats = np.column_stack([
                np.clip(rng.normal(0.88, 0.06, m), 0, 1),     # ocr_confidence
                np.clip(rng.normal(0.90, 0.07, m), 0, 1),     # amount_confidence
                np.clip(rng.normal(0.75, 0.12, m), 0, 1),     # document_quality
                np.clip(rng.beta(1.5, 12, m), 0, 1),          # tampering_score (low)
                np.clip(rng.normal(0.72, 0.15, m), 0, 1),     # signature_similarity
                np.clip(rng.normal(0.85, 0.08, m), 0, 1),     # layout_consistency
                rng.choice([1.0, 0.5, 0.0], m, p=[0.90, 0.08, 0.02]),   # amount_match
                rng.choice([1.0, 0.5, 0.0], m, p=[0.92, 0.06, 0.02]),   # date_validity
                rng.choice([0.0, 1.0], m, p=[0.995, 0.005]),  # duplicate_score
            ])
        else:
            feats = np.column_stack([
                np.clip(rng.normal(0.70, 0.15, m), 0, 1),
                np.clip(rng.normal(0.65, 0.20, m), 0, 1),
                np.clip(rng.normal(0.55, 0.20, m), 0, 1),
                np.clip(rng.beta(5, 4, m), 0, 1),             # tampering_score (high)
                np.clip(rng.normal(0.35, 0.20, m), 0, 1),
                np.clip(rng.normal(0.55, 0.20, m), 0, 1),
                rng.choice([1.0, 0.5, 0.0], m, p=[0.35, 0.20, 0.45]),
                rng.choice([1.0, 0.5, 0.0], m, p=[0.50, 0.15, 0.35]),
                rng.choice([0.0, 1.0], m, p=[0.80, 0.20]),
            ])
        out[has] = feats
    return np.column_stack([has.astype(float), out])


def generate(n_normal: int = 10_000, n_fraud: int = 1_000, seed: int = 42):
    rng = np.random.default_rng(seed)
    X_n = np.hstack([_tx_block(rng, n_normal, False), _cv_block(rng, n_normal, False)])
    X_f = np.hstack([_tx_block(rng, n_fraud, True),  _cv_block(rng, n_fraud, True)])
    X = np.vstack([X_n, X_f])
    y = np.concatenate([np.zeros(n_normal, dtype=int), np.ones(n_fraud, dtype=int)])
    idx = rng.permutation(len(y))
    assert X.shape[1] == FEATURE_DIM, f"expected {FEATURE_DIM} cols, got {X.shape[1]}"
    return X[idx], y[idx], FEATURE_NAMES

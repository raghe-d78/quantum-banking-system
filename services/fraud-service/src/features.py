"""
Feature extraction (Phase 4.1, extended to v2 by the CV extension).

A transaction event is turned into a fixed-length numeric vector:
  7 transaction features  (amount, cyclic time, 24h Redis sliding window)
+ 1 has_document flag
+ 9 document-CV features  (document-cv-service, joined on event.documentId)
= 17 features, FEATURE_SCHEMA_VERSION "fraud-features-v2".

Rolling-window features use a Redis sorted set (ZADD + ZREMRANGEBYSCORE).
Bumping FEATURE_SCHEMA_VERSION forces load_or_train() to retrain both models.
"""
from __future__ import annotations
import math
import time
from datetime import datetime, timezone

import numpy as np

FEATURE_SCHEMA_VERSION = "fraud-features-v2"
TX_FEATURE_NAMES = [
    "log1p_amount",
    "hour_sin", "hour_cos",
    "dow_sin",  "dow_cos",
    "rolling_24h_count",
    "log1p_rolling_24h_sum",
]
CV_FEATURE_NAMES = [
    "ocr_confidence", "amount_confidence", "document_quality", "tampering_score",
    "signature_similarity", "layout_consistency", "amount_match", "date_validity", "duplicate_score",
]
# Neutral values when no document is attached (must match document-cv-service CV_NEUTRAL).
CV_NEUTRAL = {"ocr_confidence": 0.0, "amount_confidence": 0.0, "document_quality": 0.0, "tampering_score": 0.0,
              "signature_similarity": 0.5, "layout_consistency": 0.5, "amount_match": 0.5, "date_validity": 0.5, "duplicate_score": 0.0}
FEATURE_NAMES = TX_FEATURE_NAMES + ["has_document"] + CV_FEATURE_NAMES
FEATURE_DIM = len(FEATURE_NAMES)
TX_DIM = len(TX_FEATURE_NAMES)

WINDOW_SECONDS = 24 * 3600


def _parse_timestamp(ts) -> datetime:
    if ts is None:
        return datetime.now(timezone.utc)
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(float(ts), tz=timezone.utc)
    s = str(ts).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return datetime.now(timezone.utc)


def vectorize_tx(amount: float, ts, rolling_count: float, rolling_sum: float) -> np.ndarray:
    """Pure transformation of the 7 transaction features — no I/O."""
    dt = _parse_timestamp(ts)
    h_rad = 2 * math.pi * (dt.hour + dt.minute / 60.0) / 24.0
    d_rad = 2 * math.pi * dt.weekday() / 7.0
    return np.array([
        math.log1p(max(0.0, float(amount))),
        math.sin(h_rad), math.cos(h_rad),
        math.sin(d_rad), math.cos(d_rad),
        float(rolling_count),
        math.log1p(max(0.0, float(rolling_sum))),
    ], dtype=np.float64)


def cv_vector(cv: dict | None) -> np.ndarray:
    """[has_document] + 9 CV features; neutral when no document."""
    if not cv:
        return np.array([0.0] + [CV_NEUTRAL[n] for n in CV_FEATURE_NAMES], dtype=np.float64)
    return np.array([1.0] + [float(cv.get(n, CV_NEUTRAL[n])) for n in CV_FEATURE_NAMES], dtype=np.float64)


def vectorize(amount: float, ts, rolling_count: float, rolling_sum: float, cv: dict | None = None) -> np.ndarray:
    return np.concatenate([vectorize_tx(amount, ts, rolling_count, rolling_sum), cv_vector(cv)])


def update_window_and_extract(redis_client, account_id: str, transaction_id: str,
                              amount: float, ts) -> tuple[float, float]:
    """True 24h sliding window in Redis. Returns (count, sum) INCLUDING the current event; idempotent on tx id."""
    if redis_client is None:
        return 1.0, float(amount)

    now_s = _parse_timestamp(ts).timestamp()
    cutoff = now_s - WINDOW_SECONDS
    zkey = f"fraud:rolling:{account_id}:events"
    hkey = f"fraud:rolling:{account_id}:amounts"

    pipe = redis_client.pipeline()
    pipe.zadd(zkey, {transaction_id: now_s})
    pipe.hset(hkey, transaction_id, float(amount))
    pipe.zremrangebyscore(zkey, "-inf", cutoff)
    pipe.zrange(zkey, 0, -1)
    pipe.expire(zkey, WINDOW_SECONDS + 3600)
    pipe.expire(hkey, WINDOW_SECONDS + 3600)
    _, _, _, members, *_ = pipe.execute()

    members = [m.decode() if isinstance(m, bytes) else m for m in (members or [])]
    if members:
        amounts_raw = redis_client.hmget(hkey, members) or []
        total = sum(float(a) for a in amounts_raw if a is not None)
        stale = redis_client.hkeys(hkey) or []
        stale = {(k.decode() if isinstance(k, bytes) else k) for k in stale} - set(members)
        if stale:
            redis_client.hdel(hkey, *stale)
        return float(len(members)), total
    return 1.0, float(amount)


def build_features(redis_client, event: dict, cv: dict | None = None) -> tuple[np.ndarray, dict]:
    """Top-level entry used by the Kafka consumer & /fraud/score. `cv` = document features (or None)."""
    account_id     = event.get("accountId") or "unknown"
    transaction_id = event.get("transactionId") or f"adhoc-{int(time.time()*1000)}"
    amount         = float(event.get("amount") or 0.0)
    ts             = event.get("timestamp")

    count, total = update_window_and_extract(redis_client, account_id, transaction_id, amount, ts)
    vec          = vectorize(amount, ts, count, total, cv)
    diag         = {
        "schemaVersion":     FEATURE_SCHEMA_VERSION,
        "rolling_24h_count": count,
        "rolling_24h_sum":   total,
        "has_document":      bool(cv),
        "feature_names":     FEATURE_NAMES,
    }
    return vec, diag

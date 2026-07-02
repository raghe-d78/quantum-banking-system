"""
Feature extraction (Phase 4.1).

A single transaction event coming off the `transaction.events` Kafka topic is
turned into a fixed-length numeric feature vector. Rolling-window features
(`rolling_24h_count`, `rolling_24h_sum`) are computed from a Redis sorted set
that is kept in true sliding-window form via ZADD + ZREMRANGEBYSCORE.

Feature schema is versioned so trained models and live inference always agree
on shape/order. Bumping FEATURE_SCHEMA_VERSION requires retraining.
"""
from __future__ import annotations
import math
import time
from datetime import datetime, timezone
from typing import Optional

import numpy as np

FEATURE_SCHEMA_VERSION = "fraud-features-v1"
FEATURE_NAMES = [
    "log1p_amount",
    "hour_sin", "hour_cos",
    "dow_sin",  "dow_cos",
    "rolling_24h_count",
    "log1p_rolling_24h_sum",
]
FEATURE_DIM = len(FEATURE_NAMES)

WINDOW_SECONDS = 24 * 3600


def _parse_timestamp(ts) -> datetime:
    """Accept ISO8601 string or numeric epoch seconds. Default to now()."""
    if ts is None:
        return datetime.now(timezone.utc)
    if isinstance(ts, (int, float)):
        return datetime.fromtimestamp(float(ts), tz=timezone.utc)
    s = str(ts).replace("Z", "+00:00")
    try:
        return datetime.fromisoformat(s)
    except Exception:
        return datetime.now(timezone.utc)


def vectorize(amount: float, ts, rolling_count: float, rolling_sum: float) -> np.ndarray:
    """Pure transformation — no I/O, easy to unit test."""
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


def update_window_and_extract(redis_client, account_id: str, transaction_id: str,
                              amount: float, ts) -> tuple[float, float]:
    """
    True 24h sliding window in Redis (sorted set keyed by tx timestamp).
    Returns (count, sum) for the trailing 24h INCLUDING the current event.

    Idempotent on (account_id, transaction_id) thanks to ZADD's set semantics.
    A separate hash `fraud:rolling:{acc}:amounts` stores per-tx amounts so we
    can compute the rolling sum exactly. Both keys auto-expire 25h after the
    last write.
    """
    if redis_client is None:
        # graceful fallback for unit tests / first event
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
        # tidy: drop hash fields that fell out of the window
        stale = redis_client.hkeys(hkey) or []
        stale = {(k.decode() if isinstance(k, bytes) else k) for k in stale} - set(members)
        if stale:
            redis_client.hdel(hkey, *stale)
        return float(len(members)), total

    return 1.0, float(amount)


def build_features(redis_client, event: dict) -> tuple[np.ndarray, dict]:
    """
    Top-level entry point used by the Kafka consumer & /fraud/score endpoint.
    `event` follows the `transaction.events` schema published by account-service.
    """
    account_id     = event.get("accountId") or "unknown"
    transaction_id = event.get("transactionId") or f"adhoc-{int(time.time()*1000)}"
    amount         = float(event.get("amount") or 0.0)
    ts             = event.get("timestamp")

    count, total = update_window_and_extract(redis_client, account_id, transaction_id, amount, ts)
    vec          = vectorize(amount, ts, count, total)
    diag         = {
        "schemaVersion":        FEATURE_SCHEMA_VERSION,
        "rolling_24h_count":    count,
        "rolling_24h_sum":      total,
        "feature_names":        FEATURE_NAMES,
    }
    return vec, diag

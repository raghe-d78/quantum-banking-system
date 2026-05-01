"""
Storage adapters: CockroachDB (psycopg2) + Redis.

CockroachDB is used for durable persistence of fraud_scores + fraud_alerts.
Redis is used for transient sliding-window features. Both clients are lazy
so unit tests don't need real backends.
"""
from __future__ import annotations
import os
import json
import logging

log = logging.getLogger("fraud.store")

# ------------------------------- Postgres ------------------------------------

_pool = None


def _get_pool():
    global _pool
    if _pool is not None:
        return _pool
    import psycopg2
    from psycopg2 import pool
    host = os.environ.get("DB_HOST", "cockroachdb")
    port = int(os.environ.get("DB_PORT", "26257"))
    user = os.environ.get("DB_USER", "root")
    db   = os.environ.get("DB_NAME", "fraud_db")
    _pool = pool.ThreadedConnectionPool(
        minconn=1, maxconn=8, host=host, port=port, user=user, dbname=db, sslmode="disable"
    )
    return _pool


def _exec(sql: str, params: tuple = ()):
    p = _get_pool()
    conn = p.getconn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                if cur.description:
                    return cur.fetchall()
                return None
    finally:
        p.putconn(conn)


def insert_score(*, transaction_id: str, account_id: str, classical_score: float,
                 quantum_score: float, decision_score: float, risk_level: str,
                 classical_model: str, quantum_model: str, scored_at: str,
                 features_json: dict | None = None) -> bool:
    """
    Idempotent on transaction_id. Returns True when a new row was inserted,
    False when an existing row was kept (effectively-exactly-once scoring).
    """
    rows = _exec(
        """
        INSERT INTO fraud_scores (
          transaction_id, account_id, classical_score, quantum_score,
          decision_score, risk_level, classical_model, quantum_model,
          scored_at, features
        )
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (transaction_id) DO NOTHING
        RETURNING transaction_id
        """,
        (
            transaction_id, account_id, classical_score, quantum_score,
            decision_score, risk_level, classical_model, quantum_model,
            scored_at, json.dumps(features_json or {}),
        ),
    )
    return bool(rows)


def insert_alert(*, transaction_id: str, account_id: str, risk_level: str,
                 decision_score: float, payload: dict) -> bool:
    rows = _exec(
        """
        INSERT INTO fraud_alerts (
          transaction_id, account_id, risk_level, decision_score, status, payload
        )
        VALUES (%s,%s,%s,%s,'OPEN',%s)
        ON CONFLICT (transaction_id) DO NOTHING
        RETURNING transaction_id
        """,
        (transaction_id, account_id, risk_level, decision_score, json.dumps(payload)),
    )
    return bool(rows)


def list_alerts(limit: int = 50):
    rows = _exec(
        """
        SELECT transaction_id, account_id, risk_level, decision_score, status,
               created_at, resolved_at, resolved_by
          FROM fraud_alerts
         ORDER BY created_at DESC
         LIMIT %s
        """,
        (int(limit),),
    ) or []
    return [
        {
            "transactionId":  str(r[0]),
            "accountId":      str(r[1]),
            "riskLevel":      r[2],
            "decisionScore":  float(r[3]),
            "status":         r[4],
            "createdAt":      r[5].isoformat() if r[5] else None,
            "resolvedAt":     r[6].isoformat() if r[6] else None,
            "resolvedBy":     str(r[7]) if r[7] else None,
        }
        for r in rows
    ]


def stats():
    rows = _exec(
        """
        SELECT COUNT(*)::INT8                                   AS total_scored,
               COUNT(*) FILTER (WHERE risk_level='Low')::INT8       AS low,
               COUNT(*) FILTER (WHERE risk_level='Medium')::INT8    AS medium,
               COUNT(*) FILTER (WHERE risk_level='High')::INT8      AS high,
               COUNT(*) FILTER (WHERE risk_level='Critical')::INT8  AS critical,
               (SELECT COUNT(*) FROM fraud_alerts WHERE status='OPEN')::INT8 AS open_alerts
          FROM fraud_scores
        """
    ) or [(0, 0, 0, 0, 0, 0)]
    r = rows[0]
    return {
        "totalScored": int(r[0]), "low": int(r[1]), "medium": int(r[2]),
        "high": int(r[3]), "critical": int(r[4]), "openAlerts": int(r[5]),
    }


def healthcheck() -> bool:
    try:
        _exec("SELECT 1")
        return True
    except Exception as e:
        log.warning("fraud_db unhealthy: %s", e)
        return False


# --------------------------------- Redis -------------------------------------

_redis = None


def get_redis():
    global _redis
    if _redis is not None:
        return _redis
    try:
        import redis as redis_mod
        url = os.environ.get("REDIS_URL", "redis://redis:6379")
        _redis = redis_mod.from_url(url, socket_timeout=2)
        _redis.ping()
    except Exception as e:
        log.warning("redis unavailable, sliding-window features disabled: %s", e)
        _redis = None
    return _redis

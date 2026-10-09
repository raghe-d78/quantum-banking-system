"""
Storage adapters: CockroachDB (psycopg2) + Redis.

fraud_scores / fraud_alerts are keyed on (transaction_id, account_id) so BOTH
legs of a transfer are scored and recorded; ON CONFLICT DO NOTHING keeps the
consumer idempotent across Kafka redeliveries.
"""
from __future__ import annotations
import os
import json
import logging

log = logging.getLogger("fraud.store")

# ------------------------------- CockroachDB ----------------------------------

_pool = None


def _get_pool():
    global _pool
    if _pool is not None:
        return _pool
    from psycopg2 import pool
    _pool = pool.ThreadedConnectionPool(
        minconn=1, maxconn=int(os.environ.get("DB_POOL_MAX", "8")),
        host=os.environ.get("DB_HOST", "cockroachdb"),
        port=int(os.environ.get("DB_PORT", "26257")),
        user=os.environ.get("DB_USER", "root"),
        password=os.environ.get("DB_PASSWORD") or None,
        dbname=os.environ.get("DB_NAME", "fraud_db"),
        sslmode=os.environ.get("DB_SSL", "disable"),
        application_name="fraud-service",
    )
    return _pool


def _exec(sql: str, params: tuple = ()):
    import psycopg2
    p = _get_pool()
    conn = p.getconn()
    broken = False
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchall() if cur.description else None
    except psycopg2.OperationalError:
        broken = True
        raise
    finally:
        p.putconn(conn, close=broken)


def insert_score(*, transaction_id, account_id, classical_score, quantum_score, decision_score,
                 risk_level, classical_model, quantum_model, scored_at, features_json=None) -> bool:
    rows = _exec(
        """
        INSERT INTO fraud_scores (
          transaction_id, account_id, classical_score, quantum_score, decision_score,
          risk_level, classical_model, quantum_model, scored_at, features
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        ON CONFLICT (transaction_id, account_id) DO NOTHING
        RETURNING transaction_id
        """,
        (transaction_id, account_id, classical_score, quantum_score, decision_score,
         risk_level, classical_model, quantum_model, scored_at, json.dumps(features_json or {})),
    )
    return bool(rows)


def insert_alert(*, transaction_id, account_id, risk_level, decision_score, payload) -> bool:
    rows = _exec(
        """
        INSERT INTO fraud_alerts (transaction_id, account_id, risk_level, decision_score, status, payload)
        VALUES (%s,%s,%s,%s,'OPEN',%s)
        ON CONFLICT (transaction_id, account_id) DO NOTHING
        RETURNING transaction_id
        """,
        (transaction_id, account_id, risk_level, decision_score, json.dumps(payload)),
    )
    return bool(rows)


def resolve_alerts(*, transaction_id: str, status: str, resolved_by: str | None,
                   account_id: str | None = None) -> int:
    """Close every OPEN alert of a transaction (both legs). Returns rows updated."""
    assert status in ("CANCELLED", "DISMISSED")
    sql = """
        UPDATE fraud_alerts
           SET status = %s, resolved_at = now(), resolved_by = %s
         WHERE transaction_id = %s AND status = 'OPEN'
    """
    params = [status, resolved_by, transaction_id]
    if account_id:
        sql += " AND account_id = %s"
        params.append(account_id)
    rows = _exec(sql + " RETURNING transaction_id", tuple(params))
    return len(rows or [])


def list_alerts(limit: int = 50, status: str | None = None, risk: str | None = None):
    sql = """
        SELECT transaction_id, account_id, risk_level, decision_score, status,
               created_at, resolved_at, resolved_by
          FROM fraud_alerts WHERE 1=1
    """
    params: list = []
    if status in ("OPEN", "CANCELLED", "DISMISSED"):
        sql += " AND status = %s"; params.append(status)
    if risk in ("High", "Critical"):
        sql += " AND risk_level = %s"; params.append(risk)
    sql += " ORDER BY created_at DESC LIMIT %s"
    params.append(int(limit))
    rows = _exec(sql, tuple(params)) or []
    return [
        {
            "transactionId": str(r[0]), "accountId": str(r[1]), "riskLevel": r[2],
            "decisionScore": float(r[3]), "status": r[4],
            "createdAt": r[5].isoformat() if r[5] else None,
            "resolvedAt": r[6].isoformat() if r[6] else None,
            "resolvedBy": str(r[7]) if r[7] else None,
        }
        for r in rows
    ]


def stats():
    rows = _exec(
        """
        SELECT COUNT(*)::INT8,
               COUNT(*) FILTER (WHERE risk_level='Low')::INT8,
               COUNT(*) FILTER (WHERE risk_level='Medium')::INT8,
               COUNT(*) FILTER (WHERE risk_level='High')::INT8,
               COUNT(*) FILTER (WHERE risk_level='Critical')::INT8,
               (SELECT COUNT(*) FROM fraud_alerts WHERE status='OPEN')::INT8,
               (SELECT COUNT(*) FROM fraud_alerts WHERE status='CANCELLED')::INT8,
               (SELECT COUNT(*) FROM fraud_alerts WHERE status='DISMISSED')::INT8
          FROM fraud_scores
        """
    ) or [(0,) * 8]
    r = rows[0]
    return {
        "totalScored": int(r[0]), "low": int(r[1]), "medium": int(r[2]), "high": int(r[3]),
        "critical": int(r[4]), "openAlerts": int(r[5]), "cancelledAlerts": int(r[6]), "dismissedAlerts": int(r[7]),
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
        _redis = redis_mod.from_url(os.environ.get("REDIS_URL", "redis://redis:6379"), socket_timeout=2)
        _redis.ping()
    except Exception as e:
        log.warning("redis unavailable, sliding-window features disabled: %s", e)
        _redis = None
    return _redis

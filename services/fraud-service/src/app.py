"""
fraud-service entrypoint — Phase 4.

Endpoints:
  GET  /health                       liveness + model versions
  GET  /fraud/stats                  counts per risk level + open alerts
  GET  /fraud/alerts?limit=50&status=OPEN   recent alerts (staff)
  POST /fraud/alerts/<tx>/dismiss    close an alert as benign (staff)
  POST /fraud/score                  ad-hoc scoring (staff)

All /fraud/* routes require a staff JWT (see auth.py).

The Kafka consumer thread starts automatically when the Flask app boots,
unless FRAUD_CONSUMER_ENABLED=false (used for unit tests).
"""
from __future__ import annotations
import logging
import os
import threading
from datetime import datetime, timezone

from flask import Flask, g, jsonify, request

from . import baseline as baseline_mod
from . import vqc      as vqc_mod
from .features import FEATURE_SCHEMA_VERSION
from .risk     import decide
from .store    import healthcheck as db_healthcheck, get_redis, list_alerts, stats, resolve_alerts
from .auth     import require_staff

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("fraud.app")

MODELS_DIR = os.environ.get("FRAUD_MODELS_DIR", "/app/models")

app = Flask(__name__)

# --- bootstrap models (load if present, otherwise train + save) --------------
log.info("loading baseline model from %s …", MODELS_DIR)
BASELINE = baseline_mod.load_or_train(MODELS_DIR)
log.info("baseline ready: %s", BASELINE.metadata["metrics"])

log.info("loading VQC model from %s … (will train if missing — may take ~1-2 min)", MODELS_DIR)
VQC = vqc_mod.load_or_train(MODELS_DIR)
log.info("VQC ready: %s", VQC.metadata["metrics"])

# --- Kafka consumer thread ---------------------------------------------------
_worker = None
_worker_lock = threading.Lock()

def _start_worker():
    global _worker
    with _worker_lock:
        if _worker is not None and _worker.is_alive():
            return
        from .consumer import FraudWorker
        _worker = FraudWorker(BASELINE, VQC)
        _worker.start()

_start_worker()


# --- helpers -----------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# --- HTTP endpoints ----------------------------------------------------------

@app.get("/health")
def health():
    return jsonify(
        status="fraud-service running",
        baseline=BASELINE.metadata["modelVersion"],
        quantum=VQC.metadata["modelVersion"],
        featureSchemaVersion=FEATURE_SCHEMA_VERSION,
        consumer=("running" if (_worker is not None and _worker.is_alive()) else "stopped"),
        db=db_healthcheck(),
    )


@app.get("/ready")
def ready():
    ok = db_healthcheck()
    return jsonify(status="ready" if ok else "degraded"), (200 if ok else 503)


@app.get("/fraud/stats")
@require_staff
def fraud_stats():
    try:
        s = stats()
        if _worker is not None:
            s["consumerProcessed"] = int(_worker.processed)
            s["consumerAlerts"]    = int(_worker.alerts)
            s["consumerLastError"] = _worker.last_error
        return jsonify(s)
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.get("/fraud/alerts")
@require_staff
def fraud_alerts():
    try:
        limit = max(1, min(200, int(request.args.get("limit", "50"))))
        return jsonify(alerts=list_alerts(limit, status=request.args.get("status"), risk=request.args.get("risk")))
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.post("/fraud/alerts/<transaction_id>/dismiss")
@require_staff
def dismiss_alert(transaction_id: str):
    """Mark an alert as reviewed-and-benign without touching the ledger."""
    try:
        n = resolve_alerts(transaction_id=transaction_id, status="DISMISSED", resolved_by=g.user.get("userId"))
        if n == 0:
            return jsonify(ok=False, code="NOT_FOUND", message="No open alert for this transaction"), 404
        return jsonify(ok=True, transactionId=transaction_id, status="DISMISSED", updated=n)
    except Exception as e:
        return jsonify(error=str(e)), 500


@app.post("/fraud/score")
@require_staff
def fraud_score():
    """
    Ad-hoc scoring. Body accepts either a transaction event or raw features.
    {
      "transactionId": "...", "accountId": "...", "amount": 1234, "timestamp": "..."
    }
    """
    body = request.get_json(silent=True) or {}
    if not body:
        return jsonify(error="empty body"), 400
    try:
        # use the same code path as the consumer for consistency
        if _worker is None:
            from .consumer import FraudWorker
            tmp = FraudWorker(BASELINE, VQC)
            scored = tmp.score_event(body)
        else:
            scored = _worker.score_event(body)
        return jsonify(scored)
    except Exception as e:
        log.exception("scoring failed")
        return jsonify(error=str(e)), 500


@app.get("/fraud/model-info")
@require_staff
def model_info():
    return jsonify(
        baseline=BASELINE.metadata,
        quantum=VQC.metadata,
        featureSchemaVersion=FEATURE_SCHEMA_VERSION,
    )

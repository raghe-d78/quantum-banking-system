"""
Kafka consumer (Phase 4.3) — `transaction.events` → score → `transaction.scored`.

We use confluent-kafka with manual commits, after both:
  - fraud_scores row inserted (idempotent on transaction_id), AND
  - transaction.scored event produced AND flushed.

Critical/High verdicts also write a fraud_alerts row.
"""
from __future__ import annotations
import json
import logging
import os
import threading
import time
from datetime import datetime, timezone

from .features import build_features, FEATURE_SCHEMA_VERSION
from .risk     import decide
from .store    import get_redis, insert_score, insert_alert

log = logging.getLogger("fraud.consumer")

KAFKA_BROKERS    = os.environ.get("KAFKA_BROKERS", "kafka:9092")
TX_TOPIC         = os.environ.get("TX_EVENTS_TOPIC", "transaction.events")
SCORED_TOPIC     = os.environ.get("TX_SCORED_TOPIC", "transaction.scored")
GROUP_ID         = os.environ.get("FRAUD_GROUP_ID", "fraud-workers")
ENABLE_CONSUMER  = os.environ.get("FRAUD_CONSUMER_ENABLED", "true").lower() == "true"


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class FraudWorker(threading.Thread):
    daemon = True

    def __init__(self, baseline_bundle, vqc_bundle):
        super().__init__(name="fraud-consumer")
        self.baseline   = baseline_bundle
        self.vqc        = vqc_bundle
        self._stop      = threading.Event()
        self.consumer   = None
        self.producer   = None
        self.processed  = 0
        self.alerts     = 0
        self.last_error = None

    def stop(self):
        self._stop.set()

    def _connect(self):
        from confluent_kafka import Consumer, Producer
        self.consumer = Consumer({
            "bootstrap.servers":  KAFKA_BROKERS,
            "group.id":           GROUP_ID,
            "enable.auto.commit": False,
            "auto.offset.reset":  "earliest",
            "session.timeout.ms": 30000,
        })
        self.producer = Producer({"bootstrap.servers": KAFKA_BROKERS})
        self.consumer.subscribe([TX_TOPIC])
        log.info("fraud-consumer subscribed to %s (group=%s)", TX_TOPIC, GROUP_ID)

    def score_event(self, event: dict) -> dict:
        redis_client = get_redis()
        feats, diag  = build_features(redis_client, event)
        c_score      = self.baseline.predict_proba(feats)
        q_score      = self.vqc.predict_proba(feats)
        verdict      = decide(c_score, q_score, self.baseline.metadata["modelVersion"], self.vqc.metadata["modelVersion"])
        scored = verdict.to_event(
            transaction_id=event.get("transactionId", ""),
            account_id=event.get("accountId", ""),
            scored_at=_now_iso(),
            schema_version=FEATURE_SCHEMA_VERSION,
        )
        scored["_features"] = {n: float(v) for n, v in zip(diag["feature_names"], feats)}
        scored["_diagnostics"] = {k: v for k, v in diag.items() if k != "feature_names"}
        return scored

    def _handle(self, event: dict):
        scored = self.score_event(event)
        tx_id  = event.get("transactionId", "")
        acc_id = event.get("accountId", "")
        if not tx_id or not acc_id:
            log.warning("fraud-consumer: skipping event without ids: %s", event)
            return

        # 1) persist score (idempotent)
        insert_score(
            transaction_id=tx_id,
            account_id=acc_id,
            classical_score=scored["classical"]["score"],
            quantum_score=scored["quantum"]["score"],
            decision_score=scored["decisionScore"],
            risk_level=scored["riskLevel"],
            classical_model=scored["classical"]["modelVersion"],
            quantum_model=scored["quantum"]["modelVersion"],
            scored_at=scored["scoredAt"],
            features_json=scored.get("_features"),
        )

        # 2) alert on High / Critical
        if scored["riskLevel"] in ("High", "Critical"):
            if insert_alert(
                transaction_id=tx_id, account_id=acc_id,
                risk_level=scored["riskLevel"], decision_score=scored["decisionScore"],
                payload=scored,
            ):
                self.alerts += 1
                log.warning("FRAUD ALERT %s for tx=%s acc=%s score=%.3f",
                            scored["riskLevel"], tx_id, acc_id, scored["decisionScore"])

        # 3) publish scored event
        self.producer.produce(SCORED_TOPIC, key=acc_id, value=json.dumps(scored).encode())
        self.producer.flush(5)
        self.processed += 1

    def run(self):
        if not ENABLE_CONSUMER:
            log.info("fraud-consumer disabled by env")
            return
        # backoff loop on broker connect
        for attempt in range(30):
            try:
                self._connect()
                break
            except Exception as e:
                log.warning("kafka connect attempt %d failed: %s", attempt, e)
                time.sleep(2)
        else:
            log.error("fraud-consumer: giving up on kafka")
            return

        while not self._stop.is_set():
            msg = self.consumer.poll(1.0)
            if msg is None:
                continue
            if msg.error():
                log.warning("kafka poll error: %s", msg.error())
                continue
            try:
                event = json.loads(msg.value().decode())
                self._handle(event)
                self.consumer.commit(asynchronous=False)
            except Exception as e:
                self.last_error = str(e)
                log.exception("fraud-consumer: failed to handle message: %s", e)
                # do NOT commit — let Kafka redeliver. insert_score is idempotent.
                time.sleep(1)

        try: self.consumer.close()
        except Exception: pass

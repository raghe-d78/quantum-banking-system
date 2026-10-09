"""Kafka producer for `document.analyzed` (spec §13). Best-effort: never blocks the upload."""
from __future__ import annotations
import json
import logging

from .config import DOC_TOPIC, KAFKA_BROKERS, KAFKA_ENABLED

log = logging.getLogger("cv.events")
_producer = None


def _get():
    global _producer
    if _producer is None:
        from confluent_kafka import Producer
        _producer = Producer({"bootstrap.servers": KAFKA_BROKERS, "message.timeout.ms": 5000})
    return _producer


def publish_document_analyzed(payload: dict) -> bool:
    if not KAFKA_ENABLED:
        return False
    try:
        p = _get()
        p.produce(DOC_TOPIC, key=payload.get("ownerUserId", ""), value=json.dumps(payload).encode())
        p.poll(0)
        return True
    except Exception as e:  # noqa: BLE001
        log.warning("document.analyzed publish failed: %s", e)
        return False

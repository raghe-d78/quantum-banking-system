"""Environment-driven configuration for document-cv-service."""
from __future__ import annotations
import os

PORT              = int(os.environ.get("PORT", "3008"))
JWT_SECRET        = os.environ.get("JWT_SECRET", "supersecret_change_in_prod")
STORE_DIR         = os.environ.get("DOCUMENT_STORE_DIR", "/data/documents")
MAX_UPLOAD_BYTES  = int(os.environ.get("DOCUMENT_MAX_BYTES", str(10 * 1024 * 1024)))   # 10 MB (spec §4.1)
MAX_PIXELS        = int(os.environ.get("DOCUMENT_MAX_PIXELS", str(40_000_000)))        # decompression-bomb guard
WORK_MAX_SIDE     = int(os.environ.get("DOCUMENT_WORK_MAX_SIDE", "1600"))              # working resolution
ALLOWED_MIME      = {"image/jpeg", "image/png"}

# Envelope encryption: a 32-byte master key (base64 or hex) wraps per-document
# data keys. Data keys come from the quantum KMS (BB84) when reachable.
MASTER_KEY_RAW    = os.environ.get("DOCUMENT_MASTER_KEY", "")
KMS_URL           = os.environ.get("KMS_SERVICE_URL", "http://kms-service:3006")
KMS_TIMEOUT_S     = float(os.environ.get("KMS_TIMEOUT_S", "20"))

# Risk policy (spec §11: 0.30 / 0.70)
REVIEW_THRESHOLD      = float(os.environ.get("DOCUMENT_REVIEW_THRESHOLD", "0.30"))
SUSPICIOUS_THRESHOLD  = float(os.environ.get("DOCUMENT_SUSPICIOUS_THRESHOLD", "0.70"))
DUPLICATE_HAMMING     = int(os.environ.get("DOCUMENT_DUPLICATE_HAMMING", "6"))
STALE_DAYS            = int(os.environ.get("DOCUMENT_STALE_DAYS", "180"))

# Kafka
KAFKA_BROKERS     = os.environ.get("KAFKA_BROKERS", "kafka:9092")
DOC_TOPIC         = os.environ.get("DOCUMENT_TOPIC", "document.analyzed")
KAFKA_ENABLED     = os.environ.get("DOCUMENT_KAFKA_ENABLED", "true").lower() == "true"

# OCR
TESSERACT_LANGS   = os.environ.get("TESSERACT_LANGS", "eng+fra")

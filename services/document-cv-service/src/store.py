"""
Persistence: CockroachDB (fraud_db.document_analyses, signature_templates) and
the encrypted blob store on disk.

Only metadata and features live in the database; the image ciphertext lives on
the DOCUMENT_STORE_DIR volume as <document_id>.bin. The wrapped data key, the
nonces and the perceptual hash are columns of document_analyses.
"""
from __future__ import annotations
import base64
import json
import logging
import os
from datetime import datetime

from .config import STORE_DIR

log = logging.getLogger("cv.store")
_pool = None


def _get_pool():
    global _pool
    if _pool is not None:
        return _pool
    from psycopg2 import pool
    _pool = pool.ThreadedConnectionPool(
        minconn=1, maxconn=int(os.environ.get("DB_POOL_MAX", "6")),
        host=os.environ.get("DB_HOST", "cockroachdb"), port=int(os.environ.get("DB_PORT", "26257")),
        user=os.environ.get("DB_USER", "root"), password=os.environ.get("DB_PASSWORD") or None,
        dbname=os.environ.get("DB_NAME", "fraud_db"), sslmode=os.environ.get("DB_SSL", "disable"),
        application_name="document-cv-service",
    )
    return _pool


def _exec(sql: str, params: tuple = ()):
    import psycopg2
    p = _get_pool(); conn = p.getconn(); broken = False
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(sql, params)
                return cur.fetchall() if cur.description else None
    except psycopg2.OperationalError:
        broken = True; raise
    finally:
        p.putconn(conn, close=broken)


def healthcheck() -> bool:
    try:
        _exec("SELECT 1"); return True
    except Exception as e:  # noqa: BLE001
        log.warning("db unhealthy: %s", e); return False


# ── blob store ────────────────────────────────────────────────────
def blob_path(document_id: str) -> str:
    return os.path.join(STORE_DIR, f"{document_id}.bin")


def write_blob(document_id: str, ciphertext: bytes) -> None:
    os.makedirs(STORE_DIR, exist_ok=True)
    tmp = blob_path(document_id) + ".tmp"
    with open(tmp, "wb") as f:
        f.write(ciphertext); f.flush(); os.fsync(f.fileno())
    os.replace(tmp, blob_path(document_id))


def read_blob(document_id: str) -> bytes | None:
    try:
        with open(blob_path(document_id), "rb") as f:
            return f.read()
    except FileNotFoundError:
        return None


# ── document_analyses ─────────────────────────────────────────────
B64 = lambda b: base64.b64encode(b).decode() if b is not None else None  # noqa: E731


def insert_document(*, document_id, owner_user_id, kind, mime, size_bytes, sha256, phash, status, risk_score,
                    requires_review, features, ocr, integrity, quality, signature, reasons, expected_amount,
                    expected_currency, duplicate_of, envelope, key_source, kid) -> None:
    _exec(
        """
        INSERT INTO document_analyses (
          document_id, owner_user_id, kind, mime, size_bytes, sha256, phash, status, risk_score, requires_review,
          features, ocr, integrity, quality, signature, reasons, expected_amount, expected_currency, duplicate_of,
          enc_nonce, wrapped_dek, wrap_nonce, key_source, kms_kid
        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
        """,
        (document_id, owner_user_id, kind, mime, size_bytes, sha256, phash, status, risk_score, requires_review,
         json.dumps(features), json.dumps(ocr), json.dumps(integrity), json.dumps(quality), json.dumps(signature),
         json.dumps(reasons), expected_amount, expected_currency, duplicate_of,
         B64(envelope.nonce), B64(envelope.wrapped_dek), B64(envelope.wrap_nonce), key_source, kid),
    )


COLS = ("document_id, owner_user_id, kind, mime, size_bytes, sha256, phash, status, risk_score, requires_review, features, ocr, "
        "integrity, quality, signature, reasons, expected_amount, expected_currency, duplicate_of, transaction_id, "
        "enc_nonce, wrapped_dek, wrap_nonce, key_source, kms_kid, created_at, reviewed_by, reviewed_at, review_note")


def _row_to_doc(r) -> dict:
    keys = [c.strip() for c in COLS.split(",")]
    d = dict(zip(keys, r))
    for k in ("created_at", "reviewed_at"):
        if isinstance(d.get(k), datetime):
            d[k] = d[k].isoformat()
    for k in ("document_id", "owner_user_id", "transaction_id", "duplicate_of", "reviewed_by"):
        if d.get(k) is not None:
            d[k] = str(d[k])
    for k in ("risk_score", "expected_amount"):
        if d.get(k) is not None:
            d[k] = float(d[k])
    return d


def get_document(document_id: str) -> dict | None:
    rows = _exec(f"SELECT {COLS} FROM document_analyses WHERE document_id = %s", (document_id,))
    return _row_to_doc(rows[0]) if rows else None


def list_documents(status: str | None, owner: str | None, limit: int) -> list[dict]:
    sql = f"SELECT {COLS} FROM document_analyses WHERE 1=1"; params: list = []
    if status:
        sql += " AND status = %s"; params.append(status)
    if owner:
        sql += " AND owner_user_id = %s"; params.append(owner)
    sql += " ORDER BY created_at DESC LIMIT %s"; params.append(int(limit))
    return [_row_to_doc(r) for r in (_exec(sql, tuple(params)) or [])]


def find_duplicate(phash_hex: str, owner_user_id: str | None, max_hamming: int) -> str | None:
    """Nearest earlier document by perceptual hash (Hamming distance over 64 bits)."""
    rows = _exec("SELECT document_id, phash FROM document_analyses WHERE phash IS NOT NULL ORDER BY created_at DESC LIMIT 5000") or []
    target = int(phash_hex, 16)
    best = None
    for doc_id, ph in rows:
        try:
            dist = bin(target ^ int(ph, 16)).count("1")
        except (TypeError, ValueError):
            continue
        if dist <= max_hamming and (best is None or dist < best[1]):
            best = (str(doc_id), dist)
    return best[0] if best else None


def mark_reviewed(document_id: str, reviewer: str, note: str | None) -> None:
    _exec("UPDATE document_analyses SET reviewed_by = %s, reviewed_at = now(), review_note = %s WHERE document_id = %s",
          (reviewer, note, document_id))


# ── signature templates ───────────────────────────────────────────
def upsert_signature(user_id: str, descriptor: list[float], crop_png: bytes, enrolled_by: str) -> None:
    _exec(
        """
        INSERT INTO signature_templates (user_id, descriptor, crop_png, enrolled_by)
        VALUES (%s, %s, %s, %s)
        ON CONFLICT (user_id) DO UPDATE SET descriptor = EXCLUDED.descriptor, crop_png = EXCLUDED.crop_png,
                                            enrolled_by = EXCLUDED.enrolled_by, enrolled_at = now()
        """,
        (user_id, json.dumps(descriptor), crop_png, enrolled_by),
    )


def get_signature(user_id: str) -> tuple[list[float], bytes] | None:
    rows = _exec("SELECT descriptor, crop_png FROM signature_templates WHERE user_id = %s", (user_id,))
    if not rows:
        return None
    desc, crop = rows[0]
    return (desc if isinstance(desc, list) else json.loads(desc)), bytes(crop)

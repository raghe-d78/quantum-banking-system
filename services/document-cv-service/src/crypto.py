"""
Envelope encryption for stored documents.

  plaintext image  --AES-256-GCM(DEK)-->  ciphertext      (stored on disk)
  DEK              --AES-256-GCM(MK)--->  wrapped DEK     (stored in document_analyses)

- DEK (data-encryption key) is a fresh 256-bit key per document. When the
  quantum KMS is reachable it is BB84-derived (POST /kms/keys, then the
  read-once GET); otherwise os.urandom. The source is recorded.
- MK (master key) comes from DOCUMENT_MASTER_KEY. It never leaves the
  service; rotating it means re-wrapping the DEKs, not re-encrypting images.
"""
from __future__ import annotations
import base64
import binascii
import hashlib
import logging
import os
from dataclasses import dataclass

import httpx
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .config import KMS_TIMEOUT_S, KMS_URL, MASTER_KEY_RAW

log = logging.getLogger("cv.crypto")


def _parse_master_key(raw: str) -> bytes:
    if not raw:
        # Dev fallback: deterministic from a fixed string so restarts can still
        # decrypt; production must set DOCUMENT_MASTER_KEY (service refuses to
        # start otherwise, see app.py).
        return hashlib.sha256(b"dev-only-document-master-key").digest()
    try:
        b = base64.b64decode(raw, validate=True)
        if len(b) == 32:
            return b
    except (binascii.Error, ValueError):
        pass
    try:
        b = bytes.fromhex(raw)
        if len(b) == 32:
            return b
    except ValueError:
        pass
    return hashlib.sha256(raw.encode()).digest()


MASTER_KEY = _parse_master_key(MASTER_KEY_RAW)


@dataclass
class Envelope:
    ciphertext: bytes
    nonce: bytes
    wrapped_dek: bytes
    wrap_nonce: bytes
    key_source: str
    kid: str | None


def fetch_quantum_dek(auth_header: str | None) -> tuple[bytes, str, str | None]:
    """Mint + consume a BB84-derived AES-256 key from the KMS. Returns (dek, source, kid)."""
    if not auth_header:
        return os.urandom(32), "os.urandom", None
    try:
        with httpx.Client(timeout=KMS_TIMEOUT_S) as c:
            r = c.post(f"{KMS_URL}/kms/keys", headers={"Authorization": auth_header})
            if r.status_code != 201:
                raise RuntimeError(f"kms mint {r.status_code}")
            kid = r.json()["kid"]
            g = c.get(f"{KMS_URL}/kms/keys/{kid}", headers={"Authorization": auth_header})
            if g.status_code != 200:
                raise RuntimeError(f"kms consume {g.status_code}")
            dek = base64.b64decode(g.json()["key_b64"])
            if len(dek) != 32:
                raise RuntimeError("kms key is not 256 bits")
            return dek, "bb84-kms", kid
    except Exception as e:  # noqa: BLE001 — availability must never block an upload
        log.warning("quantum KMS unavailable, using os.urandom: %s", e)
        return os.urandom(32), "os.urandom", None


def encrypt(plaintext: bytes, dek: bytes, aad: bytes) -> tuple[bytes, bytes]:
    nonce = os.urandom(12)
    return AESGCM(dek).encrypt(nonce, plaintext, aad), nonce


def decrypt(ciphertext: bytes, nonce: bytes, dek: bytes, aad: bytes) -> bytes:
    return AESGCM(dek).decrypt(nonce, ciphertext, aad)


def wrap_dek(dek: bytes, aad: bytes) -> tuple[bytes, bytes]:
    nonce = os.urandom(12)
    return AESGCM(MASTER_KEY).encrypt(nonce, dek, aad), nonce


def unwrap_dek(wrapped: bytes, nonce: bytes, aad: bytes) -> bytes:
    return AESGCM(MASTER_KEY).decrypt(nonce, wrapped, aad)


def seal(plaintext: bytes, document_id: str, auth_header: str | None) -> Envelope:
    dek, source, kid = fetch_quantum_dek(auth_header)
    aad = document_id.encode()
    ct, nonce = encrypt(plaintext, dek, aad)
    wrapped, wnonce = wrap_dek(dek, aad)
    return Envelope(ct, nonce, wrapped, wnonce, source, kid)


def open_envelope(env: Envelope, document_id: str) -> bytes:
    aad = document_id.encode()
    dek = unwrap_dek(env.wrapped_dek, env.wrap_nonce, aad)
    return decrypt(env.ciphertext, env.nonce, dek, aad)

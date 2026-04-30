"""In-memory KMS session store backed by BB84 simulation.

Design notes
------------
* Sessions are stored in a plain dict keyed by UUID string.  For production,
  replace with a Redis store with TTL expiry.
* Key derivation: we take the sifted key bits from a BB84 simulation, hash
  them with SHA-256 to ensure uniform distribution regardless of sifted-key
  length, then use the hash as a 256-bit AES key.
* The BB84 simulation uses the local Qiskit Aer backend — replace with a
  real quantum channel for production.

Simulation notice
-----------------
BB84 over a real quantum channel has information-theoretic security guaranteed
by the no-cloning theorem and Heisenberg's uncertainty principle.  The Aer
simulation only mimics the *protocol*, not the quantum channel: a real
adversary with access to the *simulator* could recover the key.  This is
a **PoC only**.
"""
from __future__ import annotations

import base64
import hashlib
import logging
import random
import uuid
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)


def _simulate_bb84(key_length: int = 256) -> tuple[List[int], float]:
    """Run a lightweight BB84 simulation without Qiskit for speed.

    Returns:
        (sifted_bits, qber) — a list of sifted bits and the estimated QBER.
    """
    alice_bits = [random.randint(0, 1) for _ in range(key_length)]
    alice_bases = [random.choice(["Z", "X"]) for _ in range(key_length)]
    bob_bases = [random.choice(["Z", "X"]) for _ in range(key_length)]
    bob_bits = [
        alice_bits[i] if alice_bases[i] == bob_bases[i] else random.randint(0, 1)
        for i in range(key_length)
    ]

    sifted_idx = [i for i in range(key_length) if alice_bases[i] == bob_bases[i]]
    sifted = [alice_bits[i] for i in sifted_idx]

    # QBER sample
    sample_size = max(4, len(sifted) // 4)
    sample_size = min(sample_size, len(sifted))
    if sample_size == 0:
        return sifted, 0.0

    sample = random.sample(range(len(sifted_idx)), sample_size)
    errors = sum(
        1 for i in sample if alice_bits[sifted_idx[i]] != bob_bits[sifted_idx[i]]
    )
    qber = errors / sample_size
    return sifted, round(qber, 4)


def _derive_key(bits: List[int]) -> bytes:
    """Derive a 256-bit AES key from raw sifted bits via SHA-256."""
    if not bits:
        # Fallback: use os.urandom if sifted key is empty
        import os
        return os.urandom(32)

    # Pack bits into bytes, padding to the next multiple of 8
    padded = bits + [0] * ((8 - len(bits) % 8) % 8)
    byte_val = int("".join(str(b) for b in padded), 2).to_bytes(len(padded) // 8, "big")
    return hashlib.sha256(byte_val).digest()


class KMSStore:
    """Thread-unsafe in-memory session store.

    Replace with a Redis or database-backed store for multi-replica deployments.
    """

    def __init__(self) -> None:
        self._sessions: Dict[str, Dict[str, Any]] = {}

    def create_session(self, peer: str) -> Dict[str, Any]:
        """Create a new QKD session and return its metadata.

        Args:
            peer: Identifier of the requesting peer.

        Returns:
            Dict with key_id, key_b64, qber, scheme, peer, caveat.
        """
        sifted_bits, qber = _simulate_bb84(key_length=512)
        raw_key = _derive_key(sifted_bits)
        key_b64 = base64.b64encode(raw_key).decode("ascii")
        key_id = str(uuid.uuid4())

        session: Dict[str, Any] = {
            "key_id": key_id,
            "key_b64": key_b64,
            "qber": qber,
            "scheme": "BB84-sim",
            "peer": peer,
            "caveat": "⚠ PoC only: key is re-readable. Real QKD keys must be consumed once.",
        }
        self._sessions[key_id] = session
        logger.info("Created KMS session key_id=%s peer=%s qber=%.4f", key_id, peer, qber)
        return session

    def get_session(self, key_id: str) -> Optional[Dict[str, Any]]:
        """Retrieve a session by *key_id*, or None if not found."""
        return self._sessions.get(key_id)

    def count(self) -> int:
        """Return the number of active sessions."""
        return len(self._sessions)

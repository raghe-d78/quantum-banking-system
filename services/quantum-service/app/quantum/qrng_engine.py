"""Quantum Random Number Generator using the Hadamard gate.

Mathematical foundation
-----------------------
Applying the Hadamard gate to the ground state |0⟩ yields the equal superposition::

    H|0⟩ = (|0⟩ + |1⟩) / √2

Upon measurement, the Born rule gives:

    P(0) = |⟨0|H|0⟩|² = 1/2
    P(1) = |⟨1|H|0⟩|² = 1/2

Each qubit therefore contributes exactly **1 bit of entropy** — the maximum for a
binary random variable.  This is true quantum randomness: unlike PRNG outputs it
cannot be predicted even with unlimited classical computation.

Implementation notes
---------------------
* Circuits are built with ``QRNG_BATCH_SIZE`` qubits and executed for a single
  shot so that each run produces ``QRNG_BATCH_SIZE`` independent random bits.
* The Qiskit Aer statevector/QASM simulator is used here for portability.  In
  production, replace the backend with a real quantum hardware provider.
"""
from __future__ import annotations

import logging
from typing import Any, Dict

from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

logger = logging.getLogger(__name__)

QRNG_BATCH_SIZE: int = 8  # qubits per circuit


class QRNGEngine:
    """Hadamard-based quantum random number generator.

    Uses :class:`qiskit_aer.AerSimulator` to simulate the quantum circuit
    locally.  Swap the backend for a real device to obtain hardware-grade
    randomness.
    """

    def __init__(self, batch_size: int = QRNG_BATCH_SIZE) -> None:
        self._batch_size = batch_size
        self._backend = AerSimulator()
        logger.debug("QRNGEngine initialised with batch_size=%d", batch_size)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_circuit(self, n_qubits: int) -> QuantumCircuit:
        """Return a circuit that places *n_qubits* into equal superposition and measures them."""
        qc = QuantumCircuit(n_qubits, n_qubits)
        qc.h(range(n_qubits))
        qc.measure(range(n_qubits), range(n_qubits))
        return qc

    def _run_circuit(self, n_qubits: int) -> str:
        """Execute a single-shot H-measure circuit and return the bit-string result."""
        qc = self._build_circuit(n_qubits)
        job = self._backend.run(qc, shots=1)
        result = job.result()
        counts = result.get_counts()
        # counts keys are bit-strings like '01101100' (LSB first from Qiskit)
        bit_string = list(counts.keys())[0]
        # Pad to n_qubits (Qiskit may omit leading zeros)
        return bit_string.zfill(n_qubits)

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def generate_bits(self, n_bits: int) -> Dict[str, Any]:
        """Generate *n_bits* quantum-random bits.

        Args:
            n_bits: Number of bits to generate (must be ≥ 1).

        Returns:
            Dict with keys:
                - ``bits``: string of '0'/'1' characters.
                - ``n_bits``: actual number of bits.
                - ``bytes_hex``: hex string of bytes (zero-padded to full bytes).
                - ``method``: ``"hadamard-aer"``.
        """
        if n_bits < 1:
            raise ValueError("n_bits must be ≥ 1")

        bits: list[str] = []
        remaining = n_bits
        while remaining > 0:
            chunk = min(remaining, self._batch_size)
            bits.append(self._run_circuit(chunk))
            remaining -= chunk

        bit_string = "".join(bits)[:n_bits]

        # Convert to bytes (zero-pad to multiple of 8)
        padded = bit_string.ljust(((n_bits + 7) // 8) * 8, "0")
        byte_val = int(padded, 2).to_bytes(len(padded) // 8, "big")
        bytes_hex = byte_val.hex()

        return {
            "bits": bit_string,
            "n_bits": n_bits,
            "bytes_hex": bytes_hex,
            "method": "hadamard-aer",
        }

    def generate_bytes(self, n_bytes: int) -> Dict[str, Any]:
        """Generate *n_bytes* quantum-random bytes.

        Args:
            n_bytes: Number of bytes to generate (must be ≥ 1).

        Returns:
            Dict with keys ``hex`` and ``n_bytes``.
        """
        if n_bytes < 1:
            raise ValueError("n_bytes must be ≥ 1")
        result = self.generate_bits(n_bytes * 8)
        return {"hex": result["bytes_hex"], "n_bytes": n_bytes}

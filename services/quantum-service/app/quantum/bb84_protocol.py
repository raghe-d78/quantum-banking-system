"""BB84 Quantum Key Distribution Protocol simulation.

Protocol overview
-----------------
BB84 (Bennett & Brassard, 1984) is the first — and most widely deployed —
quantum key distribution protocol.  Its security rests on two quantum
mechanical principles:

1. **No-Cloning Theorem** — an unknown quantum state cannot be perfectly
   copied.  An eavesdropper who measures Alice's qubits necessarily disturbs
   them, introducing detectable errors.

2. **Heisenberg Uncertainty** — measuring in the wrong basis destroys the
   information encoded in the correct basis.

Protocol steps
--------------
1. **Alice** generates *n* random bits and *n* random bases (Z = rectilinear,
   X = diagonal).
2. **Alice encodes**:
   - Basis Z, bit 0 → |0⟩;  basis Z, bit 1 → |1⟩
   - Basis X, bit 0 → |+⟩ = H|0⟩;  basis X, bit 1 → |−⟩ = H|1⟩
3. **Eve (optional)** intercepts each qubit, measures in a *random* basis,
   and re-sends.  When Eve's basis differs from Alice's, she introduces an
   error with probability 1/2.
4. **Bob** measures each qubit in a random basis.
5. **Sifting** — Alice and Bob publicly compare bases; only positions where
   they agree are kept.
6. **QBER estimation** — a random sample of the sifted key is compared.
   The QBER = errors / sample_size.  If QBER > 11 % (the BB84 threshold),
   eavesdropping is flagged.

Detection probability
---------------------
If Eve intercepts every qubit, she introduces errors with probability 1/2
per intercepted bit *that survives sifting*.  After comparing *k* check bits,
the probability of Eve *not* being caught is:

    P(undetected) = (3/4)^k

For k = 100 this is ≈ 3 × 10⁻¹³.

Simulation notes
----------------
This implementation uses Qiskit circuits executed on :class:`qiskit_aer.AerSimulator`
to faithfully model quantum encoding and measurement.
"""
from __future__ import annotations

import logging
import random
from typing import Any, Dict, List, Tuple

from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

logger = logging.getLogger(__name__)

QBER_THRESHOLD: float = 0.11  # BB84 security threshold
SAMPLE_FRACTION: float = 0.25  # fraction of sifted key used for QBER check
MIN_SAMPLE: int = 4


class BB84Protocol:
    """Simulated BB84 QKD protocol.

    Args:
        qber_threshold: QBER value above which eavesdropping is flagged.
            Defaults to 0.11 (11 %).
    """

    def __init__(self, qber_threshold: float = QBER_THRESHOLD) -> None:
        self._qber_threshold = qber_threshold
        self._backend = AerSimulator()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _random_bits(n: int) -> List[int]:
        return [random.randint(0, 1) for _ in range(n)]

    @staticmethod
    def _random_bases(n: int) -> List[str]:
        return [random.choice(["Z", "X"]) for _ in range(n)]

    def _encode_qubit(self, bit: int, basis: str) -> QuantumCircuit:
        """Return a single-qubit circuit encoding *bit* in *basis*."""
        qc = QuantumCircuit(1, 1)
        if bit == 1:
            qc.x(0)          # |0⟩ → |1⟩
        if basis == "X":
            qc.h(0)          # |0⟩ → |+⟩  or  |1⟩ → |−⟩
        return qc

    def _measure_qubit(self, qc: QuantumCircuit, basis: str) -> int:
        """Append a basis measurement to *qc* and return the outcome."""
        if basis == "X":
            qc.h(0)          # rotate back from X-basis
        qc.measure(0, 0)
        job = self._backend.run(qc, shots=1)
        counts = job.result().get_counts()
        return int(list(counts.keys())[0])

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def simulate(
        self,
        key_length: int = 64,
        eve: bool = False,
        noise: float = 0.0,
    ) -> Dict[str, Any]:
        """Run a complete BB84 simulation and return all protocol stages.

        Args:
            key_length: Number of raw qubits Alice sends.
            eve: Insert an eavesdropper (intercept-resend attack).
            noise: Additional depolarising noise probability per qubit.

        Returns:
            Dict with keys:
                alice_bits, alice_bases, bob_bases, bob_bits,
                sifted_key, sifted_length, qber,
                eavesdropping_detected, eve_present, scheme.
        """
        alice_bits = self._random_bits(key_length)
        alice_bases = self._random_bases(key_length)
        bob_bases = self._random_bases(key_length)

        bob_bits: List[int] = []

        for i in range(key_length):
            qc = self._encode_qubit(alice_bits[i], alice_bases[i])

            # Eve intercept-resend
            if eve:
                eve_basis = random.choice(["Z", "X"])
                eve_outcome = self._measure_qubit(qc, eve_basis)
                # Eve re-encodes her outcome
                qc = self._encode_qubit(eve_outcome, eve_basis)

            # Optional depolarising noise
            if noise > 0.0 and random.random() < noise:
                qc.x(0)

            outcome = self._measure_qubit(qc, bob_bases[i])
            bob_bits.append(outcome)

        # Sifting
        sifted_indices = [i for i in range(key_length) if alice_bases[i] == bob_bases[i]]
        sifted_alice = [alice_bits[i] for i in sifted_indices]
        sifted_bob = [bob_bits[i] for i in sifted_indices]
        sifted_key = sifted_alice  # Alice's bits are the reference key

        # QBER estimation
        sample_size = max(MIN_SAMPLE, int(len(sifted_indices) * SAMPLE_FRACTION))
        sample_size = min(sample_size, len(sifted_indices))

        if sample_size == 0:
            qber = 0.0
        else:
            sample_idx = random.sample(range(len(sifted_indices)), sample_size)
            errors = sum(1 for i in sample_idx if sifted_alice[i] != sifted_bob[i])
            qber = errors / sample_size

        eavesdropping_detected = qber > self._qber_threshold

        return {
            "alice_bits": alice_bits,
            "alice_bases": alice_bases,
            "bob_bases": bob_bases,
            "bob_bits": bob_bits,
            "sifted_key": sifted_key,
            "sifted_length": len(sifted_key),
            "qber": round(qber, 4),
            "eavesdropping_detected": eavesdropping_detected,
            "eve_present": eve,
            "scheme": "BB84-sim",
        }

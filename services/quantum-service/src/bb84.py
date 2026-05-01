"""
BB84 — Quantum Key Distribution simulation (FR-14).

Protocol summary:
  1. Alice picks N random bits + N random bases (Z=rectilinear, X=diagonal).
  2. Alice prepares each qubit in the chosen basis encoding her bit.
  3. (Optional Eve: intercepts each qubit, measures in a random basis,
     resends — classic intercept-resend attack, ~25% baseline QBER.)
  4. Bob picks N random bases, measures.
  5. Public sift: keep positions where Alice's basis == Bob's basis (~50%).
  6. Sample a small subset of sifted bits to estimate QBER.
     If QBER > qber_threshold (default 0.11), abort the round.
  7. The remaining sifted bits form the raw shared key.

We run `rounds` independent sessions and (when accepted) majority-vote
the per-bit values across rounds for an extra noise margin.
"""
import secrets
from statistics import mean
from qiskit import QuantumCircuit
from qiskit_aer import AerSimulator

_SIM = None


def _sim():
    global _SIM
    if _SIM is None:
        _SIM = AerSimulator()
    return _SIM


def _randbits(n: int):
    return [secrets.randbits(1) for _ in range(n)]


def _bb84_round(n_qubits: int, with_eve: bool, qber_threshold: float):
    a_bits  = _randbits(n_qubits)
    a_bases = _randbits(n_qubits)
    b_bases = _randbits(n_qubits)

    qc = QuantumCircuit(n_qubits, n_qubits)
    for i in range(n_qubits):
        if a_bits[i] == 1:
            qc.x(i)
        if a_bases[i] == 1:
            qc.h(i)

    if with_eve:
        e_bases = _randbits(n_qubits)
        for i in range(n_qubits):
            if e_bases[i] == 1:
                qc.h(i)
        qc.measure(range(n_qubits), range(n_qubits))
        for i in range(n_qubits):
            if e_bases[i] == 1:
                qc.h(i)

    for i in range(n_qubits):
        if b_bases[i] == 1:
            qc.h(i)
    qc.measure(range(n_qubits), range(n_qubits))

    job = _sim().run(qc, shots=1, memory=True)
    bitstr = job.result().get_memory()[0]
    bitstr = bitstr[::-1]
    b_bits = [int(c) for c in bitstr[:n_qubits]]

    sifted_a, sifted_b = [], []
    for i in range(n_qubits):
        if a_bases[i] == b_bases[i]:
            sifted_a.append(a_bits[i])
            sifted_b.append(b_bits[i])

    if not sifted_a:
        return {"accepted": False, "qber": 1.0, "sifted_key": [], "sifted_len": 0}

    sample_n = max(4, min(len(sifted_a) // 4, len(sifted_a)))
    sample_idx = sorted(secrets.SystemRandom().sample(range(len(sifted_a)), sample_n))
    errors = sum(1 for i in sample_idx if sifted_a[i] != sifted_b[i])
    qber = errors / sample_n

    keep = [i for i in range(len(sifted_a)) if i not in set(sample_idx)]
    final_key = [sifted_b[i] for i in keep]

    accepted = qber <= qber_threshold
    return {
        "accepted":   accepted,
        "qber":       qber,
        "sifted_key": final_key,
        "sifted_len": len(sifted_a),
        "keep_len":   len(final_key),
        "sample_n":   sample_n,
    }


def run_bb84(n_qubits: int, rounds: int, with_eve: bool,
             qber_threshold: float, backend: str = "simulator"):
    per_round = [_bb84_round(n_qubits, with_eve, qber_threshold) for _ in range(rounds)]
    accepted_rounds = [r for r in per_round if r["accepted"]]

    if not accepted_rounds:
        return {
            "accepted": False,
            "reason": "all rounds exceeded QBER threshold (likely eavesdropping or noise)",
            "rounds_total": rounds,
            "rounds_accepted": 0,
            "qber_per_round": [r["qber"] for r in per_round],
            "qber_threshold": qber_threshold,
            "with_eve": with_eve,
        }

    L = min(len(r["sifted_key"]) for r in accepted_rounds)
    keys = [r["sifted_key"][:L] for r in accepted_rounds]
    voted = []
    for i in range(L):
        s = sum(k[i] for k in keys)
        voted.append(1 if s * 2 >= len(keys) else 0)

    return {
        "accepted":         True,
        "rounds_total":     rounds,
        "rounds_accepted":  len(accepted_rounds),
        "qber_per_round":   [r["qber"] for r in per_round],
        "qber_mean":        mean(r["qber"] for r in accepted_rounds),
        "qber_threshold":   qber_threshold,
        "key_bits":         "".join(str(b) for b in voted),
        "key_length":       L,
        "with_eve":         with_eve,
        "backend":          backend,
    }

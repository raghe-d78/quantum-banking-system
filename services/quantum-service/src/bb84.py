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

On IBM hardware: each round is one circuit (n_qubits qubits, ~3 layers
of single-qubit gates + measurement). For Open-plan quota friendliness
we cap n_qubits at 32 in the IBM path and bump qber_threshold default
upstream because real backends have 1-5% baseline gate/readout noise.
"""
import logging
import os
import secrets
from statistics import mean
from qiskit import QuantumCircuit, transpile
from qiskit_aer import AerSimulator

log = logging.getLogger("quantum.bb84")

_SIM = None
_IBM_BACKEND = None


def _sim():
    global _SIM
    if _SIM is None:
        _SIM = AerSimulator()
    return _SIM


def _get_ibm_backend(min_qubits: int):
    global _IBM_BACKEND
    if _IBM_BACKEND is not None:
        return _IBM_BACKEND
    from qiskit_ibm_runtime import QiskitRuntimeService

    token = os.environ.get("IBM_QUANTUM_TOKEN")
    crn   = os.environ.get("IBM_QUANTUM_CRN")
    if not token or not crn:
        raise RuntimeError("IBM_QUANTUM_TOKEN and IBM_QUANTUM_CRN must be set for backend=ibm")

    service = QiskitRuntimeService(channel="ibm_cloud", token=token, instance=crn)
    backend = service.least_busy(operational=True, simulator=False, min_num_qubits=min_qubits)
    log.info("[BB84/IBM] selected backend=%s", backend.name)
    _IBM_BACKEND = backend
    return backend


def _randbits(n: int):
    return [secrets.randbits(1) for _ in range(n)]


def _build_circuit(n_qubits: int, a_bits, a_bases, b_bases, with_eve: bool, e_bases=None):
    qc = QuantumCircuit(n_qubits, n_qubits)
    for i in range(n_qubits):
        if a_bits[i] == 1:
            qc.x(i)
        if a_bases[i] == 1:
            qc.h(i)

    if with_eve:
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
    return qc


def _bb84_round(n_qubits: int, with_eve: bool, qber_threshold: float, backend: str = "simulator"):
    a_bits  = _randbits(n_qubits)
    a_bases = _randbits(n_qubits)
    b_bases = _randbits(n_qubits)
    e_bases = _randbits(n_qubits) if with_eve else None

    qc = _build_circuit(n_qubits, a_bits, a_bases, b_bases, with_eve, e_bases)

    if backend == "ibm":
        from qiskit_ibm_runtime import SamplerV2
        ibm = _get_ibm_backend(min_qubits=n_qubits)
        isa_qc = transpile(qc, backend=ibm, optimization_level=1)
        sampler = SamplerV2(mode=ibm)
        job = sampler.run([isa_qc], shots=1)
        log.info("[BB84/IBM] job_id=%s backend=%s n_qubits=%d", job.job_id(), ibm.name, n_qubits)
        result = job.result()
        data = result[0].data
        try:
            bitstr = data.c.get_bitstrings()[0]
        except Exception:
            bitstr = data.meas.get_bitstrings()[0]
    else:
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
    # IBM hardware: cap qubits to keep queue/quota reasonable.
    if backend == "ibm" and n_qubits > 32:
        log.info("[BB84/IBM] capping n_qubits %d → 32 for hardware run", n_qubits)
        n_qubits = 32

    per_round = [_bb84_round(n_qubits, with_eve, qber_threshold, backend) for _ in range(rounds)]
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
            "backend": backend,
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


"""
QRNG — Quantum Random Number Generation (FR-13).

Strategy:
  - Build a small circuit of `chunk_qubits` Hadamard gates and measure all.
    Each shot yields chunk_qubits independent fair coin flips.
  - Run enough shots in batch to refill an internal byte buffer of
    `buffer_bytes` capacity (default 4 KiB).
  - Callers `bytes(n)` against the buffer; refill happens lazily.
  - On simulator failure (very rare with Aer), fall back to `secrets.token_bytes`
    and tag the response as `source="fallback"` so callers can audit.

Backends:
  - "simulator" — qiskit_aer.AerSimulator, fast & noiseless
  - "ibm"       — qiskit_ibm_runtime SamplerV2 on real hardware
                  (chunk size auto-bumped to 64 to amortize queue latency,
                   refill scaled down because each shot is expensive)
"""
import logging
import os
import secrets
import threading

log = logging.getLogger("quantum.qrng")

_CHUNK_QUBITS_SIM = 16
_REFILL_SHOTS_SIM = 4096

_CHUNK_QUBITS_IBM = 64       # most IBM backends are 127q; 64 is safely transpilable
_REFILL_SHOTS_IBM = 256      # IBM shots are queued — keep refill small


class QRNG:
    def __init__(self, backend: str = "simulator", buffer_bytes: int = 4096):
        self.backend_name = backend
        self.buffer_bytes = buffer_bytes
        self._buf = bytearray()
        self._lock = threading.Lock()
        self._sim = None
        self._ibm_backend = None
        self._ibm_sampler = None

    def bytes(self, n: int):
        """Return (bytes, source) where source is 'quantum' | 'quantum-ibm' | 'fallback'."""
        with self._lock:
            if len(self._buf) < n:
                source = self._refill(max(n, self.buffer_bytes))
            else:
                source = "quantum-ibm" if self.backend_name == "ibm" else "quantum"
            out = bytes(self._buf[:n])
            del self._buf[:n]
            return out, source

    def remaining(self) -> int:
        return len(self._buf)

    def _refill(self, target_bytes: int) -> str:
        if self.backend_name == "ibm":
            try:
                return self._refill_ibm(target_bytes)
            except Exception as e:
                log.warning("QRNG IBM refill failed, falling back to Aer: %s", e)
        try:
            return self._refill_sim(target_bytes)
        except Exception as e:
            log.warning("QRNG simulator failed, falling back to secrets: %s", e)
            self._buf.extend(secrets.token_bytes(target_bytes))
            return "fallback"

    def _refill_sim(self, target_bytes: int) -> str:
        from qiskit import QuantumCircuit
        from qiskit_aer import AerSimulator

        if self._sim is None:
            self._sim = AerSimulator()

        qc = QuantumCircuit(_CHUNK_QUBITS_SIM, _CHUNK_QUBITS_SIM)
        qc.h(range(_CHUNK_QUBITS_SIM))
        qc.measure(range(_CHUNK_QUBITS_SIM), range(_CHUNK_QUBITS_SIM))

        shots = max(_REFILL_SHOTS_SIM, (target_bytes * 8) // _CHUNK_QUBITS_SIM + 1)
        job = self._sim.run(qc, shots=shots, memory=True)
        mem = job.result().get_memory()
        bit_stream = "".join(mem)
        usable = len(bit_stream) - (len(bit_stream) % 8)
        for i in range(0, usable, 8):
            self._buf.append(int(bit_stream[i:i + 8], 2))
        return "quantum"

    def _refill_ibm(self, target_bytes: int) -> str:
        from qiskit import QuantumCircuit, transpile
        from qiskit_ibm_runtime import SamplerV2

        backend = self._get_ibm_backend()
        qc = QuantumCircuit(_CHUNK_QUBITS_IBM, _CHUNK_QUBITS_IBM)
        qc.h(range(_CHUNK_QUBITS_IBM))
        qc.measure(range(_CHUNK_QUBITS_IBM), range(_CHUNK_QUBITS_IBM))

        # ISA-compliant transpile required by SamplerV2.
        isa_qc = transpile(qc, backend=backend, optimization_level=1)

        shots = max(_REFILL_SHOTS_IBM, (target_bytes * 8) // _CHUNK_QUBITS_IBM + 1)
        sampler = SamplerV2(mode=backend)
        job = sampler.run([isa_qc], shots=shots)
        log.info("[QRNG/IBM] job_id=%s backend=%s shots=%d", job.job_id(), backend.name, shots)
        result = job.result()
        # SamplerV2 result API: result[0].data.<creg>.get_bitstrings()
        data = result[0].data
        creg = next(iter(data.__dict__)) if hasattr(data, "__dict__") and data.__dict__ else "c"
        try:
            bitstrings = getattr(data, creg).get_bitstrings()
        except Exception:
            bitstrings = data.meas.get_bitstrings()

        bit_stream = "".join(bitstrings)
        usable = len(bit_stream) - (len(bit_stream) % 8)
        for i in range(0, usable, 8):
            self._buf.append(int(bit_stream[i:i + 8], 2))
        return "quantum-ibm"

    def _get_ibm_backend(self):
        if self._ibm_backend is not None:
            return self._ibm_backend

        from qiskit_ibm_runtime import QiskitRuntimeService

        token = os.environ.get("IBM_QUANTUM_TOKEN")
        crn   = os.environ.get("IBM_QUANTUM_CRN")
        if not token or not crn:
            raise RuntimeError("IBM_QUANTUM_TOKEN and IBM_QUANTUM_CRN must be set for backend=ibm")

        service = QiskitRuntimeService(channel="ibm_cloud", token=token, instance=crn)
        # Prefer least busy non-simulator backend with >= 64 qubits
        backend = service.least_busy(operational=True, simulator=False, min_num_qubits=_CHUNK_QUBITS_IBM)
        log.info("[QRNG/IBM] selected backend=%s", backend.name)
        self._ibm_backend = backend
        return backend


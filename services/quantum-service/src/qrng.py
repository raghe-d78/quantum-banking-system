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
"""
import logging
import secrets
import threading

log = logging.getLogger("quantum.qrng")

_CHUNK_QUBITS = 16
_REFILL_SHOTS = 4096


class QRNG:
    def __init__(self, backend: str = "simulator", buffer_bytes: int = 4096):
        self.backend_name = backend
        self.buffer_bytes = buffer_bytes
        self._buf = bytearray()
        self._lock = threading.Lock()
        self._sim = None

    def bytes(self, n: int):
        """Return (bytes, source) where source is 'quantum' or 'fallback'."""
        with self._lock:
            if len(self._buf) < n:
                source = self._refill(max(n, self.buffer_bytes))
            else:
                source = "quantum"
            out = bytes(self._buf[:n])
            del self._buf[:n]
            return out, source

    def remaining(self) -> int:
        return len(self._buf)

    def _refill(self, target_bytes: int) -> str:
        try:
            from qiskit import QuantumCircuit
            from qiskit_aer import AerSimulator

            if self._sim is None:
                self._sim = AerSimulator()

            qc = QuantumCircuit(_CHUNK_QUBITS, _CHUNK_QUBITS)
            qc.h(range(_CHUNK_QUBITS))
            qc.measure(range(_CHUNK_QUBITS), range(_CHUNK_QUBITS))

            shots = max(_REFILL_SHOTS, (target_bytes * 8) // _CHUNK_QUBITS + 1)
            job = self._sim.run(qc, shots=shots, memory=True)
            mem = job.result().get_memory()
            bit_stream = "".join(mem)
            usable = len(bit_stream) - (len(bit_stream) % 8)
            for i in range(0, usable, 8):
                self._buf.append(int(bit_stream[i:i + 8], 2))
            return "quantum"
        except Exception as e:
            log.warning("QRNG simulator failed, falling back to secrets: %s", e)
            self._buf.extend(secrets.token_bytes(target_bytes))
            return "fallback"

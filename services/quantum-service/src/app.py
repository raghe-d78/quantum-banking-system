"""
quantum-service — Phase 3 of the Quantum Banking System.

Endpoints:
  GET  /health                 liveness
  GET  /qrng?bytes=N           N quantum-random bytes (FR-13)
  POST /qkd/bb84               run BB84 simulation (FR-14)
  GET  /qkd/visualize?...      circuit PNG (FR-15)
  GET  /backend                report active backend (simulator|ibm)

Backend is selected by env QUANTUM_BACKEND:
  - "simulator" (default) — qiskit_aer.AerSimulator, fast & deterministic
  - "ibm"                 — qiskit_ibm_runtime, requires IBM_QUANTUM_TOKEN
                            and IBM_QUANTUM_CRN env vars (never committed)
"""
import os
import io
import base64
import logging
from flask import Flask, request, jsonify, send_file

from .qrng import QRNG
from .bb84 import run_bb84
from . import viz

app = Flask(__name__)
log = logging.getLogger("quantum")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

BACKEND = os.environ.get("QUANTUM_BACKEND", "simulator").lower()
QRNG_BUFFER_BYTES = int(os.environ.get("QRNG_BUFFER_BYTES", "4096"))

qrng = QRNG(backend=BACKEND, buffer_bytes=QRNG_BUFFER_BYTES)


@app.get("/health")
def health():
    return jsonify(status="quantum-service running", backend=BACKEND, buffer_bytes=QRNG_BUFFER_BYTES)


@app.get("/backend")
def backend():
    return jsonify(backend=BACKEND, ibm_configured=bool(os.environ.get("IBM_QUANTUM_TOKEN")))


@app.get("/qrng")
def qrng_endpoint():
    """FR-13 — Quantum Random Number Generation (Hadamard-based, 4KB pre-buffer)."""
    try:
        n = int(request.args.get("bytes", "16"))
    except ValueError:
        return jsonify(error="bytes must be an integer"), 400
    if n <= 0 or n > 65536:
        return jsonify(error="bytes must be between 1 and 65536"), 400

    data, source = qrng.bytes(n)
    return jsonify(
        bytes=n,
        hex=data.hex(),
        b64=base64.b64encode(data).decode(),
        source=source,
        buffer_remaining=qrng.remaining(),
    )


@app.post("/qkd/bb84")
def bb84_endpoint():
    """FR-14 — BB84 simulation with optional Eve, QBER>11% rejection, majority vote.

    Optional body field `backend` overrides the global QUANTUM_BACKEND env
    for this request only ("simulator" or "ibm"). This lets KMS keep minting
    against the fast simulator while ad-hoc /qkd/bb84 calls hit real hardware.
    """
    body = request.get_json(silent=True) or {}
    try:
        n_qubits = int(body.get("n_qubits", 256))
        rounds = int(body.get("rounds", 3))
        with_eve = bool(body.get("with_eve", False))
        qber_threshold = float(body.get("qber_threshold", 0.11))
        req_backend = str(body.get("backend", BACKEND)).lower()
    except (TypeError, ValueError) as e:
        return jsonify(error=f"bad params: {e}"), 400

    if req_backend not in ("simulator", "ibm"):
        return jsonify(error="backend must be 'simulator' or 'ibm'"), 400
    if n_qubits < 8 or n_qubits > 1024:
        return jsonify(error="n_qubits must be in [8, 1024]"), 400
    if rounds < 1 or rounds > 9:
        return jsonify(error="rounds must be in [1, 9]"), 400

    result = run_bb84(
        n_qubits=n_qubits,
        rounds=rounds,
        with_eve=with_eve,
        qber_threshold=qber_threshold,
        backend=req_backend,
    )
    return jsonify(result), (200 if result.get("accepted") else 422)


@app.get("/qkd/visualize")
def visualize_endpoint():
    """FR-15 — Circuit PNG, n_qubits hard-capped to 16 server-side."""
    try:
        n = int(request.args.get("n_qubits", "4"))
    except ValueError:
        return jsonify(error="n_qubits must be int"), 400
    n = max(1, min(n, 16))
    with_eve = request.args.get("with_eve", "false").lower() == "true"

    png_bytes = viz.bb84_circuit_png(n, with_eve=with_eve)
    return send_file(io.BytesIO(png_bytes), mimetype="image/png", download_name="bb84.png")


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 3005)), debug=False)

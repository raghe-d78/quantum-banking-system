# quantum-service

FastAPI + Qiskit microservice providing quantum computing primitives for the Quantum Banking System.

## Overview

`quantum-service` exposes four groups of endpoints under the `/v1` prefix:

| Group | Prefix | Description |
|-------|--------|-------------|
| QRNG | `/v1/qrng` | Quantum random number generation (FR-13) |
| BB84 | `/v1/bb84` | BB84 QKD protocol simulation (FR-14) |
| Circuits | `/v1/circuits` | Circuit visualisation (FR-15) |
| Fraud | `/v1/fraud` | VQC-based fraud detection (FR-09, FR-10, FR-16) |

All quantum circuits are executed on [Qiskit Aer](https://github.com/Qiskit/qiskit-aer) (local simulator). Swap the backend for real quantum hardware in production.

---

## Endpoints

### Health

```bash
# Service liveness
curl http://localhost:8000/v1/health
# {"status":"quantum-service running","qiskit":"1.2.4"}
```

---

### QRNG — Quantum Random Number Generation

#### `GET /v1/qrng` — Generate random bits

```bash
curl "http://localhost:8000/v1/qrng?n_bits=64"
# {
#   "bits": "0110101001...",
#   "n_bits": 64,
#   "bytes_hex": "6a...",
#   "method": "hadamard-aer"
# }
```

| Query param | Type | Default | Max | Description |
|-------------|------|---------|-----|-------------|
| `n_bits` | int | 256 | 4096 | Number of random bits |

#### `POST /v1/qrng/bytes` — Generate random bytes

```bash
curl -X POST http://localhost:8000/v1/qrng/bytes \
  -H "Content-Type: application/json" \
  -d '{"n_bytes": 32}'
# {"hex": "a3f9...","n_bytes": 32}
```

| Body field | Type | Default | Max | Description |
|------------|------|---------|-----|-------------|
| `n_bytes` | int | 32 | 512 | Number of random bytes |

---

### BB84 — Quantum Key Distribution

#### `POST /v1/bb84/simulate` — Run a BB84 session

```bash
# Without eavesdropper
curl -X POST http://localhost:8000/v1/bb84/simulate \
  -H "Content-Type: application/json" \
  -d '{"key_length": 64, "eve": false, "noise": 0.0}'

# With eavesdropper (Eve) — expect QBER ≈ 25%
curl -X POST http://localhost:8000/v1/bb84/simulate \
  -H "Content-Type: application/json" \
  -d '{"key_length": 128, "eve": true, "noise": 0.0}'
# {
#   "alice_bits": [...],
#   "alice_bases": [...],
#   "bob_bases": [...],
#   "bob_bits": [...],
#   "sifted_key": [...],
#   "sifted_length": 61,
#   "qber": 0.2353,
#   "eavesdropping_detected": true,
#   "eve_present": true,
#   "scheme": "BB84-sim"
# }
```

| Body field | Type | Default | Range | Description |
|------------|------|---------|-------|-------------|
| `key_length` | int | 64 | 4–1024 | Raw qubits Alice sends |
| `eve` | bool | false | — | Insert eavesdropper |
| `noise` | float | 0.0 | 0–1 | Depolarising noise probability |

---

### Circuits — Quantum Circuit Visualisation

#### `GET /v1/circuits/visualize` — Get PNG of a preset circuit

```bash
# Bell state circuit
curl "http://localhost:8000/v1/circuits/visualize?circuit=bell&format=png" \
  | python3 -c "import sys,json,base64; d=json.load(sys.stdin); open('bell.png','wb').write(base64.b64decode(d['image_base64']))"

# Available presets: bell | ghz | bb84
curl "http://localhost:8000/v1/circuits/visualize?circuit=ghz"
curl "http://localhost:8000/v1/circuits/visualize?circuit=bb84"
```

| Query param | Type | Default | Description |
|-------------|------|---------|-------------|
| `circuit` | str | `bell` | Preset name: `bell`, `ghz`, `bb84` |
| `format` | str | `png` | Output format (only `png` supported) |

---

### Fraud — VQC Fraud Detection

#### `POST /v1/fraud/predict` — Classify a transaction

```bash
curl -X POST http://localhost:8000/v1/fraud/predict \
  -H "Content-Type: application/json" \
  -d '{"features": [0.5, 1.2]}'
# {"label": 0, "confidence": 0.87, "model": "vqc-poc-v0"}
```

| Body field | Type | Description |
|------------|------|-------------|
| `features` | float[] | Feature vector (≥ 1 element) |

**Response:**

| Field | Type | Description |
|-------|------|-------------|
| `label` | int | `0` = legitimate, `1` = fraud |
| `confidence` | float | Confidence in [0, 1] |
| `model` | str | Model identifier |

#### `POST /v1/fraud/train` — Train the VQC model *(dev only)*

```bash
curl -X POST http://localhost:8000/v1/fraud/train \
  -H "Content-Type: application/json" \
  -d '{
    "X": [[0.1, 0.2], [1.4, 1.6], [0.0, 0.1], [1.5, 1.5]],
    "y": [0, 1, 0, 1]
  }'
# {"accuracy": 1.0, "message": "VQC model trained successfully."}
```

> **Note:** Returns `403 Forbidden` when `ENV != dev`.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ENV` | `dev` | Runtime environment (`dev` / `prod`) |
| `PORT` | `8000` | Listening port |
| `HOST` | `0.0.0.0` | Bind address |
| `QKD_KMS_URL` | `http://qkd-kms:8001` | URL of the QKD Key Management Service |
| `LOG_LEVEL` | `info` | Uvicorn / Python log level |
| `QRNG_DEFAULT_BITS` | `256` | Default bits for QRNG requests |
| `QRNG_MAX_BITS` | `4096` | Maximum bits per QRNG request |
| `BB84_DEFAULT_KEY_LENGTH` | `64` | Default BB84 key length |
| `BB84_QBER_THRESHOLD` | `0.11` | QBER threshold for eavesdropping detection |
| `VQC_MODEL_PATH` | `app/models/vqc.pkl` | Path to persisted VQC model |

---

## Running Locally

### Prerequisites

- Python 3.11+
- pip

### Install & run

```bash
cd services/quantum-service

# Create virtual environment
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Start the service
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

The interactive API docs are available at <http://localhost:8000/docs>.

### Run tests

```bash
cd services/quantum-service
pytest tests/ -v
```

---

## Running with Docker

```bash
cd services/quantum-service

# Build
docker build -t quantum-service:latest .

# Run
docker run --rm -p 8000:8000 \
  -e ENV=dev \
  -e LOG_LEVEL=info \
  quantum-service:latest
```

### Docker Compose (from repo root)

```bash
docker compose up quantum-service
```

The health check polls `GET /v1/health` every 30 s; the container is marked healthy after 3 consecutive successes.

---

## Architecture Notes

```
POST /v1/fraud/predict
        │
        ▼
  VQCClassifier._ensure_model()
        │
        ├── model exists on disk → load pickle
        └── no model → train on synthetic data → persist
```

- **QRNG**: Each request runs one or more 8-qubit H-measure circuits on `AerSimulator`.
- **BB84**: Each qubit is encoded/measured individually via single-qubit circuits; Eve intercepts with random basis choice.
- **VQC**: Uses `ZZFeatureMap` + `RealAmplitudes` ansatz with COBYLA optimiser. Falls back to `LogisticRegression` if `qiskit-machine-learning` is unavailable.
- **Visualizer**: Renders circuits via Matplotlib (`mpl` output); falls back to Pillow text-render if Matplotlib fails.

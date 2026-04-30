"""QKD Key Management System — BB84 simulation sidecar.

⚠️  SIMULATION NOTICE
---------------------
This service simulates the BB84 quantum key distribution protocol using
Qiskit's Aer simulator.  It does **not** represent a real quantum channel.
In a real deployment:
- Alice and Bob would be connected by a fibre-optic quantum channel.
- Single-photon sources and detectors would replace the simulator.
- Privacy amplification and error correction would distil the raw key.

For the purposes of this PoC, the service provides:
- Deterministic key generation seeded by BB84 simulation outputs.
- An in-memory session store mapping key_id → symmetric key.
- A simple REST API for integration with the api-gateway.
"""
from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from app.kms import KMSStore

logger = logging.getLogger(__name__)

_store = KMSStore()


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    logger.info("qkd-kms starting up")
    yield
    logger.info("qkd-kms shutting down")


app = FastAPI(
    title="QKD Key Management System",
    description="BB84-simulated QKD key management service for the Quantum Banking System.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas (inline for simplicity of a small sidecar service)
# ---------------------------------------------------------------------------

from pydantic import BaseModel, Field


class NewSessionRequest(BaseModel):
    peer: str = Field(..., description="Identifier of the requesting peer (e.g. 'api-gateway').")


class NewSessionResponse(BaseModel):
    key_id: str
    key_b64: str
    qber: float
    scheme: str = "BB84-sim"


class SessionResponse(BaseModel):
    key_id: str
    key_b64: str
    qber: float
    scheme: str
    peer: str
    # Note: In real QKD, key is consumed once. This PoC returns it on every GET.
    caveat: str = (
        "⚠ PoC only: key is re-readable. Real QKD keys must be consumed once."
    )


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.post("/kms/session/new", response_model=NewSessionResponse, tags=["kms"])
async def new_session(body: NewSessionRequest) -> NewSessionResponse:
    """Create a new QKD-derived symmetric key session.

    Runs a BB84 simulation internally to derive a 256-bit AES key.
    Returns the key in base64 encoding along with the simulation QBER.

    In production, the QBER would be measured over the actual quantum channel;
    a QBER > 11% would cause this endpoint to reject the key negotiation.
    """
    session = _store.create_session(peer=body.peer)
    return NewSessionResponse(
        key_id=session["key_id"],
        key_b64=session["key_b64"],
        qber=session["qber"],
    )


@app.get("/kms/session/{key_id}", response_model=SessionResponse, tags=["kms"])
async def get_session(key_id: str) -> SessionResponse:
    """Retrieve an existing QKD session by key ID.

    ⚠️  PoC caveat: the key is re-readable for demo purposes.
    In a real QKD deployment, keys must be consumed exactly once
    (one-time-pad semantics).
    """
    session = _store.get_session(key_id)
    if session is None:
        raise HTTPException(status_code=404, detail=f"Session '{key_id}' not found.")
    return SessionResponse(**session)


@app.get("/health", tags=["health"])
async def health() -> dict:
    """Service liveness probe."""
    return {"status": "qkd-kms running", "sessions": _store.count()}

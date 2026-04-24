"""Quantum-service FastAPI application entry point.

Registers all routers under the /v1 prefix.
"""
import logging
from contextlib import asynccontextmanager

import qiskit
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import bb84, circuits, fraud, qrng

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):  # noqa: ARG001
    logger.info("quantum-service starting up (Qiskit %s)", qiskit.__version__)
    yield
    logger.info("quantum-service shutting down")


app = FastAPI(
    title="Quantum Banking Service",
    description="FastAPI + Qiskit quantum computing service for the Quantum Banking System.",
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

# Mount all routers under /v1
app.include_router(qrng.router, prefix="/v1")
app.include_router(bb84.router, prefix="/v1")
app.include_router(circuits.router, prefix="/v1")
app.include_router(fraud.router, prefix="/v1")


@app.get("/v1/health", tags=["health"])
async def health() -> dict:
    """Service liveness probe."""
    return {"status": "quantum-service running", "qiskit": qiskit.__version__}


# Convenience redirect: root health check
@app.get("/health", include_in_schema=False)
async def health_root() -> dict:
    return await health()

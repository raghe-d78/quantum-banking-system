"""QRNG router — FR-13: Quantum Random Number Generation endpoints."""
import logging

from fastapi import APIRouter, Query

from app.config import settings
from app.quantum.qrng_engine import QRNGEngine
from app.schemas.qrng import QRNGBytesRequest, QRNGBytesResponse, QRNGResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/qrng", tags=["qrng"])

_engine = QRNGEngine()


@router.get("", response_model=QRNGResponse)
async def get_random_bits(
    n_bits: int = Query(
        default=256,
        ge=1,
        le=settings.qrng_max_bits,
        description="Number of random bits to generate (1 – 4096).",
    ),
) -> QRNGResponse:
    """Generate *n_bits* random bits using the Hadamard-based QRNG engine.

    Each qubit is prepared in |0⟩, a Hadamard gate applied, then measured.
    The measurement outcome is uniformly random: P(0)=P(1)=1/2.
    """
    result = _engine.generate_bits(n_bits)
    return QRNGResponse(**result)


@router.post("/bytes", response_model=QRNGBytesResponse)
async def get_random_bytes(body: QRNGBytesRequest) -> QRNGBytesResponse:
    """Generate *n_bytes* of quantum-random bytes, returned as a hex string."""
    result = _engine.generate_bytes(body.n_bytes)
    return QRNGBytesResponse(**result)

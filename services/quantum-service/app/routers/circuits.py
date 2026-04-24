"""Circuits router — FR-15: Quantum circuit visualisation."""
import logging

from fastapi import APIRouter, HTTPException, Query

from app.quantum.visualizer import CircuitVisualizer
from app.schemas.circuits import CircuitVisResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/circuits", tags=["circuits"])

_viz = CircuitVisualizer()


@router.get("/visualize", response_model=CircuitVisResponse)
async def visualize_circuit(
    circuit: str = Query(
        default="bell",
        description="Preset circuit name: bell | ghz | bb84",
    ),
    format: str = Query(  # noqa: A002
        default="png",
        description="Output format: png (only png supported currently).",
    ),
) -> CircuitVisResponse:
    """Return a base64-encoded PNG image of the requested preset circuit."""
    try:
        image_b64 = _viz.render(circuit_name=circuit, fmt=format)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return CircuitVisResponse(format=format, image_base64=image_b64)

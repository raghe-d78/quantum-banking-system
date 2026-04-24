"""BB84 router — FR-14: BB84 quantum key distribution simulation."""
import logging

from fastapi import APIRouter

from app.quantum.bb84_protocol import BB84Protocol
from app.schemas.bb84 import BB84Request, BB84Response

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/bb84", tags=["bb84"])

_protocol = BB84Protocol()


@router.post("/simulate", response_model=BB84Response)
async def simulate_bb84(body: BB84Request) -> BB84Response:
    """Simulate a full BB84 QKD session.

    - Alice generates random bits and bases.
    - Eve (optional) intercepts and resends.
    - Bob measures in random bases.
    - Sifting keeps positions where bases match.
    - QBER is estimated; eavesdropping flagged if QBER > 11 %.
    """
    result = _protocol.simulate(
        key_length=body.key_length,
        eve=body.eve,
        noise=body.noise,
    )
    return BB84Response(**result)

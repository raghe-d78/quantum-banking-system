"""Pydantic schemas for BB84 endpoints."""
from typing import List, Optional

from pydantic import BaseModel, Field


class BB84Request(BaseModel):
    """Request body for POST /v1/bb84/simulate."""

    key_length: int = Field(default=64, ge=4, le=1024, description="Number of raw bits for Alice to send.")
    eve: bool = Field(default=False, description="Whether to insert an eavesdropper (Eve).")
    noise: float = Field(default=0.0, ge=0.0, le=1.0, description="Channel noise probability (depolarising).")


class BB84Response(BaseModel):
    """Response schema for POST /v1/bb84/simulate."""

    alice_bits: List[int] = Field(..., description="Alice's raw bit string.")
    alice_bases: List[str] = Field(..., description="Alice's basis choices ('Z' or 'X').")
    bob_bases: List[str] = Field(..., description="Bob's basis choices ('Z' or 'X').")
    bob_bits: List[int] = Field(..., description="Bob's measurement outcomes.")
    sifted_key: List[int] = Field(..., description="Key bits after sifting (matching bases).")
    sifted_length: int = Field(..., description="Length of the sifted key.")
    qber: float = Field(..., description="Quantum Bit Error Rate estimate.")
    eavesdropping_detected: bool = Field(..., description="True if QBER exceeds the 11% BB84 threshold.")
    eve_present: bool = Field(..., description="Whether Eve was simulated.")
    scheme: str = Field(default="BB84-sim", description="Protocol identifier.")

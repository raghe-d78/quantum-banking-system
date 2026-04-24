"""Pydantic schemas for QRNG endpoints."""
from pydantic import BaseModel, Field


class QRNGResponse(BaseModel):
    """Response schema for GET /v1/qrng."""

    bits: str = Field(..., description="String of 0s and 1s.")
    n_bits: int = Field(..., description="Number of bits generated.")
    bytes_hex: str = Field(..., description="Hex-encoded bytes (bits zero-padded to full bytes).")
    method: str = Field(default="hadamard-aer", description="Generation method.")


class QRNGBytesRequest(BaseModel):
    """Request body for POST /v1/qrng/bytes."""

    n_bytes: int = Field(default=32, ge=1, le=512, description="Number of random bytes (1–512).")


class QRNGBytesResponse(BaseModel):
    """Response schema for POST /v1/qrng/bytes."""

    hex: str = Field(..., description="Hex-encoded random bytes.")
    n_bytes: int = Field(..., description="Number of bytes generated.")

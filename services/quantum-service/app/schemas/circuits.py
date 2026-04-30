"""Pydantic schemas for circuit visualisation endpoints."""
from pydantic import BaseModel, Field


class CircuitVisResponse(BaseModel):
    """Response schema for GET /v1/circuits/visualize."""

    format: str = Field(..., description="Image format (e.g. 'png').")
    image_base64: str = Field(..., description="Base64-encoded image data.")

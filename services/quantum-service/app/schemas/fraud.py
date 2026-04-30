"""Pydantic schemas for fraud detection endpoints."""
from typing import List

from pydantic import BaseModel, Field


class FraudPredictRequest(BaseModel):
    """Request body for POST /v1/fraud/predict."""

    features: List[float] = Field(..., min_length=1, description="Feature vector for the transaction.")


class FraudPredictResponse(BaseModel):
    """Response schema for POST /v1/fraud/predict."""

    label: int = Field(..., description="Predicted class: 0 = legitimate, 1 = fraud.")
    confidence: float = Field(..., description="Confidence score in [0, 1].")
    model: str = Field(..., description="Model identifier.")


class FraudTrainRequest(BaseModel):
    """Request body for POST /v1/fraud/train (dev only)."""

    X: List[List[float]] = Field(..., description="Feature matrix (list of feature vectors).")
    y: List[int] = Field(..., description="Labels list (0 or 1).")


class FraudTrainResponse(BaseModel):
    """Response schema for POST /v1/fraud/train."""

    accuracy: float = Field(..., description="Training accuracy.")
    message: str = Field(..., description="Status message.")

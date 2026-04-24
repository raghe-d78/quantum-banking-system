"""Fraud router — FR-09, FR-10, FR-16: VQC-based fraud detection."""
import logging

from fastapi import APIRouter, HTTPException

from app.config import settings
from app.quantum.vqc_classifier import VQCClassifier
from app.schemas.fraud import FraudPredictRequest, FraudPredictResponse, FraudTrainRequest, FraudTrainResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/fraud", tags=["fraud"])

_classifier = VQCClassifier()


@router.post("/predict", response_model=FraudPredictResponse)
async def predict_fraud(body: FraudPredictRequest) -> FraudPredictResponse:
    """Predict whether a transaction is fraudulent using the VQC model.

    Returns label (0 = legitimate, 1 = fraud) and a confidence score.
    """
    label, confidence = _classifier.predict(body.features)
    return FraudPredictResponse(label=label, confidence=confidence, model="vqc-poc-v0")


@router.post("/train", response_model=FraudTrainResponse)
async def train_fraud(body: FraudTrainRequest) -> FraudTrainResponse:
    """[DEV ONLY] Train the VQC model on a small labelled dataset.

    This endpoint is gated to ENV=dev only.
    """
    if settings.env != "dev":
        raise HTTPException(status_code=403, detail="Training endpoint is only available in dev environment.")

    accuracy = _classifier.train(body.X, body.y)
    return FraudTrainResponse(accuracy=accuracy, message="VQC model trained successfully.")

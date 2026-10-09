"""
CV feature vector (spec §8, extended) and document risk policy (spec §11).

CV_FEATURE_NAMES — 9 features consumed by fraud-service (feature schema v2):
  ocr_confidence       mean word confidence (0 when OCR unavailable)
  amount_confidence    confidence of the extracted amount
  document_quality     geometric mean of sharpness/exposure/contrast/resolution
  tampering_score      ELA + noise + blockiness + copy-move (higher = worse)
  signature_similarity 0.5 neutral, else similarity to enrolled reference
  layout_consistency   text-line alignment (higher = better)
  amount_match         OCR amount vs declared amount: 1 / 0.5 unknown / 0
  date_validity        1 valid / 0.5 unknown / 0 post-dated or stale
  duplicate_score      1 if a near-identical document was seen before, else 0

Document risk (0..1) is a transparent weighted sum of *suspicion* terms:
  risk = 0.35·tampering + 0.20·(1−amount_match) + 0.15·duplicate
       + 0.10·(1−date_validity) + 0.10·(1−layout) + 0.05·(1−quality)
       + 0.05·(1−signature_similarity)
  Unverifiable terms (0.5) contribute half weight, so a document that could not
  be OCR'd lands in REVIEW, never in CLEAN or SUSPICIOUS on its own.
Status: risk < 0.30 CLEAN · < 0.70 REVIEW · else SUSPICIOUS (spec §11).
requires_review is also forced by a duplicate or an amount mismatch.
"""
from __future__ import annotations

from .config import REVIEW_THRESHOLD, SUSPICIOUS_THRESHOLD

CV_FEATURE_SCHEMA_VERSION = "cv-features-v1"
CV_FEATURE_NAMES = [
    "ocr_confidence", "amount_confidence", "document_quality", "tampering_score",
    "signature_similarity", "layout_consistency", "amount_match", "date_validity", "duplicate_score",
]
# Values used by fraud-service when a transaction has no document attached.
CV_NEUTRAL = {"ocr_confidence": 0.0, "amount_confidence": 0.0, "document_quality": 0.0, "tampering_score": 0.0,
              "signature_similarity": 0.5, "layout_consistency": 0.5, "amount_match": 0.5, "date_validity": 0.5, "duplicate_score": 0.0}

HARD_REASONS = ("duplicate_document", "amount_mismatch", "invalid_date")

WEIGHTS = {"tampering": 0.35, "amount": 0.20, "duplicate": 0.15, "date": 0.10, "layout": 0.10, "quality": 0.05, "signature": 0.05}


def clamp(v: float) -> float:
    return max(0.0, min(1.0, float(v)))


def risk_score(f: dict) -> float:
    r = (WEIGHTS["tampering"] * clamp(f["tampering_score"])
         + WEIGHTS["amount"] * (1 - clamp(f["amount_match"]))
         + WEIGHTS["duplicate"] * clamp(f["duplicate_score"])
         + WEIGHTS["date"] * (1 - clamp(f["date_validity"]))
         + WEIGHTS["layout"] * (1 - clamp(f["layout_consistency"]))
         + WEIGHTS["quality"] * (1 - clamp(f["document_quality"]))
         + WEIGHTS["signature"] * (1 - clamp(f["signature_similarity"])))
    return round(clamp(r), 4)


def status_for(risk: float) -> str:
    if risk < REVIEW_THRESHOLD:
        return "CLEAN"
    if risk < SUSPICIOUS_THRESHOLD:
        return "REVIEW"
    return "SUSPICIOUS"


def decide(f: dict) -> dict:
    risk = risk_score(f)
    status = status_for(risk)
    # A document that could not be read (OCR unavailable / no text) is never auto-approved.
    if f["ocr_confidence"] == 0.0 and status == "CLEAN":
        status = "REVIEW"
    reasons = []
    if f["tampering_score"] >= 0.5: reasons.append("tampering_signals")
    if f["amount_match"] == 0.0:   reasons.append("amount_mismatch")
    if f["duplicate_score"] >= 1.0: reasons.append("duplicate_document")
    if f["date_validity"] == 0.0:  reasons.append("invalid_date")
    if f["layout_consistency"] < 0.4: reasons.append("layout_anomaly")
    if f["document_quality"] < 0.25: reasons.append("low_quality")
    if f["ocr_confidence"] == 0.0:  reasons.append("ocr_unavailable")
    # Hard findings lift the verdict to at least REVIEW whatever the weighted score says: a duplicate,
    # an amount that disagrees with the declaration, or a date outside the validity window.
    if status == "CLEAN" and any(r in reasons for r in HARD_REASONS):
        status = "REVIEW"
    requires_review = status != "CLEAN"
    return {"risk_score": risk, "status": status, "requires_review": requires_review, "reasons": reasons}

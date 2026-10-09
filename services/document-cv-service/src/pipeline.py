"""
End-to-end document analysis (spec §3 UC-01): bytes in → analysis dict out.
Stages: validate → preprocess → quality → OCR → integrity → layout →
signature → cross-checks (amount, date, duplicate) → feature vector → risk.
"""
from __future__ import annotations
import hashlib
import io
import uuid
from datetime import date

import cv2
import imagehash
import numpy as np
from PIL import Image

from . import integrity as integ, ocr as ocrmod, preprocess as pre, signature as sig, store
from .config import DUPLICATE_HAMMING, STALE_DAYS
from .features import CV_FEATURE_NAMES, CV_FEATURE_SCHEMA_VERSION, decide


def perceptual_hash(bgr: np.ndarray) -> str:
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    return str(imagehash.phash(Image.fromarray(rgb), hash_size=8))


def analyse(data: bytes, *, owner_user_id: str, kind: str, expected_amount: float | None,
            expected_currency: str | None, reference_signature=None, today: date | None = None,
            check_duplicates: bool = True) -> dict:
    document_id = str(uuid.uuid4())
    bgr, clean_jpeg, mime = pre.validate_and_decode(data)
    original_shape = bgr.shape[:2]
    p = pre.preprocess(bgr)
    quality = pre.quality_metrics(p.gray, original_shape)

    o = ocrmod.ocr(p.gray)
    integ_r = integ.analyse(p.gray)
    layout = integ.layout_consistency(o.words) if o.available else 0.5
    s = sig.analyse(p.gray, reference_signature)

    ocr_amount = o.fields.get("amount")
    am, am_reason = ocrmod.amount_match(ocr_amount, expected_amount)
    dv, dv_reason = ocrmod.date_validity(o.fields.get("date"), today=today, stale_days=STALE_DAYS)
    phash = perceptual_hash(p.bgr)
    duplicate_of = store.find_duplicate(phash, owner_user_id, DUPLICATE_HAMMING) if check_duplicates else None

    features = {
        "ocr_confidence":       round(o.mean_confidence, 4),
        "amount_confidence":    round(o.confidences.get("amount", 0.0), 4),
        "document_quality":     quality["document_quality"],
        "tampering_score":      integ_r.tampering_score,
        "signature_similarity": s.similarity,
        "layout_consistency":   round(layout, 4),
        "amount_match":         am,
        "date_validity":        dv,
        "duplicate_score":      1.0 if duplicate_of else 0.0,
    }
    verdict = decide(features)
    if o.available and expected_currency and o.fields.get("currency") and o.fields["currency"] != expected_currency.upper():
        verdict["reasons"].append("currency_mismatch"); verdict["requires_review"] = True

    return {
        "document_id": document_id, "mime": mime, "size_bytes": len(data), "sha256": hashlib.sha256(data).hexdigest(),
        "phash": phash, "clean_jpeg": clean_jpeg, "kind": kind, "owner_user_id": owner_user_id,
        "expected_amount": expected_amount, "expected_currency": expected_currency,
        "features": features, "feature_names": CV_FEATURE_NAMES, "feature_schema_version": CV_FEATURE_SCHEMA_VERSION,
        "vector": [features[n] for n in CV_FEATURE_NAMES],
        "ocr": {"available": o.available, "fields": o.fields, "confidences": o.confidences, "mean_confidence": o.mean_confidence,
                "text_preview": o.text[:400]},
        "integrity": {"ela_score": integ_r.ela_score, "noise_inconsistency": integ_r.noise_inconsistency,
                      "blockiness": integ_r.blockiness, "copy_move": integ_r.copy_move, "tampering_score": integ_r.tampering_score},
        "quality": {**quality, "skew_deg": round(p.skew_deg, 2), "perspective_corrected": p.perspective_corrected},
        "signature": {"present": s.present, "bbox": s.bbox, "similarity": s.similarity, "compared": s.compared,
                      "descriptor": s.descriptor.tolist() if s.descriptor is not None else None},
        "cross_checks": {"amount_match": am_reason, "date_validity": dv_reason, "ocr_amount": ocr_amount, "duplicate_of": duplicate_of},
        **verdict,
    }


def signature_crop_png(gray: np.ndarray) -> tuple[np.ndarray | None, bytes | None, tuple | None]:
    crop, bbox = sig.locate(gray)
    if crop is None:
        return None, None, None
    ok, png = cv2.imencode(".png", crop)
    return crop, (png.tobytes() if ok else None), bbox


def decode_gray_png(png: bytes) -> np.ndarray:
    return cv2.imdecode(np.frombuffer(png, np.uint8), cv2.IMREAD_GRAYSCALE)

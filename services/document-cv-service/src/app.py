"""
document-cv-service — FastAPI entrypoint (spec §12/§13).

  GET  /health, /ready
  POST /documents/analyze                  multipart: file, expectedAmount?, expectedCurrency?, kind?   (any role)
  GET  /documents                          staff: list (status=, owner=, limit=)
  GET  /documents/{id}                     owner or staff: analysis
  GET  /documents/{id}/image               owner or staff: decrypted JPEG
  POST /documents/{id}/review              staff: note (marks reviewed)
  POST /documents/signatures/{userId}      staff multipart: enrol a reference signature
  GET  /documents/signatures/{userId}      staff: enrolment status
"""
from __future__ import annotations
import base64
import logging
import os
from datetime import datetime, timezone

import numpy as np
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from . import pipeline, store
from .auth import current_user, is_staff, staff_user
from .config import MASTER_KEY_RAW, MAX_UPLOAD_BYTES, STORE_DIR
from .crypto import Envelope, open_envelope, seal
from .events import publish_document_analyzed
from .features import CV_FEATURE_NAMES, CV_FEATURE_SCHEMA_VERSION, CV_NEUTRAL
from .ocr import TESSERACT_AVAILABLE
from .preprocess import ImageError

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("cv.app")

if os.environ.get("NODE_ENV", os.environ.get("APP_ENV", "")) == "production" and not MASTER_KEY_RAW:
    raise SystemExit("DOCUMENT_MASTER_KEY must be set in production")

app = FastAPI(title="document-cv-service", version="1.0.0", docs_url="/docs", redoc_url=None)


def err(status: int, code: str, message: str):
    return JSONResponse(status_code=status, content={"ok": False, "code": code, "message": message})


@app.exception_handler(HTTPException)
async def http_exc(_: Request, exc: HTTPException):
    detail = exc.detail if isinstance(exc.detail, dict) else {"ok": False, "code": "ERROR", "message": str(exc.detail)}
    return JSONResponse(status_code=exc.status_code, content=detail)


@app.get("/health")
def health():
    return {"status": "document-cv-service running", "ocr": TESSERACT_AVAILABLE, "featureSchemaVersion": CV_FEATURE_SCHEMA_VERSION,
            "features": CV_FEATURE_NAMES, "storeDir": STORE_DIR}


@app.get("/ready")
def ready():
    ok = store.healthcheck()
    return JSONResponse(status_code=200 if ok else 503, content={"status": "ready" if ok else "degraded", "db": ok, "ocr": TESSERACT_AVAILABLE})


def public_view(doc: dict, include_internal: bool = False) -> dict:
    out = {
        "documentId": doc["document_id"], "ownerUserId": doc["owner_user_id"], "kind": doc["kind"],
        "status": doc["status"], "riskScore": doc["risk_score"], "requiresReview": doc["requires_review"],
        "reasons": doc["reasons"], "features": doc["features"], "featureNames": CV_FEATURE_NAMES,
        "featureSchemaVersion": CV_FEATURE_SCHEMA_VERSION,
        "ocr": doc["ocr"], "integrity": doc["integrity"], "quality": doc["quality"],
        "signature": {k: v for k, v in (doc["signature"] or {}).items() if k != "descriptor"},
        "expectedAmount": doc["expected_amount"], "expectedCurrency": doc["expected_currency"],
        "duplicateOf": doc["duplicate_of"], "transactionId": doc.get("transaction_id"),
        "createdAt": doc["created_at"], "reviewedBy": doc.get("reviewed_by"), "reviewedAt": doc.get("reviewed_at"), "reviewNote": doc.get("review_note"),
        "mime": doc["mime"], "sizeBytes": doc["size_bytes"], "sha256": doc["sha256"], "keySource": doc["key_source"],
    }
    if include_internal:
        out["phash"] = doc["phash"]
    return out


@app.post("/documents/analyze", status_code=201)
async def analyze(request: Request, file: UploadFile = File(...), expectedAmount: str | None = Form(None),
                  expectedCurrency: str | None = Form(None), kind: str = Form("CHECK"), user: dict = Depends(current_user)):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        return err(413, "FILE_TOO_LARGE", f"File exceeds {MAX_UPLOAD_BYTES // (1024 * 1024)} MB")
    exp_amt = None
    if expectedAmount not in (None, ""):
        try:
            exp_amt = float(expectedAmount)
        except ValueError:
            return err(400, "VALIDATION_ERROR", "expectedAmount must be numeric")
    kind = (kind or "CHECK").upper()[:16]

    ref = None
    sig_t = store.get_signature(user["userId"])
    if sig_t:
        desc, crop_png = sig_t
        ref = (np.array(desc, np.float32), pipeline.decode_gray_png(crop_png))

    try:
        a = pipeline.analyse(data, owner_user_id=user["userId"], kind=kind, expected_amount=exp_amt,
                             expected_currency=(expectedCurrency or None), reference_signature=ref)
    except ImageError as e:
        return err(400, e.code, str(e))

    # Encrypt the cleaned image with a (quantum-derived) data key, store, persist metadata.
    env = seal(a["clean_jpeg"], a["document_id"], request.headers.get("Authorization") if is_staff(user) else None)
    store.write_blob(a["document_id"], env.ciphertext)
    store.insert_document(
        document_id=a["document_id"], owner_user_id=user["userId"], kind=kind, mime=a["mime"], size_bytes=a["size_bytes"],
        sha256=a["sha256"], phash=a["phash"], status=a["status"], risk_score=a["risk_score"], requires_review=a["requires_review"],
        features=a["features"], ocr=a["ocr"], integrity=a["integrity"], quality=a["quality"], signature=a["signature"],
        reasons=a["reasons"], expected_amount=exp_amt, expected_currency=(expectedCurrency or None),
        duplicate_of=a["cross_checks"]["duplicate_of"], envelope=env, key_source=env.key_source, kid=env.kid,
    )
    publish_document_analyzed({
        "type": "DOCUMENT_ANALYZED", "documentId": a["document_id"], "ownerUserId": user["userId"], "kind": kind,
        "status": a["status"], "riskScore": a["risk_score"], "requiresReview": a["requires_review"], "reasons": a["reasons"],
        "features": a["features"], "featureSchemaVersion": CV_FEATURE_SCHEMA_VERSION,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })
    doc = store.get_document(a["document_id"])
    return public_view(doc)


def _authorised(doc: dict, user: dict):
    if doc is None:
        raise HTTPException(404, {"ok": False, "code": "NOT_FOUND", "message": "Document not found"})
    if not is_staff(user) and doc["owner_user_id"] != user["userId"]:
        raise HTTPException(403, {"ok": False, "code": "FORBIDDEN", "message": "Not your document"})


@app.get("/documents")
def list_docs(status: str | None = None, owner: str | None = None, limit: int = 50, user: dict = Depends(staff_user)):
    limit = max(1, min(200, limit))
    return {"documents": [public_view(d) for d in store.list_documents(status, owner, limit)]}


@app.get("/documents/{document_id}")
def get_doc(document_id: str, user: dict = Depends(current_user)):
    doc = store.get_document(document_id); _authorised(doc, user)
    return public_view(doc, include_internal=is_staff(user))


@app.get("/documents/{document_id}/image")
def get_image(document_id: str, user: dict = Depends(current_user)):
    doc = store.get_document(document_id); _authorised(doc, user)
    ct = store.read_blob(document_id)
    if ct is None:
        raise HTTPException(410, {"ok": False, "code": "GONE", "message": "Image blob missing"})
    env = Envelope(ct, base64.b64decode(doc["enc_nonce"]), base64.b64decode(doc["wrapped_dek"]), base64.b64decode(doc["wrap_nonce"]),
                   doc["key_source"], doc["kms_kid"])
    try:
        img = open_envelope(env, document_id)
    except Exception:  # noqa: BLE001 — wrong master key / tampered blob
        raise HTTPException(500, {"ok": False, "code": "DECRYPT_FAILED", "message": "Could not decrypt document"})
    return Response(content=img, media_type="image/jpeg", headers={"Cache-Control": "private, no-store",
                    "Content-Disposition": f'inline; filename="{document_id}.jpg"'})


@app.post("/documents/{document_id}/review")
def review(document_id: str, body: dict | None = None, user: dict = Depends(staff_user)):
    doc = store.get_document(document_id); _authorised(doc, user)
    store.mark_reviewed(document_id, user["userId"], (body or {}).get("note"))
    return {"ok": True, "documentId": document_id, "reviewedBy": user["userId"]}


@app.post("/documents/signatures/{user_id}", status_code=201)
async def enrol_signature(user_id: str, file: UploadFile = File(...), user: dict = Depends(staff_user)):
    data = await file.read(MAX_UPLOAD_BYTES + 1)
    try:
        bgr, _, _ = pipeline.pre.validate_and_decode(data)
    except ImageError as e:
        return err(400, e.code, str(e))
    p = pipeline.pre.preprocess(bgr)
    crop, png, bbox = pipeline.signature_crop_png(p.gray)
    if crop is None:
        # Whole image is the signature sample (e.g. a scanned signature card)
        ok, png_full = pipeline.cv2.imencode(".png", p.gray)
        crop, png, bbox = p.gray, png_full.tobytes(), None
    desc = pipeline.sig._descriptor(crop)
    store.upsert_signature(user_id, desc.tolist(), png, user["userId"])
    return {"ok": True, "userId": user_id, "bbox": bbox, "descriptorDim": int(desc.shape[0])}


@app.get("/documents/signatures/{user_id}")
def signature_status(user_id: str, user: dict = Depends(staff_user)):
    return {"userId": user_id, "enrolled": store.get_signature(user_id) is not None}


@app.get("/documents/schema")
def schema():
    return {"featureSchemaVersion": CV_FEATURE_SCHEMA_VERSION, "featureNames": CV_FEATURE_NAMES, "neutral": CV_NEUTRAL}

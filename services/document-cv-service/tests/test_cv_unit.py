import io
import os
import re
from datetime import date

import numpy as np
import pytest
from PIL import Image

from src import features, integrity, ocr, preprocess, signature
from src.crypto import Envelope, open_envelope, seal, wrap_dek, unwrap_dek
from tests.synth import make_check


# ── preprocessing & validation ──────────────────────────────────────
def test_validate_rejects_bad_inputs():
    with pytest.raises(preprocess.ImageError) as e: preprocess.validate_and_decode(b"")
    assert e.value.code == "EMPTY_FILE"
    with pytest.raises(preprocess.ImageError) as e: preprocess.validate_and_decode(b"GIF89a....")
    assert e.value.code == "UNSUPPORTED_FORMAT"
    with pytest.raises(preprocess.ImageError) as e: preprocess.validate_and_decode(b"\xff\xd8\xff" + b"\x00" * 100)
    assert e.value.code == "CORRUPT_IMAGE"
    tiny = io.BytesIO(); Image.new("RGB", (50, 50)).save(tiny, "PNG")
    with pytest.raises(preprocess.ImageError) as e: preprocess.validate_and_decode(tiny.getvalue())
    assert e.value.code == "IMAGE_TOO_SMALL"


def test_validate_strips_exif_and_reencodes():
    img = Image.new("RGB", (600, 300), (200, 200, 200))
    exif = Image.Exif(); exif[0x010F] = "SecretCam"
    buf = io.BytesIO(); img.save(buf, "JPEG", exif=exif.tobytes())
    bgr, clean, mime = preprocess.validate_and_decode(buf.getvalue())
    assert mime == "image/jpeg" and bgr.shape == (300, 600, 3)
    assert b"SecretCam" not in clean


def test_preprocess_deskews_rotated_document():
    data = make_check()
    bgr, _, _ = preprocess.validate_and_decode(data)
    img = Image.fromarray(bgr[:, :, ::-1]).rotate(3, expand=True, fillcolor=(248, 246, 240))
    rot = np.array(img)[:, :, ::-1].copy()
    p = preprocess.preprocess(rot)
    # Either the border quadrilateral was found and warped flat, or the text skew was corrected.
    assert p.perspective_corrected or abs(p.skew_deg) > 1.0
    assert p.gray.shape[0] > 100
    # Direct deskew on borderless text: angle estimate must be close to the applied rotation.
    import cv2
    text = Image.new("L", (900, 400), 255); from PIL import ImageDraw
    dr = ImageDraw.Draw(text)
    for y in range(40, 360, 40): dr.text((40, y), "PAYEZ A L'ORDRE DE YASMINE TRABELSI 1250.500 TND", fill=0)
    rotated = np.array(text.rotate(3, expand=True, fillcolor=255))
    _, ang = preprocess._deskew(rotated)
    assert 1.5 < abs(ang) < 4.5


def test_quality_metrics_range():
    bgr, _, _ = preprocess.validate_and_decode(make_check())
    p = preprocess.preprocess(bgr)
    q = preprocess.quality_metrics(p.gray, bgr.shape[:2])
    assert 0 <= q["document_quality"] <= 1 and q["sharpness"] > 0.3


# ── OCR helpers (pure) ───────────────────────────────────────────────
@pytest.mark.parametrize("s,v", [("1250.500", 1250.5), ("1.250,500", 1250.5), ("1,250.50", 1250.5), ("250", 250.0), ("abc", None), ("0", None)])
def test_parse_amount(s, v):
    assert ocr.parse_amount(s) == v


def test_date_validity():
    today = date(2026, 10, 9)
    assert ocr.date_validity("2026-10-08", today)[0] == 1.0
    assert ocr.date_validity("2026-10-20", today) == (0.0, "post_dated")
    assert ocr.date_validity("2025-01-01", today) == (0.0, "stale")
    assert ocr.date_validity(None, today) == (0.5, "no_date")


def test_amount_match():
    assert ocr.amount_match(1250.5, 1250.5) == (1.0, "match")
    assert ocr.amount_match(1250.5, 1300)[0] == 0.0
    assert ocr.amount_match(None, 10) == (0.5, "unknown")


def test_extract_fields_from_words():
    W = ocr.Word
    def w(t, x, line=(1, 1, 1)): return W(t, 0.9, x, 10, 40, 20, line)
    words = [w("BIAT", 0), w("N°", 300, (1, 1, 2)), w("123456", 340, (1, 1, 2)), w("Date", 0, (1, 1, 3)), w(":", 60, (1, 1, 3)), w("08/10/2026", 80, (1, 1, 3)),
             w("Payez", 0, (1, 1, 4)), w("a", 70, (1, 1, 4)), w("l'ordre", 90, (1, 1, 4)), w("de", 160, (1, 1, 4)), w(":", 180, (1, 1, 4)), w("Yasmine", 200, (1, 1, 4)), w("Trabelsi", 300, (1, 1, 4)),
             w("Montant", 0, (1, 1, 5)), w(":", 100, (1, 1, 5)), w("1250.500", 120, (1, 1, 5)), w("TND", 240, (1, 1, 5))]
    f, c = ocr.extract_fields(words)
    assert f["amount"] == 1250.5 and f["currency"] == "TND" and f["date"] == "2026-10-08"
    assert f["document_number"] == "123456" and f["bank"] == "BIAT" and f["payee"].startswith("Yasmine")
    assert all(0 < v <= 1 for v in c.values())


# ── integrity ─────────────────────────────────────────────────────────
def test_tampered_patch_raises_tampering_score():
    clean = preprocess.preprocess(preprocess.validate_and_decode(make_check())[0]).gray
    tampered = preprocess.preprocess(preprocess.validate_and_decode(make_check(tamper_patch=True))[0]).gray
    a, b = integrity.analyse(clean), integrity.analyse(tampered)
    assert 0 <= a.tampering_score <= 1 and 0 <= b.tampering_score <= 1
    assert b.ela_score >= a.ela_score and b.noise_inconsistency >= a.noise_inconsistency
    assert b.tampering_score > a.tampering_score


def test_layout_consistency_prefers_aligned_text():
    W = ocr.Word
    aligned = [W("a", .9, x, 100, 30, 20, (1, 1, 1)) for x in range(0, 300, 40)] + [W("b", .9, x, 160, 30, 20, (1, 1, 2)) for x in range(0, 300, 40)]
    skewed = [W("a", .9, x, 100 + x // 5, 30, 20 + (x % 17), (1, 1, 1)) for x in range(0, 300, 40)] + [W("b", .9, x, 200 - x // 4, 30, 8 + (x % 23), (1, 1, 2)) for x in range(0, 300, 40)]
    assert integrity.layout_consistency(aligned) > integrity.layout_consistency(skewed)


# ── signature ─────────────────────────────────────────────────────────
def test_signature_detected_and_self_similar():
    gray = preprocess.preprocess(preprocess.validate_and_decode(make_check(signature=True))[0]).gray
    crop, bbox = signature.locate(gray)
    assert crop is not None and bbox[2] > 50
    desc = signature._descriptor(crop)
    r = signature.analyse(gray, (desc, crop))
    assert r.present and r.compared and r.similarity > 0.8
    none = signature.analyse(gray, None)
    assert none.similarity == 0.5 and not none.compared


# ── features & risk policy ────────────────────────────────────────────
def base():
    return {"ocr_confidence": .9, "amount_confidence": .9, "document_quality": .8, "tampering_score": .05, "signature_similarity": .5,
            "layout_consistency": .9, "amount_match": 1.0, "date_validity": 1.0, "duplicate_score": 0.0}


def test_risk_policy_thresholds():
    assert features.decide(base())["status"] == "CLEAN"
    assert features.decide({**base(), "tampering_score": .9, "amount_match": 0.0, "duplicate_score": 1.0})["status"] == "SUSPICIOUS"
    r = features.decide({**base(), "amount_match": 0.0})
    assert r["requires_review"] and "amount_mismatch" in r["reasons"] and r["status"] != "CLEAN"
    stale = features.decide({**base(), "date_validity": 0.0})
    assert stale["status"] == "REVIEW" and "invalid_date" in stale["reasons"]   # hard finding lifts a low score
    unverified = features.decide({**base(), "ocr_confidence": 0, "amount_confidence": 0, "amount_match": .5, "date_validity": .5})
    assert unverified["status"] == "REVIEW"  # could not be OCR'd → never auto-approved


# ── encryption envelope ───────────────────────────────────────────────
def test_envelope_roundtrip_and_tamper_detection():
    env = seal(b"jpeg-bytes", "doc-1", None)
    assert env.key_source == "os.urandom" and open_envelope(env, "doc-1") == b"jpeg-bytes"
    with pytest.raises(Exception): open_envelope(env, "doc-2")             # AAD mismatch
    bad = Envelope(env.ciphertext[:-1] + bytes([env.ciphertext[-1] ^ 1]), env.nonce, env.wrapped_dek, env.wrap_nonce, "x", None)
    with pytest.raises(Exception): open_envelope(bad, "doc-1")             # ciphertext tampered
    w, n = wrap_dek(b"k" * 32, b"aad"); assert unwrap_dek(w, n, b"aad") == b"k" * 32


# ── full pipeline (OCR assertions only when tesseract exists) ─────────
def test_pipeline_end_to_end(monkeypatch):
    from src import pipeline
    monkeypatch.setattr(pipeline.store, "find_duplicate", lambda *a, **k: None)
    a = pipeline.analyse(make_check(), owner_user_id="u1", kind="CHECK", expected_amount=1250.5, expected_currency="TND",
                         today=date(2026, 10, 9), check_duplicates=True)
    assert set(a["features"]) == set(features.CV_FEATURE_NAMES) and len(a["vector"]) == 9
    assert a["status"] in ("CLEAN", "REVIEW", "SUSPICIOUS") and re.match(r"[0-9a-f-]{36}", a["document_id"])
    assert len(a["phash"]) == 16 and a["clean_jpeg"][:3] == b"\xff\xd8\xff"
    if ocr.TESSERACT_AVAILABLE:
        assert a["ocr"]["fields"].get("amount") == 1250.5
        assert a["features"]["amount_match"] == 1.0 and a["features"]["date_validity"] == 1.0
        assert a["status"] == "CLEAN", a
        bad = pipeline.analyse(make_check(amount="9999.000", date="01/01/2024"), owner_user_id="u1", kind="CHECK",
                               expected_amount=1250.5, expected_currency="TND", today=date(2026, 10, 9))
        assert bad["features"]["amount_match"] == 0.0 and bad["features"]["date_validity"] == 0.0
        assert bad["requires_review"] and "amount_mismatch" in bad["reasons"]
    else:
        assert a["status"] == "REVIEW" and "ocr_unavailable" in a["reasons"]

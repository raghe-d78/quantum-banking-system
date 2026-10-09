"""
Image acquisition & preprocessing (spec §4.1).

validate_and_decode()  magic bytes, size, decompression-bomb guard, EXIF strip
preprocess()           resize → grayscale → denoise → deskew → perspective
                       correction → CLAHE contrast → normalisation
quality_metrics()      blur (Laplacian variance), brightness, contrast,
                       resolution → document_quality ∈ [0, 1]
"""
from __future__ import annotations
import io
import math
from dataclasses import dataclass

import cv2
import numpy as np
from PIL import Image, ImageOps

from .config import ALLOWED_MIME, MAX_PIXELS, MAX_UPLOAD_BYTES, WORK_MAX_SIDE

Image.MAX_IMAGE_PIXELS = MAX_PIXELS


class ImageError(ValueError):
    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code


def sniff_mime(data: bytes) -> str | None:
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    return None


def validate_and_decode(data: bytes) -> tuple[np.ndarray, bytes, str]:
    """Returns (BGR array, re-encoded clean JPEG bytes, mime). Raises ImageError."""
    if not data:
        raise ImageError("EMPTY_FILE", "No file content")
    if len(data) > MAX_UPLOAD_BYTES:
        raise ImageError("FILE_TOO_LARGE", f"File exceeds {MAX_UPLOAD_BYTES // (1024*1024)} MB")
    mime = sniff_mime(data)
    if mime not in ALLOWED_MIME:
        raise ImageError("UNSUPPORTED_FORMAT", "Only JPEG and PNG images are accepted")
    try:
        img = Image.open(io.BytesIO(data))
        img.verify()                       # structural check
        img = Image.open(io.BytesIO(data))  # reopen after verify()
        img = ImageOps.exif_transpose(img)  # honour orientation, then drop EXIF
        img = img.convert("RGB")
    except Image.DecompressionBombError:
        raise ImageError("IMAGE_TOO_LARGE", "Image dimensions exceed the allowed limit")
    except Exception:
        raise ImageError("CORRUPT_IMAGE", "Image could not be decoded")
    w, h = img.size
    if w < 200 or h < 100:
        raise ImageError("IMAGE_TOO_SMALL", "Image is too small to analyse (min 200×100)")
    # Re-encode: strips metadata (EXIF/GPS) and normalises the container.
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=92, optimize=True)
    clean = buf.getvalue()
    bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    return bgr, clean, mime


@dataclass
class Preprocessed:
    bgr: np.ndarray        # working-resolution colour image (after perspective/deskew)
    gray: np.ndarray       # enhanced grayscale used by OCR + integrity
    scale: float           # working / original
    skew_deg: float
    perspective_corrected: bool


def _resize(bgr: np.ndarray) -> tuple[np.ndarray, float]:
    h, w = bgr.shape[:2]
    s = min(1.0, WORK_MAX_SIDE / max(h, w))
    if s < 1.0:
        bgr = cv2.resize(bgr, (int(w * s), int(h * s)), interpolation=cv2.INTER_AREA)
    return bgr, s


def _perspective(bgr: np.ndarray) -> tuple[np.ndarray, bool]:
    """Find the document's quadrilateral; warp it flat when a confident 4-point contour covers ≥ 40 % of the frame."""
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 50, 150)
    edges = cv2.dilate(edges, np.ones((3, 3), np.uint8), iterations=1)
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    if not contours:
        return bgr, False
    h, w = gray.shape
    for c in sorted(contours, key=cv2.contourArea, reverse=True)[:5]:
        area = cv2.contourArea(c)
        if area < 0.40 * h * w:
            break
        approx = cv2.approxPolyDP(c, 0.02 * cv2.arcLength(c, True), True)
        if len(approx) == 4:
            pts = approx.reshape(4, 2).astype(np.float32)
            s = pts.sum(1); d = np.diff(pts, axis=1).ravel()
            tl, br, tr, bl = pts[np.argmin(s)], pts[np.argmax(s)], pts[np.argmin(d)], pts[np.argmax(d)]
            W = int(max(np.linalg.norm(br - bl), np.linalg.norm(tr - tl)))
            H = int(max(np.linalg.norm(tr - br), np.linalg.norm(tl - bl)))
            if W < 100 or H < 50:
                return bgr, False
            M = cv2.getPerspectiveTransform(np.array([tl, tr, br, bl]), np.array([[0, 0], [W - 1, 0], [W - 1, H - 1], [0, H - 1]], np.float32))
            return cv2.warpPerspective(bgr, M, (W, H)), True
    return bgr, False


def _deskew(gray: np.ndarray) -> tuple[np.ndarray, float]:
    """Estimate text skew from the minimum-area rectangle around ink pixels; rotate if |angle| ≤ 15°."""
    thr = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    coords = np.column_stack(np.where(thr > 0))
    if len(coords) < 50:
        return gray, 0.0
    angle = cv2.minAreaRect(coords[:, ::-1].astype(np.float32))[-1]
    angle = -(90 + angle) if angle < -45 else -angle
    if abs(angle) < 0.3 or abs(angle) > 15:
        return gray, 0.0
    h, w = gray.shape
    M = cv2.getRotationMatrix2D((w / 2, h / 2), angle, 1.0)
    return cv2.warpAffine(gray, M, (w, h), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE), float(angle)


def preprocess(bgr: np.ndarray) -> Preprocessed:
    bgr, scale = _resize(bgr)
    bgr, corrected = _perspective(bgr)
    gray = cv2.cvtColor(bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.fastNlMeansDenoising(gray, None, h=7, templateWindowSize=7, searchWindowSize=21)
    gray, skew = _deskew(gray)
    if skew:
        M = cv2.getRotationMatrix2D((bgr.shape[1] / 2, bgr.shape[0] / 2), skew, 1.0)
        bgr = cv2.warpAffine(bgr, M, (bgr.shape[1], bgr.shape[0]), flags=cv2.INTER_CUBIC, borderMode=cv2.BORDER_REPLICATE)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    gray = clahe.apply(gray)
    gray = cv2.normalize(gray, None, 0, 255, cv2.NORM_MINMAX)
    return Preprocessed(bgr=bgr, gray=gray, scale=scale, skew_deg=skew, perspective_corrected=corrected)


def quality_metrics(gray: np.ndarray, original_shape: tuple[int, int]) -> dict:
    """document_quality = geometric mean of sharpness, exposure, contrast and resolution sub-scores."""
    lap_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    sharp = min(1.0, lap_var / 300.0)                         # ≥300 ≈ crisp scan
    mean = float(gray.mean()); std = float(gray.std())
    exposure = max(0.0, 1.0 - abs(mean - 150) / 150.0)         # ideal paper ≈ 150-180
    contrast = min(1.0, std / 55.0)
    h, w = original_shape
    resolution = min(1.0, (w * h) / (1200 * 600))              # ≥ 0.7 MP is enough for OCR
    parts = [max(s, 1e-3) for s in (sharp, exposure, contrast, resolution)]
    quality = float(math.exp(sum(math.log(p) for p in parts) / len(parts)))
    return {
        "document_quality": round(quality, 4),
        "sharpness": round(sharp, 4), "laplacian_var": round(lap_var, 2),
        "exposure": round(exposure, 4), "contrast": round(contrast, 4), "resolution": round(resolution, 4),
        "width": w, "height": h,
    }

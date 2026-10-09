"""
Signature analysis (spec §7) — experimental heuristic.

1. Locate the signature region: ink in the bottom-right 40 % × 35 % of the
   document whose connected components look hand-written (large, irregular,
   low fill ratio) rather than printed text.
2. Describe it with a HOG-like descriptor (gradient-orientation histogram on
   a normalised 128×64 crop) plus ORB keypoints.
3. Compare with the customer's enrolled reference (signature_templates):
   similarity = 0.5 × cosine(HOG) + 0.5 × ORB match ratio.
   No reference enrolled → similarity 0.5 (neutral), signature_present reported.
"""
from __future__ import annotations
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class SignatureResult:
    present: bool
    bbox: tuple | None
    descriptor: np.ndarray | None
    similarity: float
    compared: bool


def _descriptor(crop: np.ndarray) -> np.ndarray:
    crop = cv2.resize(crop, (128, 64), interpolation=cv2.INTER_AREA)
    gx = cv2.Sobel(crop, cv2.CV_32F, 1, 0); gy = cv2.Sobel(crop, cv2.CV_32F, 0, 1)
    mag, ang = cv2.cartToPolar(gx, gy, angleInDegrees=True)
    hist = []
    for y in range(0, 64, 16):
        for x in range(0, 128, 16):
            m = mag[y:y + 16, x:x + 16].ravel(); a = ang[y:y + 16, x:x + 16].ravel()
            h, _ = np.histogram(a, bins=9, range=(0, 180), weights=m)
            hist.extend(h)
    v = np.array(hist, np.float32)
    return v / (np.linalg.norm(v) + 1e-6)


def locate(gray: np.ndarray) -> tuple[np.ndarray | None, tuple | None]:
    h, w = gray.shape
    roi = gray[int(h * 0.65):, int(w * 0.55):]
    thr = cv2.threshold(roi, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)[1]
    thr = cv2.morphologyEx(thr, cv2.MORPH_CLOSE, np.ones((5, 15), np.uint8))
    n, _, stats, _ = cv2.connectedComponentsWithStats(thr, 8)
    best = None
    for i in range(1, n):
        x, y, cw, ch, area = stats[i]
        if cw < roi.shape[1] * 0.15 or ch < 10:
            continue
        fill = area / float(cw * ch)
        if 0.05 <= fill <= 0.55 and cw / max(ch, 1) >= 1.5:   # stroke-like, wide, sparse
            if best is None or area > best[4]:
                best = (x, y, cw, ch, area)
    if best is None:
        return None, None
    x, y, cw, ch, _ = best
    crop = roi[y:y + ch, x:x + cw]
    return crop, (int(w * 0.55) + int(x), int(h * 0.65) + int(y), int(cw), int(ch))


def compare(desc_a: np.ndarray, crop_a: np.ndarray, desc_b: np.ndarray, crop_b: np.ndarray) -> float:
    cos = float(np.dot(desc_a, desc_b))
    try:
        orb = cv2.ORB_create(500)
        ka, da = orb.detectAndCompute(cv2.resize(crop_a, (256, 128)), None)
        kb, db = orb.detectAndCompute(cv2.resize(crop_b, (256, 128)), None)
        if da is None or db is None or len(ka) < 8 or len(kb) < 8:
            ratio = 0.0
        else:
            ms = cv2.BFMatcher(cv2.NORM_HAMMING).knnMatch(da, db, k=2)
            good = [m for m, n in (p for p in ms if len(p) == 2) if m.distance < 0.75 * n.distance]
            ratio = len(good) / max(min(len(ka), len(kb)), 1)
    except cv2.error:
        ratio = 0.0
    return float(np.clip(0.5 * cos + 0.5 * min(1.0, ratio * 2), 0, 1))


def analyse(gray: np.ndarray, reference: tuple[np.ndarray, np.ndarray] | None) -> SignatureResult:
    crop, bbox = locate(gray)
    if crop is None:
        return SignatureResult(False, None, None, 0.5 if reference is None else 0.2, reference is not None)
    desc = _descriptor(crop)
    if reference is None:
        return SignatureResult(True, bbox, desc, 0.5, False)
    ref_desc, ref_crop = reference
    return SignatureResult(True, bbox, desc, round(compare(desc, crop, ref_desc, ref_crop), 4), True)

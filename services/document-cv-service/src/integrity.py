"""
Document integrity analysis (spec §6) and layout consistency (spec §8).

Signals (all ∈ [0, 1], higher = more suspicious unless noted):
  ela_score            Error-Level Analysis: re-save as JPEG q=90 and measure
                       the per-block error; edited regions re-compress with a
                       different error level than the rest → high local
                       contrast in the ELA map.
  noise_inconsistency  Coefficient of variation of local noise (Laplacian
                       variance) over a grid. Pasted regions bring their own
                       sensor/compression noise.
  blockiness           Ratio of 8-px-grid edge energy to off-grid energy;
                       double-compressed or spliced JPEGs show grid misalignment.
  copy_move            Fraction of matched ORB keypoint pairs with a consistent
                       non-trivial offset (duplicated patches inside the image).
  tampering_score      Weighted combination of the above.
  layout_consistency   (higher = better) alignment of OCR text lines and
                       uniformity of their heights / baselines.
"""
from __future__ import annotations
import math
from dataclasses import dataclass

import cv2
import numpy as np


@dataclass
class Integrity:
    ela_score: float
    noise_inconsistency: float
    blockiness: float
    copy_move: float
    tampering_score: float
    details: dict


def ela(gray: np.ndarray, quality: int = 90) -> tuple[float, np.ndarray]:
    ok, enc = cv2.imencode(".jpg", gray, [cv2.IMWRITE_JPEG_QUALITY, quality])
    if not ok:
        return 0.0, np.zeros_like(gray)
    re = cv2.imdecode(enc, cv2.IMREAD_GRAYSCALE)
    diff = cv2.absdiff(gray, re).astype(np.float32)
    # Per-block mean error; suspicious = a few blocks far above the typical block.
    bs = 32
    h, w = diff.shape
    blocks = [diff[y:y + bs, x:x + bs].mean() for y in range(0, h - bs + 1, bs) for x in range(0, w - bs + 1, bs)]
    if len(blocks) < 4:
        return 0.0, diff
    b = np.array(blocks)
    # Floor the reference at half a grey level: on flat paper the median block error is ~0 and
    # every text block would otherwise look like an outlier (score pinned at 1.0 for clean scans).
    med = max(float(np.median(b)), 0.5)
    outlier_ratio = float((b > 3.0 * med).mean())
    spread = float(np.clip((b.max() - med) / (10.0 * med), 0, 1))
    return float(np.clip(0.6 * spread + 0.4 * min(1.0, outlier_ratio * 10), 0, 1)), diff


def noise_inconsistency(gray: np.ndarray) -> float:
    bs = 64
    h, w = gray.shape
    vals = []
    for y in range(0, h - bs + 1, bs):
        for x in range(0, w - bs + 1, bs):
            blk = gray[y:y + bs, x:x + bs]
            if blk.std() < 2:          # skip flat paper
                continue
            vals.append(cv2.Laplacian(blk, cv2.CV_64F).var())
    if len(vals) < 6:
        return 0.0
    v = np.array(vals)
    cv_ = float(v.std() / (v.mean() + 1e-6))
    return float(np.clip((cv_ - 0.8) / 2.0, 0, 1))   # natural scans ≈ 0.4-0.9


def blockiness(gray: np.ndarray) -> float:
    g = gray.astype(np.float32)
    dx = np.abs(np.diff(g, axis=1)); dy = np.abs(np.diff(g, axis=0))
    on_x = dx[:, 7::8].mean() if dx.shape[1] > 8 else 0; off_x = np.delete(dx, np.s_[7::8], axis=1).mean()
    on_y = dy[7::8, :].mean() if dy.shape[0] > 8 else 0; off_y = np.delete(dy, np.s_[7::8], axis=0).mean()
    ratio = ((on_x + on_y) / 2) / (((off_x + off_y) / 2) + 1e-6)
    return float(np.clip((ratio - 1.05) / 0.6, 0, 1))


def copy_move(gray: np.ndarray) -> float:
    try:
        orb = cv2.ORB_create(nfeatures=1500)
        kp, des = orb.detectAndCompute(gray, None)
        if des is None or len(kp) < 40:
            return 0.0
        bf = cv2.BFMatcher(cv2.NORM_HAMMING)
        matches = bf.knnMatch(des, des, k=3)
        offsets = []
        for ms in matches:
            for m in ms[1:]:      # skip self-match
                if m.distance < 28:
                    p, q = kp[m.queryIdx].pt, kp[m.trainIdx].pt
                    d = (int(round((q[0] - p[0]) / 8)), int(round((q[1] - p[1]) / 8)))
                    if abs(d[0]) + abs(d[1]) >= 3:
                        offsets.append(d)
        if len(offsets) < 10:
            return 0.0
        _, counts = np.unique(np.array(offsets), axis=0, return_counts=True)
        top = counts.max()
        return float(np.clip((top - 8) / 40.0, 0, 1))
    except cv2.error:
        return 0.0


def analyse(gray: np.ndarray) -> Integrity:
    e, _ = ela(gray)
    n = noise_inconsistency(gray)
    b = blockiness(gray)
    c = copy_move(gray)
    tamper = float(np.clip(0.40 * e + 0.25 * n + 0.15 * b + 0.20 * c, 0, 1))
    return Integrity(round(e, 4), round(n, 4), round(b, 4), round(c, 4), round(tamper, 4),
                     {"weights": {"ela": 0.40, "noise": 0.25, "blockiness": 0.15, "copy_move": 0.20}})


def layout_consistency(words) -> float:
    """1.0 = perfectly aligned printed layout. Uses OCR word boxes grouped by line."""
    if not words:
        return 0.5
    lines: dict = {}
    for w in words:
        lines.setdefault(w.line, []).append(w)
    rows = [v for v in lines.values() if len(v) >= 2]
    if len(rows) < 2:
        return 0.6
    angles, heights, lefts = [], [], []
    for row in rows:
        row = sorted(row, key=lambda w: w.x)
        ys = np.array([w.y + w.h for w in row], float); xs = np.array([w.x for w in row], float)
        if np.ptp(xs) > 0:
            slope = np.polyfit(xs, ys, 1)[0]
            angles.append(math.degrees(math.atan(slope)))
        heights.append(np.median([w.h for w in row]))
        lefts.append(row[0].x)
    a = float(np.std(angles)) if angles else 0.0
    hcv = float(np.std(heights) / (np.mean(heights) + 1e-6))
    score = 1.0 - min(1.0, a / 3.0) * 0.5 - min(1.0, hcv) * 0.5
    return float(np.clip(score, 0, 1))

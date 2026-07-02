"""
Phase 5.4 — Comparative analysis: classical baseline vs quantum VQC.

Loads the trained models from $FRAUD_MODELS_DIR (defaults to /app/models),
evaluates both on a fresh held-out test set, measures per-inference
latency, and prints a JSON summary that the caller can paste into
docs/comparative-analysis.md.

Run inside the fraud-service container:

    docker exec -w /app infrastructure-fraud-service-1 \
        python -m src.eval_compare
"""
from __future__ import annotations

import json
import os
import time
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score

from .baseline import load_or_train as load_baseline
from .vqc      import load_or_train as load_vqc
from .dataset  import generate as generate_dataset


def _scores(bundle, X):
    """Call bundle.predict_proba on each sample; returns float array."""
    return np.array([bundle.predict_proba(row) for row in X], dtype=float)


def _latency(bundle, X, n_samples: int = 50):
    """Median per-sample latency in milliseconds (single-row scoring)."""
    pick = X[: min(n_samples, len(X))]
    times = []
    for row in pick:
        t0 = time.perf_counter()
        bundle.predict_proba(row)
        times.append(time.perf_counter() - t0)
    return float(np.median(times) * 1000.0)


def main():
    models_dir = os.environ.get("FRAUD_MODELS_DIR", "/app/models")

    print(f"loading models from {models_dir} …")
    baseline = load_baseline(models_dir)
    vqc      = load_vqc(models_dir)

    print("generating fresh test set …")
    X, y, _names = generate_dataset(seed=999)
    _Xtr, Xte, _ytr, yte = train_test_split(X, y, test_size=0.2, stratify=y, random_state=999)
    print(f"test set size: {len(yte)}  (positives: {int(yte.sum())})")

    print("evaluating classical baseline …")
    bp = _scores(baseline, Xte)
    by = (bp >= 0.5).astype(int)
    b_p50 = _latency(baseline, Xte, n_samples=200)

    print("evaluating quantum VQC (slow on CPU) …")
    qp = _scores(vqc, Xte)
    qy = (qp >= 0.5).astype(int)
    q_p50 = _latency(vqc, Xte, n_samples=20)

    report = {
        "datasetSize": int(len(yte)),
        "positives":   int(yte.sum()),
        "decisionThreshold": 0.5,
        "classical": {
            "modelVersion": baseline.metadata.get("modelVersion") or baseline.metadata.get("version"),
            "precision":    float(precision_score(yte, by, zero_division=0)),
            "recall":       float(recall_score(yte, by, zero_division=0)),
            "f1":           float(f1_score(yte, by, zero_division=0)),
            "rocAuc":       float(roc_auc_score(yte, bp)),
            "latencyMsP50": round(b_p50, 3),
        },
        "quantum": {
            "modelVersion": vqc.metadata.get("modelVersion") or vqc.metadata.get("version"),
            "precision":    float(precision_score(yte, qy, zero_division=0)),
            "recall":       float(recall_score(yte, qy, zero_division=0)),
            "f1":           float(f1_score(yte, qy, zero_division=0)),
            "rocAuc":       float(roc_auc_score(yte, qp)),
            "latencyMsP50": round(q_p50, 3),
        },
    }
    print("---REPORT-JSON---")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

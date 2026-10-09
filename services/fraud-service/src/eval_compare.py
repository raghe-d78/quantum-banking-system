"""
Phase 5.4 — Comparative analysis: classical baseline vs quantum VQC.

Loads the trained models from $FRAUD_MODELS_DIR (defaults to /app/models),
evaluates both on a fresh held-out test set, measures per-inference
latency, and prints a JSON summary that the caller can paste into
docs/comparative-analysis.md.

Run inside the fraud-service container:

    docker exec -w /app qbs-fraud-service-1 \
        python -m src.eval_compare
"""
from __future__ import annotations

import json
import os
import time
import numpy as np
from sklearn.model_selection import train_test_split
from sklearn.metrics import precision_score, recall_score, f1_score, roc_auc_score

from .baseline import load_or_train as load_baseline, train as train_baseline_on
from .vqc      import load_or_train as load_vqc
from .dataset  import generate as generate_dataset
from .features import TX_DIM, FEATURE_NAMES


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


def _metrics(y, p):
    yhat = (p >= 0.5).astype(int)
    return {"precision": float(precision_score(y, yhat, zero_division=0)), "recall": float(recall_score(y, yhat, zero_division=0)),
            "f1": float(f1_score(y, yhat, zero_division=0)), "rocAuc": float(roc_auc_score(y, p))}


def ablation_classical(seed: int = 999) -> dict:
    """CV extension §17: ROC-AUC of the classical model WITH vs WITHOUT the document features.
    Both variants are trained on the same split; 'without' sees only the 7 transaction columns."""
    from sklearn.linear_model import LogisticRegression
    from sklearn.preprocessing import StandardScaler
    X, y, _ = generate_dataset(seed=seed)
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.2, stratify=y, random_state=seed)
    out = {}
    for name, cols in (("with_cv", slice(None)), ("without_cv", slice(0, TX_DIM))):
        sc = StandardScaler().fit(Xtr[:, cols])
        clf = LogisticRegression(class_weight="balanced", max_iter=1000, random_state=seed).fit(sc.transform(Xtr[:, cols]), ytr)
        out[name] = _metrics(yte, clf.predict_proba(sc.transform(Xte[:, cols]))[:, 1])
    # Documents only: how much signal the 9 CV columns carry on their own (rows that have a document).
    has = Xte[:, TX_DIM] == 1.0
    if has.sum() > 50 and len(set(yte[has])) == 2:
        sc = StandardScaler().fit(Xtr[Xtr[:, TX_DIM] == 1.0][:, TX_DIM + 1:])
        clf = LogisticRegression(class_weight="balanced", max_iter=1000, random_state=seed).fit(
            sc.transform(Xtr[Xtr[:, TX_DIM] == 1.0][:, TX_DIM + 1:]), ytr[Xtr[:, TX_DIM] == 1.0])
        out["cv_only_on_documented_rows"] = _metrics(yte[has], clf.predict_proba(sc.transform(Xte[has][:, TX_DIM + 1:]))[:, 1])
    out["featureNames"] = FEATURE_NAMES
    return out


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
    print("running classical ablation (with / without document features) …")
    report["ablation"] = ablation_classical(seed=999)
    print("---REPORT-JSON---")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()

"""
Classical baseline: logistic regression (Phase 4.1).

Trained on the synthetic dataset with class-weight balancing. Saved bundle
(`baseline.pkl`) contains the fitted scaler + model + metadata so inference
always uses the exact preprocessing pipeline that was trained.
"""
from __future__ import annotations
import json
import os
import time
from dataclasses import dataclass

import joblib
import numpy as np
from sklearn.linear_model    import LogisticRegression
from sklearn.metrics         import roc_auc_score, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
from sklearn.preprocessing   import StandardScaler

from .dataset  import generate
from .features import FEATURE_NAMES, FEATURE_SCHEMA_VERSION

MODEL_VERSION = "baseline-lr-v1"


@dataclass
class BaselineBundle:
    scaler:   StandardScaler
    model:    LogisticRegression
    metadata: dict

    def predict_proba(self, x: np.ndarray) -> float:
        x = np.asarray(x, dtype=float).reshape(1, -1)
        xs = self.scaler.transform(x)
        return float(self.model.predict_proba(xs)[0, 1])


def train(seed: int = 42):
    X, y, _ = generate(seed=seed)
    X_tr, X_te, y_tr, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=seed)
    scaler = StandardScaler().fit(X_tr)
    Xs_tr  = scaler.transform(X_tr)
    Xs_te  = scaler.transform(X_te)
    clf = LogisticRegression(class_weight="balanced", max_iter=1000, random_state=seed).fit(Xs_tr, y_tr)

    proba_te = clf.predict_proba(Xs_te)[:, 1]
    pred_te  = (proba_te >= 0.5).astype(int)
    p, r, f1, _ = precision_recall_fscore_support(y_te, pred_te, average="binary", zero_division=0)
    auc = float(roc_auc_score(y_te, proba_te))

    metadata = {
        "modelVersion":         MODEL_VERSION,
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "features":             FEATURE_NAMES,
        "trainedAt":            int(time.time()),
        "seed":                 seed,
        "metrics": {"precision": float(p), "recall": float(r), "f1": float(f1), "roc_auc": auc},
    }
    return BaselineBundle(scaler=scaler, model=clf, metadata=metadata)


def save(bundle: BaselineBundle, models_dir: str):
    os.makedirs(models_dir, exist_ok=True)
    joblib.dump({"scaler": bundle.scaler, "model": bundle.model}, os.path.join(models_dir, "baseline.pkl"))
    with open(os.path.join(models_dir, "baseline.json"), "w") as f:
        json.dump(bundle.metadata, f, indent=2)


def load(models_dir: str) -> BaselineBundle | None:
    pkl  = os.path.join(models_dir, "baseline.pkl")
    meta = os.path.join(models_dir, "baseline.json")
    if not (os.path.exists(pkl) and os.path.exists(meta)):
        return None
    obj = joblib.load(pkl)
    with open(meta) as f:
        md = json.load(f)
    if md.get("featureSchemaVersion") != FEATURE_SCHEMA_VERSION:
        return None  # schema mismatch — force retrain
    return BaselineBundle(scaler=obj["scaler"], model=obj["model"], metadata=md)


def load_or_train(models_dir: str) -> BaselineBundle:
    b = load(models_dir)
    if b is not None:
        return b
    b = train()
    save(b, models_dir)
    return b

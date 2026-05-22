"""
Quantum classifier (Phase 4.2) — Variational Quantum Classifier.

Architecture:
  - PCA reduces the 7-dim feature vector to 4 features.
  - StandardScaler (post-PCA) keeps features in a small symmetric range so
    they can be encoded as rotation angles without saturating the feature map.
  - ZZFeatureMap(reps=1) for data encoding (4 qubits = 4 features).
  - RealAmplitudes(reps=1) variational ansatz.
  - COBYLA optimizer (default 60 iters) on a small stratified subset (300
    samples) — keeps offline training under a couple of minutes on CPU.

This is intentionally NOT production-grade: VQC inference per sample takes
~100 ms even on a simulator, which is fine for occasional scoring but would
swamp a real-time fraud pipeline.
"""
from __future__ import annotations
import json
import os
import time
from dataclasses import dataclass

import joblib
import numpy as np
from sklearn.decomposition   import PCA
from sklearn.metrics         import roc_auc_score, precision_recall_fscore_support
from sklearn.model_selection import train_test_split
from sklearn.preprocessing   import StandardScaler

from .dataset  import generate
from .features import FEATURE_NAMES, FEATURE_SCHEMA_VERSION

MODEL_VERSION  = "vqc-zz-realamp-v1"
QUBITS         = 8
TRAIN_SUBSET   = 8800        # stratified samples
COBYLA_MAXITER = 500


# ---------- core math (lazy-imported qiskit so unit tests stay light) ---------

def _build_vqc(seed: int):
    from qiskit_machine_learning.algorithms         import VQC
    try:
        from qiskit_machine_learning.optimizers    import COBYLA
    except ImportError:  # older 0.7.x layout
        from qiskit_algorithms.optimizers          import COBYLA
    from qiskit.circuit.library                    import ZZFeatureMap, RealAmplitudes
    
    # --- GPU Upgrade Modifications ---
    from qiskit_aer import AerSimulator
    from qiskit_aer.primitives import Sampler as AerSampler

    # 1. Instantiate the simulator explicitly targeting the GPU backend
    simulator = AerSimulator(method="statevector", device="GPU") [cite: 104, 107]

    backend = simulator.available_devices()
    print(f"[fraud-service] AerSimulator initialized with backend: {backend}")
    
    
    # 2. Add a diagnostic log so you can track successful setup in your docker logs
    try:
        devices = simulator.available_devices() [cite: 111]
        print(f"[fraud-service] Aer available devices: {devices}") [cite: 112]
    except Exception:
        print("[fraud-service] Could not query Aer devices.")

    # 3. Use AerSampler backed by the GPU simulator instead of the basic CPU Sampler()
    sampler = AerSampler(backend_options={}, transpile_options={}, run_options={}, bound_sampler=simulator)
    # ----------------------------------

    fmap   = ZZFeatureMap(feature_dimension=QUBITS, reps=1, entanglement="linear")
    ansatz = RealAmplitudes(num_qubits=QUBITS, reps=1)
    return VQC(
        sampler=sampler,
        feature_map=fmap,
        ansatz=ansatz,
        optimizer=COBYLA(maxiter=COBYLA_MAXITER),
        initial_point=np.random.default_rng(seed).normal(0, 0.1, size=ansatz.num_parameters),
    )


# ----------------------------- bundle wrapper --------------------------------

@dataclass
class VQCBundle:
    pca:        PCA
    scaler:     StandardScaler
    weights:    np.ndarray
    metadata:   dict
    _vqc:       object = None  # lazily reconstructed

    def _ensure(self):
        if self._vqc is None:
            self._vqc = _build_vqc(seed=self.metadata.get("seed", 42))
            # qiskit_machine_learning's VQC stores fitted params in `_fit_result`.
            # Rebuilding fresh + setting weights manually keeps inference reproducible.
            self._vqc._fit_result = None
            self._vqc._weights    = self.weights

    def predict_proba(self, x: np.ndarray) -> float:
        self._ensure()
        from qiskit_machine_learning.algorithms import VQC  # noqa
        x = np.asarray(x, dtype=float).reshape(1, -1)
        xp = self.pca.transform(x)
        xs = self.scaler.transform(xp)
        # Use the underlying neural-network classifier directly:
        nn = self._vqc.neural_network
        out = nn.forward(xs, self.weights)        # shape (1, 2) — class probs
        return float(np.asarray(out)[0, 1])


# --------------------------------- training ----------------------------------

def train(seed: int = 42) -> VQCBundle:
    X, y, _ = generate(seed=seed)
    X_tr_full, X_te, y_tr_full, y_te = train_test_split(X, y, test_size=0.2, stratify=y, random_state=seed)

    # 1) PCA  →  2) StandardScaler  (both fit on the FULL training split)
    pca    = PCA(n_components=QUBITS, random_state=seed).fit(X_tr_full)
    Xp_tr  = pca.transform(X_tr_full)
    scaler = StandardScaler().fit(Xp_tr)
    Xs_tr_full = scaler.transform(Xp_tr)

    # stratified subset to keep VQC training tractable
    Xs_sub, _, y_sub, _ = train_test_split(
        Xs_tr_full, y_tr_full,
        train_size=min(TRAIN_SUBSET, len(y_tr_full) - 1),
        stratify=y_tr_full, random_state=seed,
    )

    vqc = _build_vqc(seed=seed)
    vqc.fit(Xs_sub, y_sub)
    weights = np.asarray(vqc._fit_result.x if hasattr(vqc._fit_result, "x") else vqc._weights)

    # holdout metrics
    Xp_te  = pca.transform(X_te)
    Xs_te  = scaler.transform(Xp_te)
    proba_te = np.array([float(np.asarray(vqc.neural_network.forward(x.reshape(1, -1), weights))[0, 1]) for x in Xs_te])
    pred_te  = (proba_te >= 0.5).astype(int)
    p, r, f1, _ = precision_recall_fscore_support(y_te, pred_te, average="binary", zero_division=0)
    auc = float(roc_auc_score(y_te, proba_te))

    metadata = {
        "modelVersion":         MODEL_VERSION,
        "featureSchemaVersion": FEATURE_SCHEMA_VERSION,
        "features":             FEATURE_NAMES,
        "qubits":               QUBITS,
        "cobyla_maxiter":       COBYLA_MAXITER,
        "train_subset":         TRAIN_SUBSET,
        "trainedAt":            int(time.time()),
        "seed":                 seed,
        "metrics": {"precision": float(p), "recall": float(r), "f1": float(f1), "roc_auc": auc},
    }
    return VQCBundle(pca=pca, scaler=scaler, weights=weights, metadata=metadata)


# ------------------------------- persistence ---------------------------------

def save(bundle: VQCBundle, models_dir: str):
    os.makedirs(models_dir, exist_ok=True)
    joblib.dump({"pca": bundle.pca, "scaler": bundle.scaler}, os.path.join(models_dir, "vqc_pre.pkl"))
    np.savez(os.path.join(models_dir, "vqc.npz"), weights=bundle.weights)
    with open(os.path.join(models_dir, "vqc.json"), "w") as f:
        json.dump(bundle.metadata, f, indent=2)


def load(models_dir: str) -> VQCBundle | None:
    pre   = os.path.join(models_dir, "vqc_pre.pkl")
    npz   = os.path.join(models_dir, "vqc.npz")
    meta  = os.path.join(models_dir, "vqc.json")
    if not (os.path.exists(pre) and os.path.exists(npz) and os.path.exists(meta)):
        return None
    pp = joblib.load(pre)
    w  = np.load(npz)["weights"]
    with open(meta) as f:
        md = json.load(f)
    if md.get("featureSchemaVersion") != FEATURE_SCHEMA_VERSION:
        return None
    return VQCBundle(pca=pp["pca"], scaler=pp["scaler"], weights=w, metadata=md)


def load_or_train(models_dir: str) -> VQCBundle:
    b = load(models_dir)
    if b is not None:
        return b
    b = train()
    save(b, models_dir)
    return b

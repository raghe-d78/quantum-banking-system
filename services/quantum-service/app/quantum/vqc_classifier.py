"""Variational Quantum Classifier (VQC) for fraud detection.

Architecture
------------
The VQC follows the standard Qiskit Machine Learning pattern:

1. **Feature map** Φ(x): encodes classical feature vector *x* into a quantum
   state |Φ(x)⟩ using a ``ZZFeatureMap`` of depth 2.

2. **Ansatz** U(θ): a parameterised unitary ``RealAmplitudes`` circuit of
   depth 3 whose parameters θ are optimised during training.

3. **Prediction**: measure the expectation value of Z⊗n on the output state::

       ŷ = ⟨0ⁿ| U†(θ) Φ†(x) Z Φ(x) U(θ) |0ⁿ⟩

   which the VQC maps to a class label via softmax.

4. **Optimiser**: ``COBYLA`` (Constrained Optimisation BY Linear Approximations)
   — gradient-free, suitable for noisy simulators.

5. **Loss**: cross-entropy.

Model persistence
-----------------
On first call to :meth:`predict`, if no persisted model is found at
``VQC_MODEL_PATH``, a default model is trained on a small synthetic 2D dataset
so the service is always ready to answer.
"""
from __future__ import annotations

import logging
import os
import pickle
from typing import Any, Dict, List, Tuple

import numpy as np

logger = logging.getLogger(__name__)

VQC_MODEL_PATH = os.environ.get("VQC_MODEL_PATH", "app/models/vqc.pkl")
N_FEATURES = 2  # synthetic dataset uses 2 features


def _make_synthetic_data() -> Tuple[np.ndarray, np.ndarray]:
    """Return a tiny balanced synthetic classification dataset."""
    rng = np.random.default_rng(42)
    X0 = rng.normal(loc=[0.0, 0.0], scale=0.5, size=(20, N_FEATURES))
    X1 = rng.normal(loc=[1.5, 1.5], scale=0.5, size=(20, N_FEATURES))
    X = np.vstack([X0, X1])
    y = np.array([0] * 20 + [1] * 20)
    return X, y


class VQCClassifier:
    """Variational Quantum Classifier wrapping Qiskit Machine Learning VQC.

    The classifier lazily loads or trains a model on first use so that import
    time remains fast.
    """

    def __init__(self, model_path: str = VQC_MODEL_PATH) -> None:
        self._model_path = model_path
        self._vqc: Any = None
        self._n_features: int = N_FEATURES

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _build_vqc(self, num_features: int) -> Any:
        """Construct and return an untrained VQC instance."""
        try:
            from qiskit.circuit.library import RealAmplitudes, ZZFeatureMap
            from qiskit_algorithms.optimizers import COBYLA
            from qiskit_machine_learning.algorithms import VQC
            from qiskit_aer.primitives import Sampler as AerSampler

            feature_map = ZZFeatureMap(feature_dimension=num_features, reps=2)
            ansatz = RealAmplitudes(num_qubits=num_features, reps=3)
            sampler = AerSampler()
            vqc = VQC(
                sampler=sampler,
                feature_map=feature_map,
                ansatz=ansatz,
                optimizer=COBYLA(maxiter=100),
            )
            return vqc
        except ImportError as exc:
            logger.warning("qiskit-machine-learning not available (%s); using fallback.", exc)
            return None

    def _train_default(self) -> None:
        """Train on the built-in synthetic dataset and persist the model."""
        logger.info("Training VQC on synthetic dataset …")
        X, y = _make_synthetic_data()
        self.train(X.tolist(), y.tolist(), _persist=True)

    def _ensure_model(self) -> None:
        """Ensure a trained model is available, loading or training as needed."""
        if self._vqc is not None:
            return
        if os.path.exists(self._model_path):
            # Security note: only load from the configured safe path, not user-supplied input.
            # The model path is controlled by the VQC_MODEL_PATH env var (trusted config),
            # not from any HTTP request, so the attack surface is limited to the deployment
            # environment. For additional hardening, consider signed/encrypted model files.
            safe_path = os.path.realpath(self._model_path)
            allowed_dir = os.path.realpath(os.path.dirname(self._model_path) or ".")
            if not safe_path.startswith(allowed_dir):
                logger.error("Refusing to load model from unexpected path: %s", safe_path)
                self._train_default()
                return
            try:
                with open(safe_path, "rb") as fh:
                    self._vqc = pickle.load(fh)  # noqa: S301
                logger.info("VQC model loaded from %s", safe_path)
                return
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to load persisted VQC (%s); retraining.", exc)
        self._train_default()

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def train(
        self,
        X: List[List[float]],
        y: List[int],
        *,
        _persist: bool = False,
    ) -> float:
        """Train the VQC on *X* / *y* and return training accuracy.

        Args:
            X: Feature matrix.
            y: Integer class labels (0 or 1).
            _persist: Internal flag; saves model to disk when True.

        Returns:
            Training accuracy in [0, 1].
        """
        X_arr = np.array(X, dtype=float)
        y_arr = np.array(y, dtype=int)
        num_features = X_arr.shape[1]
        self._n_features = num_features

        vqc = self._build_vqc(num_features)

        if vqc is None:
            # Fallback: classical logistic regression as stub
            from sklearn.linear_model import LogisticRegression

            lr = LogisticRegression(max_iter=200)
            lr.fit(X_arr, y_arr)
            preds = lr.predict(X_arr)
            accuracy = float(np.mean(preds == y_arr))
            self._vqc = lr
        else:
            vqc.fit(X_arr, y_arr)
            preds = vqc.predict(X_arr)
            accuracy = float(np.mean(preds == y_arr))
            self._vqc = vqc

        if _persist:
            os.makedirs(os.path.dirname(self._model_path) or ".", exist_ok=True)
            with open(self._model_path, "wb") as fh:
                pickle.dump(self._vqc, fh)
            logger.info("VQC model persisted to %s", self._model_path)

        logger.info("VQC training complete. Accuracy=%.3f", accuracy)
        return accuracy

    def predict(self, features: List[float]) -> Tuple[int, float]:
        """Predict the fraud label for a single feature vector.

        Args:
            features: Feature values (length should match training data width).

        Returns:
            Tuple of (label, confidence) where label ∈ {0, 1} and
            confidence ∈ [0, 1].
        """
        self._ensure_model()

        X = np.array(features, dtype=float).reshape(1, -1)

        # Pad or truncate features to match trained model
        if X.shape[1] != self._n_features:
            X_adj = np.zeros((1, self._n_features))
            cols = min(X.shape[1], self._n_features)
            X_adj[0, :cols] = X[0, :cols]
            X = X_adj

        label = int(self._vqc.predict(X)[0])

        # Confidence proxy
        try:
            proba = self._vqc.predict_proba(X)[0]
            confidence = float(max(proba))
        except AttributeError:
            confidence = 0.75  # default when predict_proba not available

        return label, confidence

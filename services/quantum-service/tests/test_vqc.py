"""Smoke tests for the Variational Quantum Classifier."""
from __future__ import annotations

import numpy as np
from app.quantum.vqc_classifier import VQCClassifier, _make_synthetic_data


def test_train_and_predict():
    """Train on the synthetic dataset and assert accuracy ≥ 0.6."""
    clf = VQCClassifier()
    X, y = _make_synthetic_data()
    accuracy = clf.train(X.tolist(), y.tolist())
    assert accuracy >= 0.6, f"VQC accuracy too low: {accuracy:.3f}"


def test_predict_returns_label_and_confidence():
    clf = VQCClassifier()
    X, y = _make_synthetic_data()
    clf.train(X.tolist(), y.tolist())
    label, confidence = clf.predict([0.0, 0.0])
    assert label in (0, 1)
    assert 0.0 <= confidence <= 1.0

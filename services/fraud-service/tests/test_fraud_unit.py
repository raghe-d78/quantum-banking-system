"""
Light unit tests for fraud-service feature/risk math.
Run with:  python -m pytest services/fraud-service/tests -q
"""
import math
import os
import sys

# allow `from src...` when run from the repo root or service root
HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..")))

from src.features import vectorize, FEATURE_DIM, FEATURE_NAMES
from src.risk     import risk_level, decide


def test_vectorize_shape():
    v = vectorize(amount=100.0, ts="2024-01-15T10:30:00Z",
                  rolling_count=2, rolling_sum=200)
    assert v.shape == (FEATURE_DIM,)
    assert len(FEATURE_NAMES) == FEATURE_DIM


def test_vectorize_log_amount():
    v = vectorize(amount=0.0, ts="2024-01-15T10:30:00Z",
                  rolling_count=0, rolling_sum=0)
    assert v[0] == 0.0  # log1p(0)


def test_risk_level_thresholds():
    assert risk_level(0.10) == "Low"
    assert risk_level(0.30) == "Medium"
    assert risk_level(0.60) == "High"
    assert risk_level(0.95) == "Critical"
    assert risk_level(1.50) == "Critical"   # clamped


def test_decide_uses_max():
    v = decide(0.10, 0.80, "lr-v1", "vqc-v1")
    assert v.decision_score == 0.80
    assert v.risk == "Critical"
    assert v.classical_model == "lr-v1"
    assert v.quantum_model == "vqc-v1"


def test_event_payload_shape():
    v = decide(0.10, 0.80, "lr-v1", "vqc-v1")
    e = v.to_event("tx1", "acc1", "2024-01-01T00:00:00Z", "v1")
    assert e["transactionId"] == "tx1"
    assert e["riskLevel"] == "Critical"
    assert e["decisionPolicy"] == "max(classical, quantum)"
    assert e["classical"]["modelVersion"] == "lr-v1"
    assert e["quantum"]["score"] == 0.80

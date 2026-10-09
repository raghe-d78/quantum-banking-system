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

from src.features import vectorize, vectorize_tx, cv_vector, FEATURE_DIM, FEATURE_NAMES, TX_DIM, CV_FEATURE_NAMES, CV_NEUTRAL
from src.risk     import risk_level, decide


def test_vectorize_shape():
    v = vectorize(amount=100.0, ts="2024-01-15T10:30:00Z",
                  rolling_count=2, rolling_sum=200)
    assert v.shape == (FEATURE_DIM,)
    assert len(FEATURE_NAMES) == FEATURE_DIM


def test_v2_vector_with_and_without_document():
    base = vectorize(amount=100.0, ts="2024-01-15T10:30:00Z", rolling_count=2, rolling_sum=200)
    assert base.shape == (FEATURE_DIM,) and FEATURE_DIM == TX_DIM + 1 + len(CV_FEATURE_NAMES) == 17
    assert base[TX_DIM] == 0.0                      # has_document
    assert base[TX_DIM + 1 + CV_FEATURE_NAMES.index("amount_match")] == CV_NEUTRAL["amount_match"]
    doc = {"tampering_score": 0.8, "amount_match": 0.0, "duplicate_score": 1.0}
    v = vectorize(amount=100.0, ts="2024-01-15T10:30:00Z", rolling_count=2, rolling_sum=200, cv=doc)
    assert v[TX_DIM] == 1.0
    assert v[TX_DIM + 1 + CV_FEATURE_NAMES.index("tampering_score")] == 0.8
    assert v[TX_DIM + 1 + CV_FEATURE_NAMES.index("ocr_confidence")] == CV_NEUTRAL["ocr_confidence"]  # missing keys → neutral
    assert (vectorize_tx(100.0, "2024-01-15T10:30:00Z", 2, 200) == base[:TX_DIM]).all()
    assert cv_vector(None).shape == (10,)


def test_dataset_v2_shape_and_document_rate():
    from src.dataset import generate
    X, y, names = generate(n_normal=400, n_fraud=100, seed=1)
    assert X.shape == (500, FEATURE_DIM) and names == FEATURE_NAMES
    has = X[:, TX_DIM]
    assert 0.2 < has[y == 0].mean() < 0.5 and 0.4 < has[y == 1].mean() < 0.7
    tamper = X[:, TX_DIM + 1 + CV_FEATURE_NAMES.index("tampering_score")]
    assert tamper[(y == 1) & (has == 1)].mean() > tamper[(y == 0) & (has == 1)].mean()


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


def test_decide_blends_scores():
    from src.risk import QUANTUM_WEIGHT, blend
    v = decide(0.10, 0.80, "lr-v1", "vqc-v1")
    assert v.decision_score == blend(0.10, 0.80)
    assert abs(v.decision_score - ((1 - QUANTUM_WEIGHT) * 0.10 + QUANTUM_WEIGHT * 0.80)) < 1e-9
    assert v.classical_model == "lr-v1"
    assert v.quantum_model == "vqc-v1"


def test_uninformative_quantum_does_not_flag_benign_traffic():
    # VQC ≈ 0.5 on everything (AUC≈0.5) must not turn a clean classical verdict into an alert
    assert decide(0.02, 0.50, "lr", "vqc").risk == "Low"
    # …but a confident classical verdict is still escalated
    assert decide(0.95, 0.50, "lr", "vqc").risk in ("High", "Critical")
    # …and a confident quantum verdict lifts a borderline classical one
    assert decide(0.40, 0.95, "lr", "vqc").risk == "High"


def test_event_payload_shape():
    v = decide(0.10, 0.80, "lr-v1", "vqc-v1")
    e = v.to_event("tx1", "acc1", "2024-01-01T00:00:00Z", "v1")
    assert e["transactionId"] == "tx1"
    assert e["riskLevel"] == "Medium"
    assert e["decisionPolicy"].startswith("blend(")
    assert e["classical"]["modelVersion"] == "lr-v1"
    assert e["quantum"]["score"] == 0.80

"""
Risk thresholds + decision policy (Phase 4.2, revised Phase 6).

Decision policy: a WEIGHTED ENSEMBLE of the classical and quantum scores,
    decision = (1 - w) * classical + w * quantum,   w = FRAUD_QUANTUM_WEIGHT (default 0.3)

Why not max(): the comparative analysis shows the current 4-qubit VQC has
ROC-AUC ≈ 0.5, i.e. it outputs ≈ 0.5 for almost everything. With max() every
transaction became "High" and the alert feed was pure noise. Blending keeps
the quantum signal in the loop (and lets a confident quantum verdict raise a
borderline classical one) without letting an uninformative model dominate.
Raise the weight as the VQC improves; set it to 1.0 to go quantum-only.
Both raw scores are still recorded on every `transaction.scored` event.
"""
from __future__ import annotations
import os
from dataclasses import dataclass

QUANTUM_WEIGHT = min(1.0, max(0.0, float(os.environ.get("FRAUD_QUANTUM_WEIGHT", "0.3"))))
DECISION_POLICY = f"blend(classical*{1 - QUANTUM_WEIGHT:.2f} + quantum*{QUANTUM_WEIGHT:.2f})"

THRESHOLDS = [
    (0.25, "Low"),
    (0.50, "Medium"),
    (0.75, "High"),
    (1.01, "Critical"),
]


def risk_level(score: float) -> str:
    s = max(0.0, min(1.0, float(score)))
    for upper, label in THRESHOLDS:
        if s < upper:
            return label
    return "Critical"


@dataclass
class Verdict:
    classical_score: float
    quantum_score:   float
    decision_score:  float
    risk:            str
    classical_model: str
    quantum_model:   str

    def to_event(self, transaction_id: str, account_id: str, scored_at: str,
                 schema_version: str) -> dict:
        return {
            "schemaVersion":   1,
            "transactionId":   transaction_id,
            "accountId":       account_id,
            "scoredAt":        scored_at,
            "featureSchemaVersion": schema_version,
            "classical": {"score": self.classical_score, "modelVersion": self.classical_model},
            "quantum":   {"score": self.quantum_score,   "modelVersion": self.quantum_model},
            "decisionScore":  self.decision_score,
            "decisionPolicy": DECISION_POLICY,
            "riskLevel":      self.risk,
        }


def blend(classical: float, quantum: float, weight: float = QUANTUM_WEIGHT) -> float:
    c = max(0.0, min(1.0, float(classical)))
    q = max(0.0, min(1.0, float(quantum)))
    return round((1.0 - weight) * c + weight * q, 6)


def decide(classical: float, quantum: float, classical_model: str, quantum_model: str) -> Verdict:
    decision = blend(classical, quantum)
    return Verdict(
        classical_score=float(classical),
        quantum_score=float(quantum),
        decision_score=decision,
        risk=risk_level(decision),
        classical_model=classical_model,
        quantum_model=quantum_model,
    )

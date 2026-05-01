"""
Risk thresholds + decision policy (Phase 4.2).

Decision policy: the FINAL risk level is taken from the higher of the
classical and quantum scores. Recording both raw scores in the
`transaction.scored` event lets analysts compare models post-hoc.
"""
from __future__ import annotations
from dataclasses import dataclass

DECISION_POLICY = "max(classical, quantum)"

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


def decide(classical: float, quantum: float, classical_model: str, quantum_model: str) -> Verdict:
    decision = max(float(classical), float(quantum))
    return Verdict(
        classical_score=float(classical),
        quantum_score=float(quantum),
        decision_score=decision,
        risk=risk_level(decision),
        classical_model=classical_model,
        quantum_model=quantum_model,
    )

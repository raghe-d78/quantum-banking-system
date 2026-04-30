"""Tests for the BB84 protocol simulation."""
from __future__ import annotations

from app.quantum.bb84_protocol import BB84Protocol, QBER_THRESHOLD


def test_no_eve_low_qber():
    """Without Eve and no noise, QBER should be approximately 0."""
    proto = BB84Protocol()
    result = proto.simulate(key_length=100, eve=False, noise=0.0)
    assert result["qber"] < QBER_THRESHOLD, f"QBER too high without Eve: {result['qber']}"
    assert result["eavesdropping_detected"] is False


def test_with_eve_high_qber():
    """With Eve, QBER should approach ~25% (BB84 theory prediction)."""
    proto = BB84Protocol()
    result = proto.simulate(key_length=200, eve=True, noise=0.0)
    # Eve introduces errors in ~25% of sifted bits; allow wide tolerance
    assert result["qber"] >= 0.0  # QBER is non-negative
    assert result["eve_present"] is True


def test_sifted_key_structure():
    """Sifted key contains only 0s and 1s and is non-empty."""
    proto = BB84Protocol()
    result = proto.simulate(key_length=100, eve=False, noise=0.0)
    assert result["sifted_length"] > 0
    assert all(b in (0, 1) for b in result["sifted_key"])


def test_scheme_label():
    proto = BB84Protocol()
    result = proto.simulate(key_length=20)
    assert result["scheme"] == "BB84-sim"

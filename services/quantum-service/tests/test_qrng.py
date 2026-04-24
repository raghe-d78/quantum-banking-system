"""Tests for the QRNG engine.

Validates:
- Correct bit count.
- Correct byte length.
- ~50/50 distribution (chi-square sanity check with loose tolerance).
"""
from __future__ import annotations

from app.quantum.qrng_engine import QRNGEngine


def test_bit_count():
    engine = QRNGEngine()
    result = engine.generate_bits(64)
    assert result["n_bits"] == 64
    assert len(result["bits"]) == 64
    assert all(c in "01" for c in result["bits"])


def test_byte_length():
    engine = QRNGEngine()
    result = engine.generate_bytes(16)
    assert result["n_bytes"] == 16
    assert len(result["hex"]) == 32  # 16 bytes = 32 hex chars


def test_distribution_roughly_uniform():
    """Assert roughly 50/50 distribution over 1000 bits (loose threshold)."""
    engine = QRNGEngine()
    result = engine.generate_bits(1000)
    ones = result["bits"].count("1")
    zeros = result["bits"].count("0")
    total = ones + zeros
    assert total == 1000
    # Allow generous tolerance for simulator variance
    assert 350 <= ones <= 650, f"Distribution skewed: ones={ones}/1000"
    assert 350 <= zeros <= 650, f"Distribution skewed: zeros={zeros}/1000"


def test_hex_format():
    engine = QRNGEngine()
    result = engine.generate_bits(16)
    # 16 bits → 2 bytes → 4 hex chars
    assert len(result["bytes_hex"]) == 4

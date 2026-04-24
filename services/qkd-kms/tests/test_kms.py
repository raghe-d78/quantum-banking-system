"""Tests for the QKD-KMS service."""
from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_health():
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "qkd-kms running"


def test_create_session():
    response = client.post("/kms/session/new", json={"peer": "api-gateway"})
    assert response.status_code == 200
    data = response.json()
    assert "key_id" in data
    assert "key_b64" in data
    assert data["scheme"] == "BB84-sim"
    assert 0.0 <= data["qber"] <= 1.0


def test_get_session():
    # Create a session first
    create_resp = client.post("/kms/session/new", json={"peer": "test-peer"})
    key_id = create_resp.json()["key_id"]

    # Retrieve it
    get_resp = client.get(f"/kms/session/{key_id}")
    assert get_resp.status_code == 200
    data = get_resp.json()
    assert data["key_id"] == key_id
    assert data["peer"] == "test-peer"
    assert "caveat" in data


def test_get_nonexistent_session():
    response = client.get("/kms/session/nonexistent-key-id")
    assert response.status_code == 404


def test_key_is_256_bits():
    import base64

    response = client.post("/kms/session/new", json={"peer": "test"})
    key_b64 = response.json()["key_b64"]
    key_bytes = base64.b64decode(key_b64)
    assert len(key_bytes) == 32  # 256 bits = 32 bytes

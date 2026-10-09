"""Auth decorator tests — exercised on a tiny Flask app so the heavy model
bootstrap in src.app is not imported."""
import os
import sys
import time

import jwt
import pytest
from flask import Flask, jsonify

HERE = os.path.dirname(__file__)
sys.path.insert(0, os.path.abspath(os.path.join(HERE, "..")))

from src.auth import JWT_SECRET, require_staff, require_admin  # noqa: E402


@pytest.fixture()
def client():
    app = Flask("t")

    @app.get("/staff")
    @require_staff
    def staff():
        return jsonify(ok=True)

    @app.get("/admin")
    @require_admin
    def admin():
        return jsonify(ok=True)

    return app.test_client()


def tok(role, secret=JWT_SECRET, exp=None):
    payload = {"userId": "u1", "role": role}
    if exp is not None:
        payload["exp"] = exp
    return jwt.encode(payload, secret, algorithm="HS256")


def test_missing_token_401(client):
    assert client.get("/staff").status_code == 401


def test_bad_signature_401(client):
    r = client.get("/staff", headers={"Authorization": f"Bearer {tok('admin', secret='wrong')}"})
    assert r.status_code == 401


def test_expired_401(client):
    r = client.get("/staff", headers={"Authorization": f"Bearer {tok('admin', exp=int(time.time()) - 10)}"})
    assert r.status_code == 401


def test_customer_403(client):
    r = client.get("/staff", headers={"Authorization": f"Bearer {tok('customer')}"})
    assert r.status_code == 403
    assert r.get_json()["code"] == "FORBIDDEN"


def test_employee_ok_on_staff_but_not_admin(client):
    h = {"Authorization": f"Bearer {tok('employee')}"}
    assert client.get("/staff", headers=h).status_code == 200
    assert client.get("/admin", headers=h).status_code == 403


def test_admin_ok(client):
    h = {"Authorization": f"Bearer {tok('admin')}"}
    assert client.get("/admin", headers=h).status_code == 200


def test_unknown_role_401(client):
    r = client.get("/staff", headers={"Authorization": f"Bearer {tok('root')}"})
    assert r.status_code == 401

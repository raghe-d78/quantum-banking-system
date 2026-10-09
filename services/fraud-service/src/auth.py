"""
JWT verification + RBAC for fraud-service (Phase 6).

Access tokens are HS256 JWTs minted by identity-service with JWT_SECRET; the
gateway already verifies them, this is defence in depth for direct calls.
"""
from __future__ import annotations
import functools
import os

import jwt
from flask import g, jsonify, request

JWT_SECRET = os.environ.get("JWT_SECRET", "supersecret_change_in_prod")
STAFF_ROLES = {"admin", "employee"}
ALL_ROLES = STAFF_ROLES | {"customer"}


def _bearer() -> str | None:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        return None
    return header[7:].strip() or None


def decode(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


def require_role(*roles: str):
    allowed = set(roles)

    def deco(fn):
        @functools.wraps(fn)
        def wrapper(*a, **kw):
            token = _bearer()
            if not token:
                return jsonify(ok=False, code="UNAUTHORIZED", message="Missing or invalid token"), 401
            try:
                payload = decode(token)
            except jwt.PyJWTError:
                return jsonify(ok=False, code="UNAUTHORIZED", message="Token expired or invalid"), 401
            role = payload.get("role")
            if not payload.get("userId") or role not in ALL_ROLES:
                return jsonify(ok=False, code="UNAUTHORIZED", message="Token expired or invalid"), 401
            if role not in allowed:
                return jsonify(ok=False, code="FORBIDDEN", message="Staff access required"), 403
            g.user = payload
            return fn(*a, **kw)
        return wrapper
    return deco


require_staff = require_role(*STAFF_ROLES)
require_admin = require_role("admin")

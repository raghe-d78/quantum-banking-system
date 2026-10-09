"""JWT verification for FastAPI (same contract as shared/auth.js and fraud-service/auth.py)."""
from __future__ import annotations
import jwt
from fastapi import Depends, HTTPException, Request
from .config import JWT_SECRET

STAFF_ROLES = {"admin", "employee"}
ALL_ROLES = STAFF_ROLES | {"customer"}


def current_user(request: Request) -> dict:
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(401, {"ok": False, "code": "UNAUTHORIZED", "message": "Missing or invalid token"})
    try:
        payload = jwt.decode(header[7:].strip(), JWT_SECRET, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(401, {"ok": False, "code": "UNAUTHORIZED", "message": "Token expired or invalid"})
    if not payload.get("userId") or payload.get("role") not in ALL_ROLES:
        raise HTTPException(401, {"ok": False, "code": "UNAUTHORIZED", "message": "Token expired or invalid"})
    return payload


def staff_user(user: dict = Depends(current_user)) -> dict:
    if user["role"] not in STAFF_ROLES:
        raise HTTPException(403, {"ok": False, "code": "FORBIDDEN", "message": "Staff access required"})
    return user


def is_staff(user: dict) -> bool:
    return user.get("role") in STAFF_ROLES

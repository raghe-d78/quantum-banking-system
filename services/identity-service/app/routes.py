from fastapi import APIRouter
from .models import User

router = APIRouter()

users = []

@router.post("/register")
def register(user: User):

    users.append(user)

    return {
        "message": "User registered",
        "email": user.email
    }
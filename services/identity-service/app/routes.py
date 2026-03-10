from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class UserRegistration(BaseModel):
    email: str
    password: str

@router.post("/register")
def register(user: UserRegistration):
    return {
        "message": "User registered",
        "email": user.email
    }
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

class Account(BaseModel):
    user_id: str
    balance: float

@router.post("/accounts")
def create_account(account: Account):
    return {
        "message": "Account created",
        "user_id": account.user_id
    }
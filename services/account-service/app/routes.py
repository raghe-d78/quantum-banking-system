
from fastapi import HTTPException
from fastapi import APIRouter, status
from .models import Account
ALLOWED_ACCOUNT_TYPES = ["checking", "savings"]
router = APIRouter() 
accounts = []
@router.post("/accounts", status_code=201)
def create_account(account: Account):
    if account.balance < 0:
        raise HTTPException(status_code=422, detail="Balance cannot be negative")
    if account.account_type not in ALLOWED_ACCOUNT_TYPES:
        raise HTTPException(status_code=422, detail="Invalid account type")
    accounts.append(account.model_dump())
    return {
        "user_id": account.user_id,
        "account_type": account.account_type,
        "balance": account.balance
    }
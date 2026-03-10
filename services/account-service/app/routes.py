from fastapi import APIRouter
from .models import Account

router = APIRouter()

accounts = []

@router.post("/accounts")
def create_account(account: Account):

    accounts.append(account)

    return {
        "message": "Account created",
        "owner": account.owner
    }
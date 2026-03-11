from pydantic import BaseModel

class Account(BaseModel):
    user_id: int
    account_type: str
    balance: float
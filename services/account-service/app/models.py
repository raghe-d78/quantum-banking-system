from pydantic import BaseModel


class Account(BaseModel):

    owner: str
    currency: str
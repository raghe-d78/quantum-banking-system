from fastapi import APIRouter, status, HTTPException
from .models import UserCreate

router = APIRouter()
fake_db = []

@router.post("/register", status_code=status.HTTP_201_CREATED)
def register_user(user: UserCreate):
    # Vérifie si l'email existe déjà
    if any(u["email"] == user.email for u in fake_db):
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Ajoute à la "DB"
    fake_db.append(user.model_dump())
    
    # Retourne uniquement ce que le test attend
    return {"username": user.username, "email": user.email}
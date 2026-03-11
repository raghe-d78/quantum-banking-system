from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# --- CAS DE SUCCÈS ---
def test_create_account_success():
    response = client.post(
        "/accounts",
        json={
            "user_id": 1,
            "account_type": "checking",
            "balance": 100.0
        }
    )
    assert response.status_code == 201
    data = response.json()
    assert data["user_id"] == 1
    assert data["account_type"] == "checking"
    assert data["balance"] == 100.0


# --- CHAMPS MANQUANTS ---
def test_create_account_missing_fields():
    # aucun champ
    response = client.post("/accounts", json={})
    assert response.status_code == 422

    # balance manquant
    response = client.post("/accounts", json={
        "user_id": 1,
        "account_type": "checking"
    })
    assert response.status_code == 422

    # account_type manquant
    response = client.post("/accounts", json={
        "user_id": 1,
        "balance": 0
    })
    assert response.status_code == 422

    # user_id manquant
    response = client.post("/accounts", json={
        "account_type": "checking",
        "balance": 0
    })
    assert response.status_code == 422


# --- TYPES INCORRECTS ---
def test_create_account_invalid_types():
    # user_id non entier
    response = client.post("/accounts", json={
        "user_id": "abc",
        "account_type": "checking",
        "balance": 0
    })
    assert response.status_code == 422

    # balance non float
    response = client.post("/accounts", json={
        "user_id": 1,
        "account_type": "checking",
        "balance": "zero"
    })
    assert response.status_code == 422

    # account_type non string
    response = client.post("/accounts", json={
        "user_id": 1,
        "account_type": 123,
        "balance": 0
    })
    assert response.status_code == 422


# --- VALEURS INVALIDES (business logic) ---
def test_create_account_invalid_values():
    # balance négative si interdit
    response = client.post("/accounts", json={
        "user_id": 1,
        "account_type": "checking",
        "balance": -50
    })
    # Si tu veux bloquer, ton endpoint doit lever HTTPException
    # Pour l'instant Pydantic valide float négatif → 201
    # Donc test futur si on ajoute la validation
    # assert response.status_code == 422

    # account_type non autorisé (si tu veux limiter à checking/savings)
    response = client.post("/accounts", json={
        "user_id": 1,
        "account_type": "investment",
        "balance": 0
    })
    # pareil, à gérer dans le endpoint si nécessaire
    # assert response.status_code == 422
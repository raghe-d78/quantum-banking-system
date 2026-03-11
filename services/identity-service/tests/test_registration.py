from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

# --- CAS DE SUCCÈS ---
def test_user_registration_success():
    response = client.post("/register", json={
        "username": "testuser",
        "email": "test@test.com",
        "password": "secure123"
    })
    assert response.status_code == 201
    data = response.json()
    assert data["username"] == "testuser"
    assert data["email"] == "test@test.com"

# --- CHAMPS MANQUANTS ---
def test_registration_missing_fields():
    # Aucun champ
    response = client.post("/register", json={})
    assert response.status_code == 422

    # Mot de passe manquant
    response = client.post("/register", json={
        "username": "user",
        "email": "a@b.com"
    })
    assert response.status_code == 422

    # Email manquant
    response = client.post("/register", json={
        "username": "user",
        "password": "123456"
    })
    assert response.status_code == 422

    # Username manquant
    response = client.post("/register", json={
        "email": "a@b.com",
        "password": "123456"
    })
    assert response.status_code == 422

# --- VALEURS INVALIDES ---
def test_registration_invalid_values():
    # Username trop court
    response = client.post("/register", json={
        "username": "ab",
        "email": "test2@test.com",
        "password": "123456"
    })
    assert response.status_code == 422

    # Password trop court
    response = client.post("/register", json={
        "username": "user2",
        "email": "test3@test.com",
        "password": "123"
    })
    assert response.status_code == 422

    # Email invalide
    response = client.post("/register", json={
        "username": "user3",
        "email": "invalid-email",
        "password": "123456"
    })
    assert response.status_code == 422

# --- CAS D’ÉCHEC BUSINESS ---
def test_registration_duplicate_email():
    # Premier utilisateur
    response1 = client.post("/register", json={
        "username": "userdup",
        "email": "dup@test.com",
        "password": "123456"
    })
    assert response1.status_code == 201

    # Deuxième utilisateur avec même email
    response2 = client.post("/register", json={
        "username": "userdup2",
        "email": "dup@test.com",
        "password": "abcdef"
    })
    assert response2.status_code == 400
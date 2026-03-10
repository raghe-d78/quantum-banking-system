from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_user_registration():

    response = client.post(
        "/register",
        json={
            "email": "user@test.com",
            "password": "securepassword"
        }
    )

    assert response.status_code == 200
    assert response.json()["email"] == "user@test.com"
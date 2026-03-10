from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_user_registration():

    response = client.post(
        "/register",
        json={
            "email": "test@test.com",
            "password": "123456"
        }
    )

    assert response.status_code == 200
    assert response.json()["email"] == "test@test.com"
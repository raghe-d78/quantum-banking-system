from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def test_create_account():

    response = client.post(
        "/accounts",
        json={
            "user_id": "123",
            "balance": 0
        }
    )

    assert response.status_code == 200
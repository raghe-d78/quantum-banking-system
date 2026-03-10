from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_create_account():

    response = client.post(
        "/accounts",
        json={
            "owner": "user1",
            "currency": "USD"
        }
    )

    assert response.status_code == 200
    assert response.json()["owner"] == "user1"
import os
import uuid

import pytest
from fastapi.testclient import TestClient

os.environ["DATABASE_URL"] = (
    f"sqlite+aiosqlite:////private/tmp/momentum-test-{uuid.uuid4().hex}.sqlite3"
)
os.environ["DEMO_MODE"] = "true"

from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def authenticated_client(client):
    response = client.post(
        "/api/auth/login", json={"username": "demo", "password": "Momentum123!"}
    )
    assert response.status_code == 200
    return client

import pytest
from fastapi.testclient import TestClient
from src.main import app


@pytest.fixture(scope="module")
def client():
    # Use TestClient for synchronous testing of async endpoints (FastAPI handles this magic)
    with TestClient(app) as c:
        yield c

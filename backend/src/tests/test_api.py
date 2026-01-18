from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from src.core.config import set_global_api_key

# --- Health Check Tests ---


def test_health_check(client):
    """Test the health check endpoint returns 200 and correct status."""
    response = client.get("/health")
    assert response.status_code == 200
    expected_keys = {"status", "openai_api_key_configured"}
    assert expected_keys.issubset(response.json().keys())
    assert response.json()["status"] == "ok"


# --- Config API Key Tests ---


@patch("src.api.endpoints.AsyncOpenAI")
def test_set_valid_api_key(mock_async_openai, client):
    """Test setting a valid API key."""
    # Mock the AsyncOpenAI instance and its methods
    mock_client_instance = AsyncMock()
    mock_async_openai.return_value = mock_client_instance
    # Mock models.list to succeed (no exception raised)
    mock_client_instance.models.list.return_value = {"data": []}

    payload = {"api_key": "sk-test-valid-key"}
    response = client.post("/config/api-key", json=payload)

    assert response.status_code == 200
    assert response.json()["status"] == "success"

    # Verify global state was updated (reset allowed implicitly here, but good to check)
    from src.core.config import get_global_api_key

    assert get_global_api_key() == "sk-test-valid-key"


@patch("src.api.endpoints.AsyncOpenAI")
def test_set_invalid_api_key(mock_async_openai, client):
    """Test setting an invalid API key."""
    mock_client_instance = AsyncMock()
    mock_async_openai.return_value = mock_client_instance
    # Mock models.list to raise an exception
    mock_client_instance.models.list.side_effect = Exception("Invalid key")

    payload = {"api_key": "sk-test-invalid-key"}
    response = client.post("/config/api-key", json=payload)

    assert response.status_code == 401
    assert "Invalid OpenAI API key" in response.json()["detail"]


# --- Move Endpoint Tests ---


@pytest.fixture
def authorized_client(client):
    """Fixture to ensure a key is set before move tests."""
    set_global_api_key("sk-test-key-for-moves")
    yield client
    set_global_api_key(None)  # Teardown


def test_move_invalid_fen(authorized_client):
    """Test requesting a move with an invalid FEN string."""
    payload = {"fen": "invalid-fen-string"}
    response = authorized_client.post("/move", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid FEN string"


def test_move_game_over(authorized_client):
    """Test requesting a move when the game is already over (Checkmate)."""
    # Fool's Mate FEN (White checkmated)
    fools_mate_fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
    payload = {"fen": fools_mate_fen}
    response = authorized_client.post("/move", json=payload)
    assert response.status_code == 400
    assert response.json()["detail"] == "Game is over"


def test_move_no_api_key(client):
    """Test requesting a move without configuring API key first."""
    set_global_api_key(None)
    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    payload = {"fen": start_fen}
    response = client.post("/move", json=payload)
    assert response.status_code == 412
    assert "OpenAI API key is missing" in response.json()["detail"]


@patch("src.api.endpoints.get_langchain_client")
@patch("src.api.endpoints.get_global_api_key")
@pytest.mark.asyncio
async def test_move_valid_fen(mock_get_key, mock_get_langchain, client):
    """Test a valid move request with mocked LangChain response."""
    # Setup mocks
    mock_get_key.return_value = "sk-mock-key"
    mock_llm = MagicMock()
    mock_structured_llm = MagicMock()
    mock_get_langchain.return_value = mock_llm
    mock_llm.with_structured_output.return_value = mock_structured_llm

    # Create dummy move data
    class MoveSelectionMock:
        def __init__(self, move_val, reasoning):
            # Inner enum-like object with a 'value' field.
            class MoveVal:
                def __init__(self, v):
                    self.value = v

            self.move = MoveVal(move_val)
            self.reasoning = reasoning

    mock_response = MoveSelectionMock("e2e4", "Best opening move.")

    # Mock ainvoke to return our mock response
    mock_structured_llm.ainvoke = AsyncMock(return_value=mock_response)

    # Starting position FEN
    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    payload = {"fen": start_fen}

    # Use TestClient (synchronous) wrapper
    response = client.post("/move", json=payload)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["move"] == "e2e4"
    assert data["san"] == "e4"


@patch("src.api.endpoints.get_langchain_client")
@patch("src.api.endpoints.get_global_api_key")
@pytest.mark.asyncio
async def test_move_rate_limit_error(mock_get_key, mock_get_langchain, client):
    """Test handling of OpenAI RateLimitError."""
    from openai import RateLimitError

    mock_get_key.return_value = "sk-mock-key"
    mock_llm = MagicMock()
    mock_structured_llm = MagicMock()
    mock_get_langchain.return_value = mock_llm
    mock_llm.with_structured_output.return_value = mock_structured_llm

    # Create a dummy response that mimics the OpenAI error structure if needed,
    # but for raising the exception, we just need to instantiate it.
    # RateLimitError requires 'message', 'response', and 'body' in recent versions usually,
    # or at least we need to be careful how we construct it if strict.
    # However, standard mocking often allows simpler instantiation or just matching the type.
    # Let's try to mock the side_effect.

    # Note: Constructing RateLimitError might require arguments.
    # Using a simple mock side_effect that is an instance of the class is safer.
    err = RateLimitError(message="Rate limit exceeded", response=MagicMock(), body=None)
    mock_structured_llm.ainvoke = AsyncMock(side_effect=err)

    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    payload = {"fen": start_fen}
    response = client.post("/move", json=payload)

    assert response.status_code == 429
    assert "OpenAI API quota exceeded" in response.json()["detail"]


@patch("src.api.endpoints.get_langchain_client")
@patch("src.api.endpoints.get_global_api_key")
@pytest.mark.asyncio
async def test_move_auth_error(mock_get_key, mock_get_langchain, client):
    """Test handling of OpenAI AuthenticationError."""
    from openai import AuthenticationError

    mock_get_key.return_value = "sk-mock-key"
    mock_llm = MagicMock()
    mock_structured_llm = MagicMock()
    mock_get_langchain.return_value = mock_llm
    mock_llm.with_structured_output.return_value = mock_structured_llm

    err = AuthenticationError(message="Invalid key", response=MagicMock(), body=None)
    mock_structured_llm.ainvoke = AsyncMock(side_effect=err)

    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    payload = {"fen": start_fen}
    response = client.post("/move", json=payload)

    assert response.status_code == 401
    assert "OpenAI API key is invalid" in response.json()["detail"]

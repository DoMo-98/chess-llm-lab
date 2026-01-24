from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# --- Health Check Tests ---


def test_health_check(client):
    """Test the health check endpoint returns 200 and correct status."""
    response = client.get("/health")
    assert response.status_code == 200
    expected_keys = {"status", "openai_api_key_configured"}
    assert expected_keys.issubset(response.json().keys())
    assert response.json()["status"] == "ok"
    # Without header, it should report not configured
    assert response.json()["openai_api_key_configured"] is False


def test_health_check_with_header(client):
    """Test health check reports configured when header is present."""
    response = client.get("/health", headers={"X-OpenAI-Key": "sk-test"})
    assert response.json()["openai_api_key_configured"] is True


# --- Config API Key Tests ---


@patch("src.api.endpoints.AsyncOpenAI")
def test_validate_api_key_success(mock_async_openai, client):
    """Test validating a valid API key via header."""
    mock_client_instance = AsyncMock()
    mock_async_openai.return_value = mock_client_instance
    mock_client_instance.models.list.return_value = {"data": []}

    # Endpoint now expects key in header, payload can be empty or ignored
    headers = {"X-OpenAI-Key": "sk-test-valid-key"}
    response = client.post("/config/api-key", json={}, headers=headers)

    assert response.status_code == 200
    assert response.json()["status"] == "success"


@patch("src.api.endpoints.AsyncOpenAI")
def test_validate_api_key_invalid(mock_async_openai, client):
    """Test validating an invalid API key."""
    mock_client_instance = AsyncMock()
    mock_async_openai.return_value = mock_client_instance
    mock_client_instance.models.list.side_effect = Exception("Invalid key")

    headers = {"X-OpenAI-Key": "sk-test-invalid-key"}
    response = client.post("/config/api-key", json={}, headers=headers)

    assert response.status_code == 401
    assert "Invalid OpenAI API key" in response.json()["detail"]


def test_validate_api_key_missing_header(client):
    """Test validation fails if header is missing."""
    response = client.post("/config/api-key", json={})
    assert response.status_code == 400
    assert "Missing X-OpenAI-Key header" in response.json()["detail"]


# --- Move Endpoint Tests ---


@pytest.fixture
def valid_headers():
    return {"X-OpenAI-Key": "sk-test-key-for-moves"}


def test_move_invalid_fen(client, valid_headers):
    """Test requesting a move with an invalid FEN string."""
    payload = {"fen": "invalid-fen-string"}
    response = client.post("/move", json=payload, headers=valid_headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Invalid FEN string"


def test_move_game_over(client, valid_headers):
    """Test requesting a move when the game is already over (Checkmate)."""
    fools_mate_fen = "rnb1kbnr/pppp1ppp/8/4p3/6Pq/5P2/PPPPP2P/RNBQKBNR w KQkq - 1 3"
    payload = {"fen": fools_mate_fen}
    response = client.post("/move", json=payload, headers=valid_headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Game is over"


def test_move_no_api_key(client):
    """Test requesting a move without API key header."""
    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    payload = {"fen": start_fen}
    response = client.post("/move", json=payload)
    assert response.status_code == 412
    assert "OpenAI API key is missing" in response.json()["detail"]


@patch("src.api.endpoints.get_langchain_client")
@pytest.mark.asyncio
async def test_move_valid_fen(mock_get_langchain, client, valid_headers):
    """Test a valid move request with mocked LangChain response."""
    mock_llm = MagicMock()
    mock_structured_llm = MagicMock()
    mock_get_langchain.return_value = mock_llm
    mock_llm.with_structured_output.return_value = mock_structured_llm

    class MoveSelectionMock:
        def __init__(self, move_val, reasoning):
            class MoveVal:
                def __init__(self, v):
                    self.value = v

            self.move = MoveVal(move_val)
            self.reasoning = reasoning

    mock_response = MoveSelectionMock("e2e4", "Best opening move.")
    mock_structured_llm.ainvoke = AsyncMock(return_value=mock_response)

    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    payload = {"fen": start_fen}

    response = client.post("/move", json=payload, headers=valid_headers)

    assert response.status_code == 200, response.text
    data = response.json()
    assert data["move"] == "e2e4"
    assert data["san"] == "e4"

    # Verify key was passed to client factory
    mock_get_langchain.assert_called_once_with(
        api_key="sk-test-key-for-moves", model="gpt-4o-mini"
    )


@patch("src.api.endpoints.get_langchain_client")
@pytest.mark.asyncio
async def test_move_rate_limit_error(mock_get_langchain, client, valid_headers):
    """Test handling of OpenAI RateLimitError."""
    from openai import RateLimitError

    mock_llm = MagicMock()
    mock_structured_llm = MagicMock()
    mock_get_langchain.return_value = mock_llm
    mock_llm.with_structured_output.return_value = mock_structured_llm

    err = RateLimitError(message="Rate limit exceeded", response=MagicMock(), body=None)
    mock_structured_llm.ainvoke = AsyncMock(side_effect=err)

    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    payload = {"fen": start_fen}
    response = client.post("/move", json=payload, headers=valid_headers)

    assert response.status_code == 429
    assert "OpenAI API quota exceeded" in response.json()["detail"]


@patch("src.api.endpoints.get_langchain_client")
@pytest.mark.asyncio
async def test_move_auth_error(mock_get_langchain, client, valid_headers):
    """Test handling of OpenAI AuthenticationError."""
    from openai import AuthenticationError

    mock_llm = MagicMock()
    mock_structured_llm = MagicMock()
    mock_get_langchain.return_value = mock_llm
    mock_llm.with_structured_output.return_value = mock_structured_llm

    err = AuthenticationError(message="Invalid key", response=MagicMock(), body=None)
    mock_structured_llm.ainvoke = AsyncMock(side_effect=err)

    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    payload = {"fen": start_fen}
    response = client.post("/move", json=payload, headers=valid_headers)

    assert response.status_code == 401
    assert "OpenAI API key is invalid" in response.json()["detail"]


@patch("src.api.endpoints.get_langchain_client")
@pytest.mark.asyncio
async def test_move_connection_error(mock_get_langchain, client, valid_headers):
    """Test handling of OpenAI APIConnectionError."""
    from openai import APIConnectionError

    mock_llm = MagicMock()
    mock_structured_llm = MagicMock()
    mock_get_langchain.return_value = mock_llm
    mock_llm.with_structured_output.return_value = mock_structured_llm

    err = APIConnectionError(request=MagicMock())
    mock_structured_llm.ainvoke = AsyncMock(side_effect=err)

    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    payload = {"fen": start_fen}
    response = client.post("/move", json=payload, headers=valid_headers)

    assert response.status_code == 503
    assert "Failed to connect to OpenAI API" in response.json()["detail"]


@patch("src.api.endpoints.get_langchain_client")
@pytest.mark.asyncio
async def test_move_with_custom_model(mock_get_langchain, client, valid_headers):
    """Test that custom model parameter is passed to LangChain client."""
    mock_llm = MagicMock()
    mock_structured_llm = MagicMock()
    mock_get_langchain.return_value = mock_llm
    mock_llm.with_structured_output.return_value = mock_structured_llm

    class MoveSelectionMock:
        def __init__(self, move_val, reasoning):
            class MoveVal:
                def __init__(self, v):
                    self.value = v

            self.move = MoveVal(move_val)
            self.reasoning = reasoning

    mock_response = MoveSelectionMock("e2e4", "Best opening move.")
    mock_structured_llm.ainvoke = AsyncMock(return_value=mock_response)

    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    payload = {"fen": start_fen, "model": "gpt-4o"}
    response = client.post("/move", json=payload, headers=valid_headers)

    assert response.status_code == 200
    mock_get_langchain.assert_called_once_with(
        api_key="sk-test-key-for-moves", model="gpt-4o"
    )


@patch("src.api.endpoints.get_langchain_client")
@pytest.mark.asyncio
async def test_move_dict_response(mock_get_langchain, client, valid_headers):
    """Test handling of dict response from LangChain."""
    mock_llm = MagicMock()
    mock_structured_llm = MagicMock()
    mock_get_langchain.return_value = mock_llm
    mock_llm.with_structured_output.return_value = mock_structured_llm

    mock_response = {"move": "d2d4", "reasoning": "Queen's pawn opening."}
    mock_structured_llm.ainvoke = AsyncMock(return_value=mock_response)

    start_fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    payload = {"fen": start_fen}
    response = client.post("/move", json=payload, headers=valid_headers)

    assert response.status_code == 200
    data = response.json()
    assert data["move"] == "d2d4"


def test_move_stalemate(client, valid_headers):
    """Test requesting a move in a stalemate position."""
    stalemate_fen = "k7/8/1K6/8/8/8/8/8 b - - 0 1"
    payload = {"fen": stalemate_fen}
    response = client.post("/move", json=payload, headers=valid_headers)
    assert response.status_code == 400
    assert response.json()["detail"] == "Game is over"


# --- Config Models Endpoint Tests ---


def test_get_models_no_api_key(client):
    """Test getting models when no API key header is present."""
    response = client.get("/config/models")
    assert response.status_code == 200
    assert response.json() == []


@patch("src.api.endpoints.AsyncOpenAI")
@pytest.mark.asyncio
async def test_get_models_success(mock_async_openai, client, valid_headers):
    """Test getting models returns filtered list of chat models."""
    mock_client_instance = AsyncMock()
    mock_async_openai.return_value = mock_client_instance

    class MockModel:
        def __init__(self, model_id):
            self.id = model_id

    mock_models_response = MagicMock()
    mock_models_response.data = [
        MockModel("gpt-4o"),
        MockModel("gpt-4o-mini"),
        MockModel("gpt-3.5-turbo"),
        MockModel("gpt-4-vision-preview"),
    ]
    mock_client_instance.models.list.return_value = mock_models_response

    response = client.get("/config/models", headers=valid_headers)

    assert response.status_code == 200
    models = response.json()
    assert "gpt-4o" in models
    assert "gpt-4o-mini" in models
    assert "gpt-3.5-turbo" in models
    assert "gpt-4-vision-preview" not in models


@patch("src.api.endpoints.AsyncOpenAI")
@pytest.mark.asyncio
async def test_get_models_api_error(mock_async_openai, client, valid_headers):
    """Test getting models returns fallback list when API fails."""
    mock_client_instance = AsyncMock()
    mock_async_openai.return_value = mock_client_instance
    mock_client_instance.models.list.side_effect = Exception("API Error")

    response = client.get("/config/models", headers=valid_headers)

    assert response.status_code == 200
    fallback_models = response.json()
    assert "gpt-4o-mini" in fallback_models

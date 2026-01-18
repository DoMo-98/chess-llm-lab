import logging
from enum import Enum

import chess
from fastapi import APIRouter, HTTPException
from openai import APIConnectionError, AsyncOpenAI, AuthenticationError, RateLimitError
from pydantic import BaseModel
from src.core.config import (
    get_global_api_key,
    get_langchain_client,
    set_global_api_key,
)
from src.models.schemas import ApiKeyRequest, MoveRequest, MoveResponse

router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/health")
def health_check():
    return {"status": "ok", "openai_api_key_configured": bool(get_global_api_key())}


@router.post("/config/api-key")
async def set_api_key(request: ApiKeyRequest):
    # Create temporary client to validate the key
    temp_client = AsyncOpenAI(api_key=request.api_key)
    try:
        # Minimal call to validate the key
        _ = await temp_client.models.list()
    except AuthenticationError:
        raise HTTPException(status_code=401, detail="Invalid OpenAI API key provided.")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid OpenAI API key: {str(e)}")

    set_global_api_key(request.api_key)
    return {"status": "success", "message": "API key validated and updated"}


@router.get("/config/models")
async def get_models():
    api_key = get_global_api_key()
    if not api_key:
        return []

    client = AsyncOpenAI(api_key=api_key)
    try:
        models = await client.models.list()
        # Filter for models that are likely chat models (GPT-3.5, GPT-4, o1, etc.)
        chat_models = [
            m.id
            for m in models.data
            if m.id.startswith(("gpt-", "o1-"))
            and not any(
                x in m.id for x in ["-vision", "-instruct", "realtime", "audio"]
            )
        ]
        logger.info(f"Found {len(chat_models)} chat models")
        return sorted(chat_models)
    except Exception as e:
        logger.error(f"Error fetching models: {e}")
        return ["gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"]  # Fallback


@router.post("/move", response_model=MoveResponse)
async def get_move(request: MoveRequest):
    try:
        board = chess.Board(request.fen)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN string")

    if board.is_game_over():
        raise HTTPException(status_code=400, detail="Game is over")

    legal_moves = list(board.legal_moves)
    if not legal_moves:
        raise HTTPException(status_code=400, detail="No legal moves available")

    # Create a dynamic Enum for legal moves
    move_map = {m.uci(): m.uci() for m in legal_moves}
    MoveEnum = Enum("MoveEnum", move_map, type=str)
    logger.info(f"MoveEnum count for current request: {len(MoveEnum)}")

    # Define the response structure using the dynamic Enum
    class MoveSelection(BaseModel):
        reasoning: str
        move: MoveEnum

    api_key = get_global_api_key()
    if not api_key:
        raise HTTPException(
            status_code=412,
            detail="OpenAI API key is missing. Please configure it in the settings.",
        )

    llm = get_langchain_client(model=request.model)
    logger.info(f"Making move for FEN: {request.fen} using model: {request.model}")
    structured_llm = llm.with_structured_output(MoveSelection)

    try:
        selected_move_data = await structured_llm.ainvoke(
            [
                (
                    "system",
                    "You are a grandmaster chess player. Analyze the given FEN and select the best move from the available legal moves. Provide your reasoning and the chosen move.",
                ),
                ("user", f"FEN: {request.fen}"),
            ]
        )

        if not selected_move_data:
            raise HTTPException(status_code=500, detail="Failed to parse LLM response")

        # Handle both dict and Pydantic model (LangChain can return either depending on config)
        if isinstance(selected_move_data, dict):
            move_uci = selected_move_data["move"]
        else:
            move_uci = selected_move_data.move
            if hasattr(move_uci, "value"):
                move_uci = move_uci.value
        move = chess.Move.from_uci(move_uci)
        san = board.san(move)

        return MoveResponse(move=move_uci, san=san)

    except RateLimitError as e:
        logger.error(f"OpenAI Rate Limit Exceeded: {e}")
        raise HTTPException(
            status_code=429,
            detail="OpenAI API quota exceeded or rate limit reached. Please check your plan limits.",
        )
    except AuthenticationError as e:
        logger.error(f"OpenAI Authentication Failed: {e}")
        raise HTTPException(
            status_code=401,
            detail="OpenAI API key is invalid or expired. Please check your settings.",
        )
    except APIConnectionError as e:
        logger.error(f"OpenAI Connection Error: {e}")
        raise HTTPException(
            status_code=503,
            detail="Failed to connect to OpenAI API. Please check your internet connection.",
        )
    except Exception as e:
        logger.error(f"Unexpected error in get_move: {e}")
        raise HTTPException(status_code=500, detail=f"Internal server error: {str(e)}")

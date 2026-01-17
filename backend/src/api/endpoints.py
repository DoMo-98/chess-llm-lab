import logging
from enum import Enum

import chess
from fastapi import APIRouter, HTTPException
from openai import AsyncOpenAI
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
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid OpenAI API key: {str(e)}")

    set_global_api_key(request.api_key)
    return {"status": "success", "message": "API key validated and updated"}


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

    llm = get_langchain_client()
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

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

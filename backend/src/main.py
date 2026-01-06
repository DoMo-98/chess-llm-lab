import os
from enum import Enum

import chess
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI
from pydantic import BaseModel

load_dotenv()

app = FastAPI()

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# OpenAI client initialization
_OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def get_openai_client():
    return AsyncOpenAI(api_key=_OPENAI_API_KEY or "missing")


class ApiKeyRequest(BaseModel):
    api_key: str


@app.on_event("startup")
async def startup_event():
    global _OPENAI_API_KEY
    if _OPENAI_API_KEY:
        print("Validating initial OpenAI API key from .env...")
        temp_client = AsyncOpenAI(api_key=_OPENAI_API_KEY)
        try:
            await temp_client.models.list()
            print("Initial API key is valid.")
        except Exception as e:
            print(f"Initial API key is invalid: {e}")
            _OPENAI_API_KEY = None


@app.post("/config/api-key")
async def set_api_key(request: ApiKeyRequest):
    global _OPENAI_API_KEY

    # Create temporary client to validate the key
    temp_client = AsyncOpenAI(api_key=request.api_key)
    try:
        # Minimal call to validate the key
        await temp_client.models.list()
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid OpenAI API key: {str(e)}")

    _OPENAI_API_KEY = request.api_key
    return {"status": "success", "message": "API key validated and updated"}


class MoveRequest(BaseModel):
    fen: str


class MoveResponse(BaseModel):
    move: str
    san: str | None = None


@app.get("/health")
def health_check():
    return {"status": "ok", "openai_api_key_configured": bool(_OPENAI_API_KEY)}


@app.post("/move", response_model=MoveResponse)
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

    # Define the response structure using the dynamic Enum
    class MoveSelection(BaseModel):
        reasoning: str
        move: MoveEnum

    if not _OPENAI_API_KEY:
        raise HTTPException(
            status_code=412,
            detail="OpenAI API key is missing. Please configure it in the settings.",
        )

    client = get_openai_client()
    try:
        completion = await client.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {
                    "role": "system",
                    "content": "You are a grandmaster chess player. Analyze the given FEN and select the best move from the available legal moves. Provide your reasoning and the chosen move.",
                },
                {"role": "user", "content": f"FEN: {request.fen}"},
            ],
            response_format=MoveSelection,
        )

        selected_move_data = completion.choices[0].message.parsed
        if not selected_move_data:
            raise HTTPException(status_code=500, detail="Failed to parse LLM response")

        move_uci = selected_move_data.move.value
        move = chess.Move.from_uci(move_uci)
        san = board.san(move)

        return MoveResponse(move=move_uci, san=san)

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

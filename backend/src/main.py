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

client = AsyncOpenAI()


class MoveRequest(BaseModel):
    fen: str


class MoveResponse(BaseModel):
    move: str
    san: str | None = None


@app.get("/health")
def health_check():
    return {"status": "ok"}


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

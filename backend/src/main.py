from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import chess

app = FastAPI()


class MoveRequest(BaseModel):
    fen: str


class MoveResponse(BaseModel):
    move: str
    san: str | None = None


@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.post("/move", response_model=MoveResponse)
def get_move(request: MoveRequest):
    try:
        board = chess.Board(request.fen)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid FEN string")

    if board.is_game_over():
        raise HTTPException(status_code=400, detail="Game is over")

    # Dummy logic: get the first legal move
    legal_moves = list(board.legal_moves)
    if not legal_moves:
        raise HTTPException(status_code=400, detail="No legal moves available")

    move = legal_moves[0]
    san = board.san(move)

    return MoveResponse(move=move.uci(), san=san)

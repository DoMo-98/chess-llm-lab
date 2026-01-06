from pydantic import BaseModel


class ApiKeyRequest(BaseModel):
    api_key: str


class MoveRequest(BaseModel):
    fen: str


class MoveResponse(BaseModel):
    move: str
    san: str | None = None

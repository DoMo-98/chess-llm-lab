import logging
import time
import typing
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI

from src.api.endpoints import router as api_router
from src.core.config import get_global_api_key, set_global_api_key

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    api_key = get_global_api_key()
    if api_key:
        logger.info("Validating initial OpenAI API key from .env...")
        temp_client = AsyncOpenAI(api_key=api_key)
        try:
            _ = await temp_client.models.list()
            logger.info("Initial API key is valid.")
        except Exception as e:
            logger.error(f"Initial API key is invalid: {e}")
            set_global_api_key(None)
    yield


app = FastAPI(lifespan=lifespan)


@app.middleware("http")
async def log_requests(
    request: Request, call_next: typing.Callable[[Request], typing.Awaitable[Response]]
):
    start_time = time.time()

    # Log FEN if it's a move request
    if request.url.path == "/move" and request.method == "POST":
        try:
            # We need to clone the body to read it and still have it available for the endpoint
            body = await request.json()
            fen = body.get("fen", "Unknown")
            logger.info(f"Incoming move request for FEN: {fen}")
        except Exception:
            logger.warning("Could not parse FEN from request body for logging")

    response = await call_next(request)

    process_time = time.time() - start_time
    logger.info(
        f"Path: {request.url.path} Method: {request.method} Status: {response.status_code} Duration: {process_time:.4f}s"
    )

    return response


# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)

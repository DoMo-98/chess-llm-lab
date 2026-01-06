from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncOpenAI

from src.api.endpoints import router as api_router
from src.core.config import get_global_api_key, set_global_api_key

app = FastAPI()

# CORS for frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:4200"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.on_event("startup")
async def startup_event():
    api_key = get_global_api_key()
    if api_key:
        print("Validating initial OpenAI API key from .env...")
        temp_client = AsyncOpenAI(api_key=api_key)
        try:
            await temp_client.models.list()
            print("Initial API key is valid.")
        except Exception as e:
            print(f"Initial API key is invalid: {e}")
            set_global_api_key(None)

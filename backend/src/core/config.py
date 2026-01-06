import os

from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()

# OpenAI client initialization
_OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")


def get_openai_client():
    return AsyncOpenAI(api_key=_OPENAI_API_KEY or "missing")


def set_global_api_key(api_key: str | None):
    global _OPENAI_API_KEY
    _OPENAI_API_KEY = api_key


def get_global_api_key():
    return _OPENAI_API_KEY

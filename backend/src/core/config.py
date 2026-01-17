import os

from dotenv import load_dotenv
from langchain_openai import ChatOpenAI
from openai import AsyncOpenAI
from pydantic import SecretStr
from src.core.logging_config import setup_logging

load_dotenv()
_ = setup_logging()

# OpenAI client initialization
_openai_api_key = os.getenv("OPENAI_API_KEY")


def get_openai_client():
    return AsyncOpenAI(api_key=_openai_api_key or "missing")


def get_langchain_client():
    return ChatOpenAI(
        api_key=SecretStr(_openai_api_key) if _openai_api_key else None,
        model="gpt-4o-mini",
        temperature=0.2,
    )


def set_global_api_key(api_key: str | None):
    global _openai_api_key
    _openai_api_key = api_key


def get_global_api_key():
    return _openai_api_key

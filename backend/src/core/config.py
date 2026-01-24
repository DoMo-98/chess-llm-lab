from langchain_openai import ChatOpenAI
from pydantic import SecretStr
from src.core.logging_config import setup_logging

_ = setup_logging()


def get_langchain_client(api_key: str, model: str = "gpt-4o-mini"):
    return ChatOpenAI(
        api_key=SecretStr(api_key),
        model=model,
        temperature=0.2,
    )

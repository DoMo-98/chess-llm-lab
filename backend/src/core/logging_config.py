import logging
import sys


def setup_logging():
    """Configure structured logging for the application."""
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        handlers=[logging.StreamHandler(sys.stdout)],
    )

    # Set specific log levels for some libraries if needed
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)

    return logging.getLogger("src")

# Chess LLM Lab - Backend

Backend service for the Chess LLM Lab application. Designed as a stateless chess arbiter and LLM connector.

## Tech Stack

- **Python**: 3.12
- **Framework**: FastAPI
- **Package Manager**: [uv](https://github.com/astral-sh/uv)
- **Chess Logic**: `python-chess`
- **Validation**: Pydantic
- **Containerization**: Docker

## Getting Started

### Prerequisites

- **uv**: Extremely fast Python package installer and resolver.
  ```bash
  curl -LsSf https://astral.sh/uv/install.sh | sh
  ```

### Local Development

1.  **Install Dependencies**:
    ```bash
    cd backend
    uv sync
    ```

2.  **Configuration**:
    Copy the environment template and add your OpenAI API key:
    ```bash
    cp .env.template .env
    ```
    Edit `.env` and set your `OPENAI_API_KEY`.

3.  **Run the Server**:
    ```bash
    uv run uvicorn src.main:app --host 0.0.0.0 --port 8000 --reload
    ```

The API will be available at `http://localhost:8000`.
Docs are available at `http://localhost:8000/docs`.

### Docker

Run the backend as part of the docker-compose stack:

```bash
docker compose up --build backend
```

## Quality Gates

This project enforces strict quality standards using `uv` to manage tools:

- **Formatting**: `uv run ruff format .`
- **Linting**: `uv run ruff check . --fix`
- **Type Checking**: `uv run basedpyright`

## API Endpoints

### `GET /health`
Returns the status of the service.

### `POST /move`
Calculates a move based on the provided FEN position.

**Request Body:**
```json
{
  "fen": "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
}
```

**Response:**
```json
{
  "move": "e2e4",
  "san": "e4"
}
```

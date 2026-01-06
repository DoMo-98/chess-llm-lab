# Chess LLM Lab

A full-stack sandbox (Angular + Python) designed to evaluate and visualize LLM reasoning capabilities through Chess matches.

## Features

- **Interactive Chessboard**: Responsive UI for playing chess matches.
- **LLM Integration**: Play against OpenAI's models (e.g., `gpt-5-mini`).
- **AI Thought Process**: Visualize the reasoning behind each AI move.
- **Game Modes**: Toggle between Human vs. AI and Human vs. Human.
- **Board Controls**: Flip the board, lock orientation, and reset to initial position.
- **API Key Management**: Securely configure and validate your OpenAI API key through the UI.

## Tech Stack

### Frontend
- **Framework**: Angular 21
- **Styling**: Tailwind CSS
- **Chess Logic**: `chess.js` & `chessground`
- **Package Manager**: `pnpm`

### Backend
- **Framework**: FastAPI (Python 3.12)
- **AI Integration**: OpenAI SDK (Structured Outputs)
- **Chess Logic**: `python-chess`
- **Dependency Management**: `uv`

## Getting Started

### Prerequisites
- Node.js (with `pnpm`)
- Python 3.12 (with `uv`)
- Docker & Docker Compose (optional)
- OpenAI API Key

### Documentation
Detailed setup and configuration instructions can be found in the respective service directories:
- [Backend Documentation](./backend/README.md)
- [Frontend Documentation](./frontend/README.md)

### Running with Docker
Run the entire stack from the project root with a single command:
```bash
docker-compose up --build
```

## Project Structure

- `/frontend`: Angular application, components, and chess logic.
- `/backend`: FastAPI server, OpenAI integration, and game rules.
- `docker-compose.yml`: Multi-container orchestration setup.

## License
MIT

import os
import sys

# Add the parent directory (backend) to sys.path so we can import src
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fastapi.testclient import TestClient
from src.main import app

client = TestClient(app)


def test_get_move_llm():
    # Initial position FEN
    fen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"

    print(
        f"\nScanning for API Key: {'Found' if os.getenv('OPENAI_API_KEY') else 'Not Found'}"
    )
    print(f"Testing move generation for FEN: {fen}")

    response = client.post("/move", json={"fen": fen})

    if response.status_code == 200:
        data = response.json()
        print("\n✅ Success!")
        print(f"Move: {data['move']}")
        print(f"SAN: {data['san']}")
    else:
        print("\n❌ Failed!")
        print(f"Status Code: {response.status_code}")
        print(f"Detail: {response.json()}")


if __name__ == "__main__":
    test_get_move_llm()

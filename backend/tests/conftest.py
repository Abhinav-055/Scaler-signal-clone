"""Test setup: a throwaway SQLite file, a fresh schema per test, and login helpers."""

import os
import tempfile
from collections.abc import Iterator
from typing import Any

# Must be set before `app` is imported: settings and the engine are created at import time.
_tmpdir = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = f"sqlite:///{_tmpdir}/test.db"
os.environ["AUTO_SEED"] = "false"
os.environ["CLOUDINARY_CLOUD_NAME"] = ""
os.environ["FIXED_OTP"] = "123456"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

import app.models  # noqa: E402,F401
from app.db import Base, engine  # noqa: E402
from app.main import create_app  # noqa: E402
from app.ws.manager import manager  # noqa: E402


@pytest.fixture
def client() -> Iterator[TestClient]:
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    manager.reset()
    # `with` keeps one event loop for the whole test, so several WebSockets can talk to each other.
    with TestClient(create_app(with_lifespan=False)) as c:
        yield c


class Account:
    def __init__(self, client: TestClient, phone: str, name: str) -> None:
        res = client.post("/api/auth/verify-otp", json={"phone": phone, "code": "123456"})
        assert res.status_code == 200, res.text
        self.client = client
        self.token: str = res.json()["token"]
        self.id: int = res.json()["user"]["id"]
        self.patch("/users/me", {"display_name": name})

    @property
    def headers(self) -> dict[str, str]:
        return {"Authorization": f"Bearer {self.token}"}

    def get(self, path: str) -> Any:
        res = self.client.get(f"/api{path}", headers=self.headers)
        assert res.status_code == 200, res.text
        return res.json()

    def post(self, path: str, body: Any, expect: int = 200) -> Any:
        res = self.client.post(f"/api{path}", json=body, headers=self.headers)
        assert res.status_code == expect, res.text
        return res.json() if res.content else None

    def patch(self, path: str, body: Any, expect: int = 200) -> Any:
        res = self.client.patch(f"/api{path}", json=body, headers=self.headers)
        assert res.status_code == expect, res.text
        return res.json()

    def delete(self, path: str, expect: int = 200) -> Any:
        res = self.client.delete(f"/api{path}", headers=self.headers)
        assert res.status_code == expect, res.text
        return res.json() if res.content else None

    def ws(self):  # type: ignore[no-untyped-def]
        return self.client.websocket_connect(f"/ws?token={self.token}")

    def direct_with(self, other: "Account") -> int:
        return self.post("/conversations", {"type": "direct", "user_id": other.id}, expect=201)["id"]


def recv(ws: Any, event_type: str, max_frames: int = 20) -> Any:
    """Read frames until one of `event_type` arrives (skipping presence etc.)."""
    for _ in range(max_frames):
        frame = ws.receive_json()
        if frame["type"] == event_type:
            return frame["payload"]
    raise AssertionError(f"no {event_type} frame received")


def send_message(ws: Any, conversation_id: int, body: str, client_id: str) -> Any:
    ws.send_json(
        {
            "type": "message.send",
            "payload": {"client_id": client_id, "conversation_id": conversation_id, "body": body},
        }
    )
    return recv(ws, "message.ack")["message"]


@pytest.fixture
def alice(client: TestClient) -> Account:
    return Account(client, "+919811111111", "Alice")


@pytest.fixture
def bob(client: TestClient) -> Account:
    return Account(client, "+919822222222", "Bob")


@pytest.fixture
def carol(client: TestClient) -> Account:
    return Account(client, "+919833333333", "Carol")

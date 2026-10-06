"""Keeps track of every open WebSocket, grouped by user.

One user can have several sockets (several tabs or browsers), so the map is
user_id -> set of sockets. This lives in process memory, which means the app must
run as a single instance; scaling out would need Redis pub/sub (see README).
"""

import logging
from collections.abc import Iterable
from typing import Any

from fastapi import WebSocket
from fastapi.encoders import jsonable_encoder

logger = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._connections: dict[int, set[WebSocket]] = {}

    def connect(self, user_id: int, ws: WebSocket) -> bool:
        """Register an (already accepted) socket. Returns True if this is the user's first one."""
        sockets = self._connections.setdefault(user_id, set())
        first = not sockets
        sockets.add(ws)
        return first

    def disconnect(self, user_id: int, ws: WebSocket) -> bool:
        """Forget a socket. Returns True if the user now has no sockets left (went offline)."""
        sockets = self._connections.get(user_id)
        if not sockets:
            return False
        sockets.discard(ws)
        if not sockets:
            del self._connections[user_id]
            return True
        return False

    def is_online(self, user_id: int) -> bool:
        return user_id in self._connections

    async def send_to_socket(self, ws: WebSocket, event_type: str, payload: Any) -> None:
        try:
            await ws.send_json({"type": event_type, "payload": jsonable_encoder(payload)})
        except Exception:  # socket already closed; the receive loop will clean it up
            logger.debug("send failed", exc_info=True)

    async def send_to_user(self, user_id: int, event_type: str, payload: Any) -> None:
        # Copy the set: a failed send can trigger a disconnect that mutates it.
        for ws in list(self._connections.get(user_id, ())):
            await self.send_to_socket(ws, event_type, payload)

    async def send_to_users(self, user_ids: Iterable[int], event_type: str, payload: Any) -> None:
        for user_id in set(user_ids):
            await self.send_to_user(user_id, event_type, payload)

    def reset(self) -> None:
        """Used by tests."""
        self._connections.clear()


# The single shared instance used by the whole app.
manager = ConnectionManager()

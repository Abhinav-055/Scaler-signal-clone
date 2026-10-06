"""The /ws endpoint: authenticate, track presence, and dispatch incoming client events.

Each incoming frame gets its own short-lived DB session, exactly like an HTTP request.
DB calls are synchronous; with SQLite they take well under a millisecond, so we accept
briefly blocking the event loop in exchange for much simpler code.
"""

import json
import logging
from typing import Any

from fastapi import WebSocket, WebSocketDisconnect
from pydantic import ValidationError
from sqlalchemy.orm import Session

from app.db import SessionLocal
from app.models import User
from app.models.types import utcnow
from app.schemas.message import MessageSend
from app.services import auth as auth_service
from app.services import messages as msg_service
from app.services.conversations import conversation_for_user
from app.services.errors import ServiceError
from app.services.queries import active_member_ids, get_active_membership
from app.ws import broadcast
from app.ws.events import ClientEvent, ReceiptPayload, ServerEvent, TypingPayload
from app.ws.manager import manager

logger = logging.getLogger(__name__)

# Custom close code the client understands as "your token is invalid, log out".
CLOSE_UNAUTHORIZED = 4401


async def websocket_endpoint(ws: WebSocket) -> None:
    token = ws.query_params.get("token", "")
    with SessionLocal() as db:
        try:
            user_id = auth_service.user_for_token(db, token).id
        except ServiceError:
            user_id = None
    await ws.accept()
    if user_id is None:
        await ws.close(code=CLOSE_UNAUTHORIZED)
        return

    first_socket = manager.connect(user_id, ws)
    try:
        with SessionLocal() as db:
            user = db.get(User, user_id)
            assert user is not None
            if first_socket:
                await broadcast.presence_changed(db, user, online=True)
            # Anything sent to me while I was offline is now delivered to this device.
            await broadcast.receipts_changed(db, msg_service.mark_delivered(db, user))

        while True:
            raw = await ws.receive_text()
            try:
                frame = json.loads(raw)
                event_type = str(frame.get("type", ""))
                payload = frame.get("payload") or {}
            except (ValueError, AttributeError):
                await manager.send_to_socket(
                    ws, ServerEvent.ERROR, {"code": "bad_frame", "message": "Invalid JSON"}
                )
                continue
            with SessionLocal() as db:
                await dispatch(db, user_id, ws, event_type, payload)
    except WebSocketDisconnect:
        pass
    finally:
        if manager.disconnect(user_id, ws):
            with SessionLocal() as db:
                user = db.get(User, user_id)
                if user is not None:
                    user.last_seen_at = utcnow()
                    db.commit()
                    await broadcast.presence_changed(db, user, online=False)


async def dispatch(
    db: Session, user_id: int, ws: WebSocket, event_type: str, payload: dict[str, Any]
) -> None:
    user = db.get(User, user_id)
    if user is None:
        await ws.close(code=CLOSE_UNAUTHORIZED)
        return
    try:
        match event_type:
            case ClientEvent.PING:
                await manager.send_to_socket(ws, ServerEvent.PONG, {})

            case ClientEvent.MESSAGE_SEND:
                data = MessageSend.model_validate(payload)
                msg, created = msg_service.send_message(db, user, data)
                await broadcast.message_created(db, msg, created)

            case ClientEvent.TYPING_START | ClientEvent.TYPING_STOP:
                typing = TypingPayload.model_validate(payload)
                get_active_membership(db, typing.conversation_id, user.id)
                others = active_member_ids(db, typing.conversation_id) - {user.id}
                await manager.send_to_users(
                    others,
                    ServerEvent.TYPING,
                    {
                        "conversation_id": typing.conversation_id,
                        "user_id": user.id,
                        "is_typing": event_type == ClientEvent.TYPING_START,
                    },
                )

            case ClientEvent.RECEIPT_DELIVERED:
                receipt = ReceiptPayload.model_validate(payload)
                changed = msg_service.mark_delivered(db, user, receipt.message_ids)
                await broadcast.receipts_changed(db, changed)

            case ClientEvent.RECEIPT_READ:
                receipt = ReceiptPayload.model_validate(payload)
                changed, moved = msg_service.mark_read(db, user, receipt.message_ids)
                await broadcast.receipts_changed(db, changed)
                # Keep my other tabs' unread badges in sync.
                for conv_id in moved:
                    out = conversation_for_user(db, conv_id, user.id)
                    await manager.send_to_user(user.id, ServerEvent.CONVERSATION_UPDATED, out)

            case _:
                await manager.send_to_socket(
                    ws, ServerEvent.ERROR, {"code": "unknown_event", "message": f"Unknown event {event_type}"}
                )
    except ValidationError as exc:
        await manager.send_to_socket(
            ws,
            ServerEvent.ERROR,
            {
                "code": "invalid_payload",
                "message": str(exc.errors()[0]["msg"]),
                "client_id": payload.get("client_id"),
            },
        )
    except ServiceError as exc:
        db.rollback()
        await manager.send_to_socket(
            ws,
            ServerEvent.ERROR,
            {
                "code": type(exc).__name__.lower(),
                "message": exc.message,
                "client_id": payload.get("client_id"),
            },
        )

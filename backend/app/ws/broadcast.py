"""Push server events to connected users after the database has been updated.

Rule: always persist first, then broadcast. Every function here is called *after*
the corresponding service has committed.
"""

from collections.abc import Iterable

from sqlalchemy.orm import Session

from app.models import ConversationMember, Message, User
from app.services import conversations as conv_service
from app.services import messages as msg_service
from app.services.presenters import member_out, message_out
from app.services.queries import active_member_ids
from app.services.users import related_user_ids
from app.ws.events import ServerEvent
from app.ws.manager import manager


async def message_created(db: Session, msg: Message, created: bool) -> None:
    """Ack the sender (all their tabs) and deliver the message to everyone else."""
    active = active_member_ids(db, msg.conversation_id)
    if msg.sender_id is not None:
        await manager.send_to_user(
            msg.sender_id,
            ServerEvent.MESSAGE_ACK,
            {"client_id": msg.client_id, "message": message_out(msg, msg.sender_id, active)},
        )
    if not created:
        return  # a retry of something we already delivered
    for user_id in active - {msg.sender_id}:
        await manager.send_to_user(user_id, ServerEvent.MESSAGE_NEW, message_out(msg, user_id, active))


async def system_messages(db: Session, msgs: Iterable[Message], extra_user_ids: Iterable[int] = ()) -> None:
    """Group notices go to every current member, plus e.g. the person who was just removed."""
    for msg in msgs:
        full = msg_service.load_message(db, msg.id)
        active = active_member_ids(db, msg.conversation_id)
        for user_id in active | set(extra_user_ids):
            await manager.send_to_user(user_id, ServerEvent.MESSAGE_NEW, message_out(full, user_id, active))


async def conversation_changed(db: Session, conversation_id: int, extra_user_ids: Iterable[int] = ()) -> None:
    """Send each member their own (personalised) copy of the conversation."""
    for user_id in active_member_ids(db, conversation_id) | set(extra_user_ids):
        if manager.is_online(user_id):
            out = conv_service.conversation_for_user(db, conversation_id, user_id)
            await manager.send_to_user(user_id, ServerEvent.CONVERSATION_UPDATED, out)


async def members_changed(db: Session, conversation_id: int, user_ids: Iterable[int]) -> None:
    rows = db.query(ConversationMember).filter(
        ConversationMember.conversation_id == conversation_id,
        ConversationMember.user_id.in_(list(user_ids)),
    )
    audience = active_member_ids(db, conversation_id) | set(user_ids)
    for member in rows:
        await manager.send_to_users(
            audience,
            ServerEvent.MEMBER_UPDATED,
            {"conversation_id": conversation_id, "member": member_out(member)},
        )


async def receipts_changed(db: Session, message_ids: list[int]) -> None:
    """Tell senders the new derived status of their messages."""
    for upd in msg_service.receipt_updates(db, message_ids):
        await manager.send_to_user(
            upd.sender_id,
            ServerEvent.RECEIPT_UPDATED,
            {"conversation_id": upd.conversation_id, "updates": upd.updates},
        )


async def reactions_changed(db: Session, msg: Message) -> None:
    await manager.send_to_users(
        active_member_ids(db, msg.conversation_id),
        ServerEvent.REACTION_UPDATED,
        {
            "conversation_id": msg.conversation_id,
            "message_id": msg.id,
            "reactions": msg_service.reactions_out(msg),
        },
    )


async def presence_changed(db: Session, user: User, online: bool) -> None:
    await manager.send_to_users(
        related_user_ids(db, user.id),
        ServerEvent.PRESENCE,
        {"user_id": user.id, "online": online, "last_seen_at": user.last_seen_at},
    )


async def messages_expired(db: Session, conversation_id: int, message_ids: list[int]) -> None:
    await manager.send_to_users(
        active_member_ids(db, conversation_id),
        ServerEvent.MESSAGE_EXPIRED,
        {"conversation_id": conversation_id, "message_ids": message_ids},
    )

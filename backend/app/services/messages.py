"""Sending messages, receipts, reactions, 'delete for me' and disappearing-message expiry."""

from collections import defaultdict
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.models import (
    Attachment,
    ConversationMember,
    HiddenMessage,
    Message,
    MessageReceipt,
    Reaction,
    User,
)
from app.models.types import utcnow
from app.schemas.message import (
    MessageInfo,
    MessagePage,
    MessageSend,
    ReactionOut,
    ReceiptInfo,
)
from app.services.cloudinary_service import is_our_asset
from app.services.errors import BadRequest, Conflict, Forbidden, NotFound
from app.services.presenters import derive_status, message_out
from app.services.queries import (
    active_member_ids,
    get_active_membership,
    get_membership,
    message_load_options,
    visible_to_member,
)


def load_message(db: Session, message_id: int) -> Message:
    msg = db.scalar(
        select(Message)
        .where(Message.id == message_id)
        .options(*message_load_options())
        .execution_options(populate_existing=True)
    )
    if msg is None:
        raise NotFound("Message not found")
    return msg


# ---------------------------------------------------------------- history


def get_page(db: Session, me: User, conversation_id: int, before: int | None, limit: int) -> MessagePage:
    """Cursor pagination by message id (ids only grow, so they sort like time)."""
    get_membership(db, conversation_id, me.id)  # left members may still read old history
    query = (
        select(Message)
        .join(
            ConversationMember,
            (ConversationMember.conversation_id == Message.conversation_id)
            & (ConversationMember.user_id == me.id),
        )
        .where(Message.conversation_id == conversation_id, visible_to_member())
        .options(*message_load_options())
        .order_by(Message.id.desc())
        .limit(limit + 1)  # fetch one extra row to know whether there is more
    )
    if before is not None:
        query = query.where(Message.id < before)
    rows = list(db.scalars(query))
    has_more = len(rows) > limit
    rows = rows[:limit]
    rows.reverse()
    active = active_member_ids(db, conversation_id)
    return MessagePage(messages=[message_out(m, me.id, active) for m in rows], has_more=has_more)


# ---------------------------------------------------------------- sending


def send_message(db: Session, me: User, data: MessageSend) -> tuple[Message, bool]:
    """Persist a message. Returns (message, created). created=False means it was a retry."""
    existing = db.scalar(select(Message).where(Message.client_id == data.client_id))
    if existing is not None:
        if existing.sender_id != me.id:
            raise Conflict("Duplicate client_id")
        return load_message(db, existing.id), False

    member = get_active_membership(db, data.conversation_id, me.id)
    conv = member.conversation
    body = data.body.strip()
    if not body and not data.attachments:
        raise BadRequest("Message is empty")
    for att in data.attachments:
        if not is_our_asset(att.secure_url, att.public_id):
            raise BadRequest("Attachment was not uploaded through this app")
    if data.reply_to_id is not None:
        quoted = db.get(Message, data.reply_to_id)
        if quoted is None or quoted.conversation_id != conv.id:
            raise BadRequest("The message you replied to is not in this conversation")

    if not data.attachments:
        msg_type = "text"
    elif all(a.resource_type == "image" for a in data.attachments):
        msg_type = "image"
    else:
        msg_type = "file"

    now = utcnow()
    msg = Message(
        conversation_id=conv.id,
        sender_id=me.id,
        client_id=data.client_id,
        type=msg_type,
        body=body,
        reply_to_id=data.reply_to_id,
        created_at=now,
        # The disappearing timer starts when the message is sent (Signal starts it on read).
        expires_at=(
            now + timedelta(seconds=conv.disappearing_seconds) if conv.disappearing_seconds else None
        ),
    )
    msg.attachments = [Attachment(**a.model_dump()) for a in data.attachments]
    # One receipt row per current recipient; timestamps stay NULL until delivered/read.
    msg.receipts = [
        MessageReceipt(user_id=m.user_id) for m in conv.members if m.left_at is None and m.user_id != me.id
    ]
    db.add(msg)
    conv.last_message_at = now
    try:
        db.flush()
        member.last_read_message_id = msg.id  # my own message counts as read by me
        db.commit()
    except IntegrityError:
        # Two tabs/retries raced with the same client_id: return the row that won.
        db.rollback()
        existing = db.scalar(select(Message).where(Message.client_id == data.client_id))
        if existing is None or existing.sender_id != me.id:
            raise
        return load_message(db, existing.id), False
    return load_message(db, msg.id), True


# ---------------------------------------------------------------- receipts


def mark_delivered(db: Session, me: User, message_ids: list[int] | None = None) -> list[int]:
    """Set delivered_at on my receipts. None = everything pending (used when I connect)."""
    query = select(MessageReceipt).where(
        MessageReceipt.user_id == me.id, MessageReceipt.delivered_at.is_(None)
    )
    if message_ids is not None:
        query = query.where(MessageReceipt.message_id.in_(message_ids))
    receipts = list(db.scalars(query))
    now = utcnow()
    for r in receipts:
        r.delivered_at = now
    db.commit()
    return [r.message_id for r in receipts]


def mark_read(db: Session, me: User, message_ids: list[int]) -> tuple[list[int], set[int]]:
    """Set read_at on my receipts and move my read pointer forward.

    Returns (message ids whose receipt changed, conversation ids whose pointer moved).
    """
    now = utcnow()
    receipts = list(
        db.scalars(
            select(MessageReceipt).where(
                MessageReceipt.user_id == me.id,
                MessageReceipt.message_id.in_(message_ids),
                MessageReceipt.read_at.is_(None),
            )
        )
    )
    for r in receipts:
        r.read_at = now
        r.delivered_at = r.delivered_at or now

    # Move last_read_message_id to the newest message read in each conversation.
    rows = db.execute(select(Message.conversation_id, Message.id).where(Message.id.in_(message_ids))).all()
    newest: dict[int, int] = {}
    for conv_id, msg_id in rows:
        newest[conv_id] = max(newest.get(conv_id, 0), msg_id)
    memberships = db.scalars(
        select(ConversationMember).where(
            ConversationMember.user_id == me.id,
            ConversationMember.conversation_id.in_(newest.keys()),
        )
    )
    moved: set[int] = set()
    for m in memberships:
        if (m.last_read_message_id or 0) < newest[m.conversation_id]:
            m.last_read_message_id = newest[m.conversation_id]
            moved.add(m.conversation_id)
    db.commit()
    return [r.message_id for r in receipts], moved


@dataclass
class ReceiptUpdate:
    sender_id: int
    conversation_id: int
    updates: list[dict[str, object]]  # [{message_id, status}]


def receipt_updates(db: Session, message_ids: list[int]) -> list[ReceiptUpdate]:
    """Recompute the derived status of messages, grouped per (sender, conversation)."""
    if not message_ids:
        return []
    msgs = list(
        db.scalars(
            select(Message)
            .where(Message.id.in_(message_ids))
            .options(selectinload(Message.receipts))
            .execution_options(populate_existing=True)
        )
    )
    conv_ids = {m.conversation_id for m in msgs}
    active: dict[int, set[int]] = defaultdict(set)
    for conv_id, user_id in db.execute(
        select(ConversationMember.conversation_id, ConversationMember.user_id).where(
            ConversationMember.conversation_id.in_(conv_ids), ConversationMember.left_at.is_(None)
        )
    ):
        active[conv_id].add(user_id)

    grouped: dict[tuple[int, int], list[dict[str, object]]] = defaultdict(list)
    for m in msgs:
        if m.sender_id is None:
            continue
        grouped[(m.sender_id, m.conversation_id)].append(
            {"message_id": m.id, "status": derive_status(m, active[m.conversation_id])}
        )
    return [ReceiptUpdate(s, c, u) for (s, c), u in grouped.items()]


def message_info(db: Session, me: User, message_id: int) -> MessageInfo:
    msg = load_message(db, message_id)
    get_membership(db, msg.conversation_id, me.id)
    if msg.sender_id != me.id:
        raise Forbidden("You can only view info for messages you sent")
    return MessageInfo(
        message_id=msg.id,
        created_at=msg.created_at,
        receipts=[
            ReceiptInfo(user_id=r.user_id, delivered_at=r.delivered_at, read_at=r.read_at)
            for r in msg.receipts
        ],
    )


# ---------------------------------------------------------------- reactions / delete


def _reactable(db: Session, me: User, message_id: int) -> Message:
    msg = load_message(db, message_id)
    member = get_active_membership(db, msg.conversation_id, me.id)
    if msg.type == "system" or msg.created_at < member.joined_at:
        raise BadRequest("You can't react to this message")
    return msg


def set_reaction(db: Session, me: User, message_id: int, emoji: str) -> Message:
    """Add or replace my reaction (one per user per message, enforced by the primary key)."""
    msg = _reactable(db, me, message_id)
    reaction = db.get(Reaction, (msg.id, me.id))
    if reaction is None:
        db.add(Reaction(message_id=msg.id, user_id=me.id, emoji=emoji))
    else:
        reaction.emoji = emoji
        reaction.created_at = utcnow()
    db.commit()
    return load_message(db, msg.id)


def remove_reaction(db: Session, me: User, message_id: int) -> Message:
    msg = _reactable(db, me, message_id)
    reaction = db.get(Reaction, (msg.id, me.id))
    if reaction is not None:
        db.delete(reaction)
        db.commit()
    return load_message(db, msg.id)


def reactions_out(msg: Message) -> list[ReactionOut]:
    return [ReactionOut(user_id=r.user_id, emoji=r.emoji) for r in msg.reactions]


def hide_message(db: Session, me: User, message_id: int) -> int:
    """'Delete for me'. Returns the conversation id."""
    msg = db.get(Message, message_id)
    if msg is None:
        raise NotFound("Message not found")
    get_membership(db, msg.conversation_id, me.id)
    if db.get(HiddenMessage, (message_id, me.id)) is None:
        db.add(HiddenMessage(message_id=message_id, user_id=me.id))
        db.commit()
    return msg.conversation_id


# ---------------------------------------------------------------- disappearing messages


@dataclass
class ExpiredBatch:
    conversation_id: int
    message_ids: list[int]


def delete_expired(db: Session) -> tuple[list[ExpiredBatch], list[tuple[str, str]]]:
    """Delete every message whose expires_at has passed.

    Returns the deleted ids per conversation and the Cloudinary assets to clean up.
    Receipts, reactions, attachments and hidden rows go with them (ON DELETE CASCADE).
    """
    msgs = list(
        db.scalars(
            select(Message)
            .where(Message.expires_at.is_not(None), Message.expires_at <= utcnow())
            .options(selectinload(Message.attachments))
        )
    )
    if not msgs:
        return [], []
    by_conv: dict[int, list[int]] = defaultdict(list)
    assets: list[tuple[str, str]] = []
    for m in msgs:
        by_conv[m.conversation_id].append(m.id)
        assets.extend((a.public_id, a.resource_type) for a in m.attachments)
        db.delete(m)
    db.commit()
    return [ExpiredBatch(c, ids) for c, ids in by_conv.items()], assets

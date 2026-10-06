"""Reusable query pieces shared by several services."""

from sqlalchemy import ColumnElement, and_, exists, not_, or_, select
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.orm.interfaces import LoaderOption

from app.models import Conversation, ConversationMember, HiddenMessage, Message
from app.services.errors import Forbidden, NotFound


def message_load_options() -> list[LoaderOption]:
    """Eager-load everything message_out() touches, in a fixed number of queries (no N+1)."""
    return [
        selectinload(Message.attachments),
        selectinload(Message.reactions),
        selectinload(Message.receipts),
        selectinload(Message.reply_to).selectinload(Message.attachments),
    ]


def conversation_load_options() -> list[LoaderOption]:
    return [
        selectinload(ConversationMember.conversation)
        .selectinload(Conversation.members)
        .selectinload(ConversationMember.user)
    ]


def visible_to_member() -> ColumnElement[bool]:
    """SQL condition: message `Message` is visible to the membership row `ConversationMember`.

    The query must join ConversationMember on the message's conversation for the viewer.
    A member sees messages from when they joined until they left, minus ones they hid.
    """
    hidden = exists().where(
        HiddenMessage.message_id == Message.id,
        HiddenMessage.user_id == ConversationMember.user_id,
    )
    return and_(
        Message.created_at >= ConversationMember.joined_at,
        or_(ConversationMember.left_at.is_(None), Message.created_at <= ConversationMember.left_at),
        Message.deleted_at.is_(None),
        not_(hidden),
    )


def get_membership(db: Session, conversation_id: int, user_id: int) -> ConversationMember:
    """Any membership row (active or past). Raises 404 if the user was never a member."""
    member = db.scalar(
        select(ConversationMember)
        .where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.user_id == user_id,
        )
        .options(*conversation_load_options())
    )
    if member is None:
        raise NotFound("Conversation not found")
    return member


def get_active_membership(db: Session, conversation_id: int, user_id: int) -> ConversationMember:
    member = get_membership(db, conversation_id, user_id)
    if member.left_at is not None:
        raise Forbidden("You are no longer a member of this conversation")
    return member


def active_member_ids(db: Session, conversation_id: int) -> set[int]:
    rows = db.scalars(
        select(ConversationMember.user_id).where(
            ConversationMember.conversation_id == conversation_id,
            ConversationMember.left_at.is_(None),
        )
    )
    return set(rows)

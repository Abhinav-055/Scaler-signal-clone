"""Turn ORM objects into response schemas.

The interesting part is `derive_status`: message status is never stored, it is
computed from the receipt rows every time a message is serialized.
"""

from collections.abc import Collection

from app.models import Conversation, ConversationMember, Message, User
from app.schemas.attachment import AttachmentOut
from app.schemas.conversation import ConversationOut, MemberOut
from app.schemas.message import MessageOut, MessageStatus, ReactionOut, ReplyPreview
from app.schemas.user import UserOut
from app.ws.manager import manager


def user_out(user: User) -> UserOut:
    out = UserOut.model_validate(user)
    out.online = manager.is_online(user.id)
    return out


def derive_status(message: Message, active_member_ids: Collection[int]) -> MessageStatus:
    """sent -> delivered -> read, taking the *lowest* state across current recipients.

    Receipts of people who have since left the group are ignored, otherwise a
    removed member could keep a message stuck on "delivered" forever.
    """
    receipts = [r for r in message.receipts if r.user_id in active_member_ids]
    if not receipts:
        receipts = list(message.receipts)
    if not receipts:
        return "sent"
    if all(r.read_at is not None for r in receipts):
        return "read"
    if all(r.delivered_at is not None for r in receipts):
        return "delivered"
    return "sent"


def message_out(message: Message, me_id: int, active_member_ids: Collection[int]) -> MessageOut:
    reply = None
    if message.reply_to is not None:
        reply = ReplyPreview(
            id=message.reply_to.id,
            sender_id=message.reply_to.sender_id,
            type=message.reply_to.type,
            body=message.reply_to.body,
            has_attachment=bool(message.reply_to.attachments),
        )
    status = None
    if message.sender_id == me_id and message.type != "system":
        status = derive_status(message, active_member_ids)
    return MessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        client_id=message.client_id,
        type=message.type,
        body=message.body,
        reply_to_id=message.reply_to_id,
        reply_to=reply,
        created_at=message.created_at,
        edited_at=message.edited_at,
        expires_at=message.expires_at,
        attachments=[AttachmentOut.model_validate(a) for a in message.attachments],
        reactions=[ReactionOut(user_id=r.user_id, emoji=r.emoji) for r in message.reactions],
        status=status,
    )


def member_out(member: ConversationMember) -> MemberOut:
    return MemberOut(
        user=user_out(member.user),
        role=member.role,
        joined_at=member.joined_at,
        left_at=member.left_at,
    )


def active_ids(conversation: Conversation) -> set[int]:
    return {m.user_id for m in conversation.members if m.left_at is None}


def conversation_out(
    me: ConversationMember,
    last_message: Message | None,
    unread_count: int,
) -> ConversationOut:
    conv = me.conversation
    return ConversationOut(
        id=conv.id,
        type=conv.type,
        name=conv.name,
        avatar_url=conv.avatar_url,
        description=conv.description,
        created_by=conv.created_by,
        disappearing_seconds=conv.disappearing_seconds,
        last_message_at=conv.last_message_at,
        created_at=conv.created_at,
        members=[member_out(m) for m in conv.members],
        unread_count=unread_count,
        last_message=(message_out(last_message, me.user_id, active_ids(conv)) if last_message else None),
        last_read_message_id=me.last_read_message_id,
        muted_until=me.muted_until,
        archived=me.archived,
        my_role=me.role,
        is_active_member=me.left_at is None,
    )

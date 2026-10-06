"""Conversation endpoints. Writes are `async` because they broadcast WebSocket events."""

from fastapi import APIRouter, Query

from app.deps import DB, CurrentUser
from app.schemas.conversation import (
    ConversationCreate,
    ConversationOut,
    ConversationUpdate,
    MarkRead,
    MembersAdd,
    MemberUpdate,
)
from app.schemas.message import MessagePage
from app.services import conversations as conv_service
from app.services import messages as msg_service
from app.ws import broadcast

router = APIRouter(prefix="/conversations", tags=["conversations"])


@router.get("", response_model=list[ConversationOut])
def list_conversations(db: DB, user: CurrentUser) -> list[ConversationOut]:
    return conv_service.list_conversations(db, user)


@router.post("", response_model=ConversationOut, status_code=201)
async def create_conversation(body: ConversationCreate, db: DB, user: CurrentUser) -> ConversationOut:
    conv_id, msgs = conv_service.create_conversation(db, user, body)
    if msgs:  # a new group: tell all members it exists
        await broadcast.conversation_changed(db, conv_id)
    return conv_service.conversation_for_user(db, conv_id, user.id)


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: int, db: DB, user: CurrentUser) -> ConversationOut:
    return conv_service.conversation_for_user(db, conversation_id, user.id)


@router.patch("/{conversation_id}", response_model=ConversationOut)
async def update_conversation(
    conversation_id: int, body: ConversationUpdate, db: DB, user: CurrentUser
) -> ConversationOut:
    msgs = conv_service.update_conversation(db, user, conversation_id, body)
    if msgs:  # something everyone can see changed (name, photo, timer...)
        await broadcast.system_messages(db, msgs)
        await broadcast.conversation_changed(db, conversation_id)
    return conv_service.conversation_for_user(db, conversation_id, user.id)


@router.post("/{conversation_id}/read", status_code=204)
def mark_read(conversation_id: int, body: MarkRead, db: DB, user: CurrentUser) -> None:
    """Move my read pointer without sending read receipts (read receipts turned off)."""
    conv_service.mark_read_pointer(db, user, conversation_id, body.message_id)


@router.post("/{conversation_id}/members", response_model=ConversationOut)
async def add_members(conversation_id: int, body: MembersAdd, db: DB, user: CurrentUser) -> ConversationOut:
    msgs = conv_service.add_members(db, user, conversation_id, body.user_ids)
    await broadcast.members_changed(db, conversation_id, body.user_ids)
    await broadcast.system_messages(db, msgs)
    await broadcast.conversation_changed(db, conversation_id)
    return conv_service.conversation_for_user(db, conversation_id, user.id)


@router.delete("/{conversation_id}/members/{user_id}", response_model=ConversationOut)
async def remove_member(conversation_id: int, user_id: int, db: DB, user: CurrentUser) -> ConversationOut:
    msgs = conv_service.remove_member(db, user, conversation_id, user_id)
    # The removed person still gets the notice and the final state of the conversation.
    await broadcast.system_messages(db, msgs, extra_user_ids=[user_id])
    await broadcast.members_changed(db, conversation_id, [user_id])
    await broadcast.conversation_changed(db, conversation_id, extra_user_ids=[user_id])
    return conv_service.conversation_for_user(db, conversation_id, user.id)


@router.patch("/{conversation_id}/members/{user_id}", response_model=ConversationOut)
async def update_member(
    conversation_id: int, user_id: int, body: MemberUpdate, db: DB, user: CurrentUser
) -> ConversationOut:
    msgs = conv_service.set_member_role(db, user, conversation_id, user_id, body.role)
    await broadcast.members_changed(db, conversation_id, [user_id])
    await broadcast.system_messages(db, msgs)
    return conv_service.conversation_for_user(db, conversation_id, user.id)


@router.get("/{conversation_id}/messages", response_model=MessagePage)
def get_messages(
    conversation_id: int,
    db: DB,
    user: CurrentUser,
    before: int | None = Query(None, description="Return messages with id < before"),
    limit: int = Query(50, ge=1, le=100),
) -> MessagePage:
    return msg_service.get_page(db, user, conversation_id, before, limit)

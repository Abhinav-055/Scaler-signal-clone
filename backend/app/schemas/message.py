from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.attachment import AttachmentIn, AttachmentOut

MessageStatus = Literal["sent", "delivered", "read"]


class ReplyPreview(BaseModel):
    """A small copy of the quoted message, so the client can render the quote without a lookup."""

    id: int
    sender_id: int | None
    type: str
    body: str
    has_attachment: bool


class ReactionOut(BaseModel):
    user_id: int
    emoji: str


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int | None
    client_id: str
    type: str
    body: str
    reply_to_id: int | None
    reply_to: ReplyPreview | None
    created_at: datetime
    edited_at: datetime | None
    expires_at: datetime | None
    attachments: list[AttachmentOut]
    reactions: list[ReactionOut]
    # Derived from message_receipts; only set on messages I sent (None for others/system).
    status: MessageStatus | None


class MessagePage(BaseModel):
    messages: list[MessageOut]  # oldest first
    has_more: bool


class MessageSend(BaseModel):
    """Payload of the `message.send` WebSocket event."""

    client_id: str = Field(min_length=8, max_length=64)
    conversation_id: int
    body: str = Field(default="", max_length=4000)
    reply_to_id: int | None = None
    attachments: list[AttachmentIn] = Field(default_factory=list, max_length=10)


class ReactionSet(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)


class ReceiptInfo(BaseModel):
    user_id: int
    delivered_at: datetime | None
    read_at: datetime | None


class MessageInfo(BaseModel):
    """'Message info' dialog: per-recipient delivery/read times."""

    message_id: int
    created_at: datetime
    receipts: list[ReceiptInfo]

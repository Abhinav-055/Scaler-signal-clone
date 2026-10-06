"""Names and payload shapes of every WebSocket event.

Every frame in both directions is JSON: {"type": <event name>, "payload": {...}}.
"""

from enum import StrEnum

from pydantic import BaseModel, Field


class ClientEvent(StrEnum):
    MESSAGE_SEND = "message.send"
    TYPING_START = "typing.start"
    TYPING_STOP = "typing.stop"
    RECEIPT_DELIVERED = "receipt.delivered"
    RECEIPT_READ = "receipt.read"
    PING = "ping"


class ServerEvent(StrEnum):
    MESSAGE_ACK = "message.ack"  # {client_id, message} -> only to the sender's sockets
    MESSAGE_NEW = "message.new"  # MessageOut -> other members
    RECEIPT_UPDATED = "receipt.updated"  # {conversation_id, updates: [{message_id, status}]}
    TYPING = "typing"  # {conversation_id, user_id, is_typing}
    PRESENCE = "presence"  # {user_id, online, last_seen_at}
    REACTION_UPDATED = "reaction.updated"  # {conversation_id, message_id, reactions}
    CONVERSATION_UPDATED = "conversation.updated"  # ConversationOut (personalised per user)
    MEMBER_UPDATED = "member.updated"  # {conversation_id, member}
    MESSAGE_EXPIRED = "message.expired"  # {conversation_id, message_ids}
    ERROR = "error"  # {code, message, client_id?}
    PONG = "pong"


# ---- client -> server payloads (message.send uses schemas.message.MessageSend) ----


class TypingPayload(BaseModel):
    conversation_id: int


class ReceiptPayload(BaseModel):
    message_ids: list[int] = Field(min_length=1, max_length=500)

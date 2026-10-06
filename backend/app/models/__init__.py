"""Import every model so Base.metadata knows all tables (needed by Alembic)."""

from app.models.attachment import Attachment
from app.models.contact import Contact
from app.models.conversation import Conversation
from app.models.conversation_member import ConversationMember
from app.models.hidden_message import HiddenMessage
from app.models.message import Message
from app.models.message_receipt import MessageReceipt
from app.models.reaction import Reaction
from app.models.session import AuthSession
from app.models.user import User

__all__ = [
    "Attachment",
    "AuthSession",
    "Contact",
    "Conversation",
    "ConversationMember",
    "HiddenMessage",
    "Message",
    "MessageReceipt",
    "Reaction",
    "User",
]

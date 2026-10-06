from datetime import datetime

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.models.conversation import Conversation
from app.models.types import UTCDateTime, utcnow
from app.models.user import User


class ConversationMember(Base):
    """Membership + per-user conversation state (read pointer, mute, archive).

    Leaving or being removed sets `left_at`; the row is never deleted so history stays visible.
    """

    __tablename__ = "conversation_members"

    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[str] = mapped_column(String(10), default="member")  # 'admin' | 'member'
    joined_at: Mapped[datetime] = mapped_column(UTCDateTime, default=utcnow)
    left_at: Mapped[datetime | None] = mapped_column(UTCDateTime)
    # Plain integer (not an FK) so an expired/deleted message never breaks the read pointer.
    last_read_message_id: Mapped[int | None] = mapped_column()
    muted_until: Mapped[datetime | None] = mapped_column(UTCDateTime)
    archived: Mapped[bool] = mapped_column(default=False)

    conversation: Mapped[Conversation] = relationship(back_populates="members")
    user: Mapped[User] = relationship()

    @property
    def is_active(self) -> bool:
        return self.left_at is None

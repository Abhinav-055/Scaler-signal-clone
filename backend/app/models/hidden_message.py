from sqlalchemy import ForeignKey
from sqlalchemy.orm import Mapped, mapped_column

from app.db import Base


class HiddenMessage(Base):
    """'Delete for me': hides one message for one user without changing anyone else's view.

    Not in the original schema; added because "delete for me" is per-user state.
    """

    __tablename__ = "hidden_messages"

    message_id: Mapped[int] = mapped_column(ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)

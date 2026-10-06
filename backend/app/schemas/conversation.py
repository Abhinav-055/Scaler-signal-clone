from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.schemas.message import MessageOut
from app.schemas.user import UserOut

# Allowed disappearing-message timers (seconds): 30s, 5m, 1h, 1d, 1w. None = off.
DISAPPEARING_OPTIONS = {30, 300, 3600, 86400, 604800}


class MemberOut(BaseModel):
    user: UserOut
    role: str
    joined_at: datetime
    left_at: datetime | None


class ConversationOut(BaseModel):
    id: int
    type: str
    name: str | None
    avatar_url: str | None
    description: str | None
    created_by: int | None
    disappearing_seconds: int | None
    last_message_at: datetime
    created_at: datetime
    members: list[MemberOut]
    # Per-user fields (they differ for every member of the conversation):
    unread_count: int
    last_message: MessageOut | None
    last_read_message_id: int | None
    muted_until: datetime | None
    archived: bool
    my_role: str
    is_active_member: bool


class ConversationCreate(BaseModel):
    type: Literal["direct", "group"]
    # direct
    user_id: int | None = None
    # group
    name: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=280)
    avatar_url: str | None = Field(default=None, max_length=500)
    member_ids: list[int] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def check_shape(self) -> "ConversationCreate":
        if self.type == "direct" and self.user_id is None:
            raise ValueError("user_id is required for a direct conversation")
        if self.type == "group":
            if not self.name or not self.name.strip():
                raise ValueError("A group needs a name")
            if not self.member_ids:
                raise ValueError("A group needs at least one other member")
        return self


class ConversationUpdate(BaseModel):
    """PATCH /conversations/{id}. Group fields need admin; mute/archive only affect me."""

    name: str | None = Field(default=None, min_length=1, max_length=64)
    description: str | None = Field(default=None, max_length=280)
    avatar_url: str | None = Field(default=None, max_length=500)
    disappearing_seconds: int | None = None
    muted_until: datetime | None = None
    archived: bool | None = None

    @model_validator(mode="after")
    def check_timer(self) -> "ConversationUpdate":
        if self.disappearing_seconds is not None and self.disappearing_seconds not in DISAPPEARING_OPTIONS:
            raise ValueError("Unsupported disappearing timer")
        return self


class MembersAdd(BaseModel):
    user_ids: list[int] = Field(min_length=1, max_length=100)


class MemberUpdate(BaseModel):
    role: Literal["admin", "member"]


class MarkRead(BaseModel):
    message_id: int

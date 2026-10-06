from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    phone: str
    username: str | None
    display_name: str
    avatar_url: str | None
    about: str
    avatar_color: str
    last_seen_at: datetime
    # Filled in from the WebSocket ConnectionManager, not stored in the DB.
    online: bool = False


class UserUpdate(BaseModel):
    """PATCH /users/me. Only fields that are present in the request are changed."""

    display_name: str | None = Field(default=None, min_length=1, max_length=64)
    about: str | None = Field(default=None, max_length=140)
    username: str | None = Field(default=None, max_length=32, pattern=r"^[a-zA-Z0-9_.]{3,32}$")
    avatar_url: str | None = Field(default=None, max_length=500)
    avatar_public_id: str | None = Field(default=None, max_length=255)

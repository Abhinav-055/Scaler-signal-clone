from datetime import datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.user import UserOut


class ContactOut(BaseModel):
    user: UserOut
    nickname: str | None
    created_at: datetime


class ContactCreate(BaseModel):
    """Add a contact by user id, phone number or username (exactly one is needed)."""

    user_id: int | None = None
    phone: str | None = None
    username: str | None = None
    nickname: str | None = Field(default=None, max_length=64)

    @model_validator(mode="after")
    def one_identifier(self) -> "ContactCreate":
        if not (self.user_id or self.phone or self.username):
            raise ValueError("Provide user_id, phone or username")
        return self

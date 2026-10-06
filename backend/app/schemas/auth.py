from pydantic import BaseModel, Field

from app.schemas.user import UserOut

# E.164: "+" followed by 8-15 digits, e.g. +919876543210
PHONE_PATTERN = r"^\+[1-9]\d{7,14}$"


class OtpRequest(BaseModel):
    phone: str = Field(pattern=PHONE_PATTERN)


class OtpRequestResponse(BaseModel):
    sent: bool
    is_new_user: bool
    hint: str


class OtpVerify(BaseModel):
    phone: str = Field(pattern=PHONE_PATTERN)
    code: str = Field(min_length=6, max_length=6)


class AuthResponse(BaseModel):
    token: str
    user: UserOut
    is_new_user: bool

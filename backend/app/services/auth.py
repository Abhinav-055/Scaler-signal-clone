"""Phone + OTP login. The OTP is mocked: it is always settings.fixed_otp (env FIXED_OTP)."""

import secrets
from datetime import timedelta

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import AuthSession, User
from app.models.types import utcnow
from app.services.errors import BadRequest, Unauthorized

# Pastel avatar colour names; the frontend maps each name to light/dark CSS tokens.
AVATAR_COLORS = [
    "blue", "teal", "green", "olive", "orange", "red",
    "pink", "purple", "violet", "indigo", "taupe", "steel",
]  # fmt: skip


def avatar_color_for(seed: str) -> str:
    """Stable colour: the same phone number always gets the same colour."""
    return AVATAR_COLORS[sum(ord(c) for c in seed) % len(AVATAR_COLORS)]


def request_otp(db: Session, phone: str) -> bool:
    """Pretend to send an SMS. Returns whether this phone number is new to us."""
    return db.scalar(select(User.id).where(User.phone == phone)) is None


def verify_otp(db: Session, phone: str, code: str) -> tuple[AuthSession, bool]:
    settings = get_settings()
    if not secrets.compare_digest(code, settings.fixed_otp):
        raise BadRequest("Incorrect code. Please try again.")

    user = db.scalar(select(User).where(User.phone == phone))
    is_new = user is None
    if user is None:
        user = User(phone=phone, display_name="", avatar_color=avatar_color_for(phone))
        db.add(user)
        db.flush()  # assigns user.id

    session = AuthSession(
        user_id=user.id,
        token=secrets.token_urlsafe(32),
        expires_at=utcnow() + timedelta(days=settings.session_days),
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return session, is_new


def user_for_token(db: Session, token: str) -> User:
    session = db.scalar(select(AuthSession).where(AuthSession.token == token))
    if session is None or session.expires_at < utcnow():
        raise Unauthorized("Session expired. Please log in again.")
    return session.user


def logout(db: Session, token: str) -> None:
    db.execute(delete(AuthSession).where(AuthSession.token == token))
    db.commit()

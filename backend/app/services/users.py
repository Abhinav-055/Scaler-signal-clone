from sqlalchemy import or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import ConversationMember, User
from app.schemas.user import UserUpdate
from app.services.errors import BadRequest, Conflict


def update_profile(db: Session, user: User, data: UserUpdate) -> tuple[User, str | None]:
    """Apply a partial update. Returns the user and the old avatar public_id if it was replaced."""
    old_public_id = None
    fields = data.model_dump(exclude_unset=True)
    if "avatar_url" in fields:
        # Changing (or removing) the photo: remember the old Cloudinary asset so it can be deleted.
        new_public_id = fields.get("avatar_public_id")
        if user.avatar_public_id and user.avatar_public_id != new_public_id:
            old_public_id = user.avatar_public_id
        fields["avatar_public_id"] = new_public_id
    if fields.get("username") is not None:
        fields["username"] = fields["username"].lower()
    if "display_name" in fields and not (fields["display_name"] or "").strip():
        raise BadRequest("Name can't be empty")
    for key, value in fields.items():
        setattr(user, key, value.strip() if isinstance(value, str) else value)
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise Conflict("That username is already taken") from exc
    db.refresh(user)
    return user, old_public_id


def search_users(db: Session, me: User, q: str, limit: int = 20) -> list[User]:
    q = q.strip()
    if not q:
        return []
    like = f"%{q.lower()}%"
    digits = "".join(c for c in q if c.isdigit())
    conditions = [User.display_name.ilike(like), User.username.ilike(like)]
    if len(digits) >= 3:
        conditions.append(User.phone.contains(digits))
    return list(
        db.scalars(
            select(User)
            .where(User.id != me.id, User.display_name != "", or_(*conditions))
            .order_by(User.display_name)
            .limit(limit)
        )
    )


def related_user_ids(db: Session, user_id: int) -> set[int]:
    """Everyone who currently shares a conversation with this user (presence audience)."""
    my_convs = select(ConversationMember.conversation_id).where(
        ConversationMember.user_id == user_id, ConversationMember.left_at.is_(None)
    )
    rows = db.scalars(
        select(ConversationMember.user_id)
        .where(
            ConversationMember.conversation_id.in_(my_convs),
            ConversationMember.left_at.is_(None),
            ConversationMember.user_id != user_id,
        )
        .distinct()
    )
    return set(rows)

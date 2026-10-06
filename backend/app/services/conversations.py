"""Conversations (direct + group), membership and group permissions."""

import uuid
from collections.abc import Sequence

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session, aliased

from app.models import Conversation, ConversationMember, Message, User
from app.models.types import utcnow
from app.schemas.conversation import ConversationCreate, ConversationOut, ConversationUpdate
from app.services.errors import BadRequest, Forbidden, NotFound
from app.services.presenters import conversation_out
from app.services.queries import (
    conversation_load_options,
    get_active_membership,
    get_membership,
    message_load_options,
    visible_to_member,
)

DISAPPEARING_LABELS = {
    30: "30 seconds",
    300: "5 minutes",
    3600: "1 hour",
    86400: "1 day",
    604800: "1 week",
}


# ---------------------------------------------------------------- reading


def build_outs(db: Session, me_id: int, memberships: Sequence[ConversationMember]) -> list[ConversationOut]:
    """Serialize many conversations for one user with a constant number of queries."""
    if not memberships:
        return []
    conv_ids = [m.conversation_id for m in memberships]
    viewer = and_(
        ConversationMember.conversation_id == Message.conversation_id,
        ConversationMember.user_id == me_id,
    )

    # 1) id of the newest visible message per conversation
    last_ids: dict[int, int] = dict(
        db.execute(
            select(Message.conversation_id, func.max(Message.id))
            .join(ConversationMember, viewer)
            .where(Message.conversation_id.in_(conv_ids), visible_to_member())
            .group_by(Message.conversation_id)
        ).all()
    )
    # 2) those messages, with their attachments/reactions/receipts eagerly loaded
    last_messages = {
        m.conversation_id: m
        for m in db.scalars(
            select(Message).where(Message.id.in_(last_ids.values())).options(*message_load_options())
        )
    }
    # 3) unread count per conversation: newer than my read pointer and not sent by me
    unread: dict[int, int] = dict(
        db.execute(
            select(Message.conversation_id, func.count(Message.id))
            .join(ConversationMember, viewer)
            .where(
                Message.conversation_id.in_(conv_ids),
                visible_to_member(),
                Message.id > func.coalesce(ConversationMember.last_read_message_id, 0),
                or_(Message.sender_id != me_id, Message.sender_id.is_(None)),
                Message.type != "system",
            )
            .group_by(Message.conversation_id)
        ).all()
    )

    outs = [
        conversation_out(m, last_messages.get(m.conversation_id), unread.get(m.conversation_id, 0))
        for m in memberships
    ]
    outs.sort(key=lambda c: c.last_message_at, reverse=True)
    return outs


def list_conversations(db: Session, me: User) -> list[ConversationOut]:
    memberships = db.scalars(
        select(ConversationMember)
        .where(ConversationMember.user_id == me.id)
        .options(*conversation_load_options())
    ).all()
    return build_outs(db, me.id, memberships)


def conversation_for_user(db: Session, conversation_id: int, user_id: int) -> ConversationOut:
    member = get_membership(db, conversation_id, user_id)
    return build_outs(db, user_id, [member])[0]


# ---------------------------------------------------------------- helpers


def add_system_message(db: Session, conv: Conversation, actor_id: int, body: str) -> Message:
    """Group events ("Asha added Rahul") are stored as ordinary messages of type 'system'."""
    now = utcnow()
    msg = Message(
        conversation_id=conv.id,
        sender_id=actor_id,
        client_id=f"sys-{uuid.uuid4()}",
        type="system",
        body=body,
        created_at=now,
    )
    db.add(msg)
    conv.last_message_at = now
    return msg


def _require_group_admin(member: ConversationMember) -> None:
    if member.conversation.type != "group":
        raise BadRequest("Only groups have members to manage")
    if member.role != "admin":
        raise Forbidden("Only group admins can do that")


def _name(user: User) -> str:
    return user.display_name or user.phone


def _join_names(names: list[str]) -> str:
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + " and " + names[-1]


def _load_real_users(db: Session, user_ids: Sequence[int]) -> list[User]:
    users = list(db.scalars(select(User).where(User.id.in_(set(user_ids)), User.display_name != "")))
    if len(users) != len(set(user_ids)):
        raise NotFound("One or more users were not found")
    return users


def find_direct(db: Session, a: int, b: int) -> Conversation | None:
    m1, m2 = aliased(ConversationMember), aliased(ConversationMember)
    return db.scalar(
        select(Conversation)
        .join(m1, m1.conversation_id == Conversation.id)
        .join(m2, m2.conversation_id == Conversation.id)
        .where(Conversation.type == "direct", m1.user_id == a, m2.user_id == b)
    )


# ---------------------------------------------------------------- writing


def create_conversation(db: Session, me: User, data: ConversationCreate) -> tuple[int, list[Message]]:
    """Returns (conversation_id, system messages created)."""
    if data.type == "direct":
        assert data.user_id is not None
        if data.user_id == me.id:
            raise BadRequest("You can't start a chat with yourself")
        _load_real_users(db, [data.user_id])
        existing = find_direct(db, me.id, data.user_id)  # only one direct chat per pair
        if existing is not None:
            return existing.id, []
        conv = Conversation(type="direct", created_by=me.id)
        conv.members = [
            ConversationMember(user_id=me.id, role="member"),
            ConversationMember(user_id=data.user_id, role="member"),
        ]
        db.add(conv)
        db.commit()
        return conv.id, []

    others = [uid for uid in dict.fromkeys(data.member_ids) if uid != me.id]
    users = _load_real_users(db, others)
    now = utcnow()
    conv = Conversation(
        type="group",
        name=(data.name or "").strip(),
        description=(data.description or "").strip() or None,
        avatar_url=data.avatar_url,
        created_by=me.id,
        created_at=now,
        last_message_at=now,
    )
    conv.members = [ConversationMember(user_id=me.id, role="admin", joined_at=now)] + [
        ConversationMember(user_id=u.id, role="member", joined_at=now) for u in users
    ]
    db.add(conv)
    db.flush()
    msgs = [
        add_system_message(db, conv, me.id, f"{_name(me)} created the group “{conv.name}”"),
        add_system_message(db, conv, me.id, f"{_name(me)} added {_join_names([_name(u) for u in users])}"),
    ]
    db.commit()
    return conv.id, msgs


def update_conversation(
    db: Session, me: User, conversation_id: int, data: ConversationUpdate
) -> list[Message]:
    member = get_membership(db, conversation_id, me.id)
    conv = member.conversation
    fields = data.model_fields_set
    msgs: list[Message] = []

    # Personal settings: only affect my membership row.
    if "muted_until" in fields:
        member.muted_until = data.muted_until
    if "archived" in fields and data.archived is not None:
        member.archived = data.archived

    group_fields = fields & {"name", "description", "avatar_url"}
    if (group_fields or "disappearing_seconds" in fields) and member.left_at is not None:
        raise Forbidden("You are no longer a member of this conversation")

    if group_fields:
        _require_group_admin(member)
        if "name" in fields and data.name and data.name.strip() != conv.name:
            conv.name = data.name.strip()
            msgs.append(
                add_system_message(db, conv, me.id, f"{_name(me)} changed the group name to “{conv.name}”")
            )
        if "description" in fields and (data.description or None) != conv.description:
            conv.description = (data.description or "").strip() or None
            msgs.append(add_system_message(db, conv, me.id, f"{_name(me)} updated the group description"))
        if "avatar_url" in fields and data.avatar_url != conv.avatar_url:
            conv.avatar_url = data.avatar_url
            msgs.append(add_system_message(db, conv, me.id, f"{_name(me)} changed the group photo"))

    if "disappearing_seconds" in fields and data.disappearing_seconds != conv.disappearing_seconds:
        if conv.type == "group" and member.role != "admin":
            raise Forbidden("Only group admins can change the disappearing message timer")
        conv.disappearing_seconds = data.disappearing_seconds
        if data.disappearing_seconds:
            label = DISAPPEARING_LABELS[data.disappearing_seconds]
            body = f"{_name(me)} set the disappearing message timer to {label}"
        else:
            body = f"{_name(me)} turned off disappearing messages"
        msgs.append(add_system_message(db, conv, me.id, body))

    db.commit()
    return msgs


def add_members(db: Session, me: User, conversation_id: int, user_ids: list[int]) -> list[Message]:
    member = get_active_membership(db, conversation_id, me.id)
    _require_group_admin(member)
    conv = member.conversation
    users = _load_real_users(db, [u for u in user_ids if u != me.id])
    by_id = {m.user_id: m for m in conv.members}
    now = utcnow()
    added: list[User] = []
    for user in users:
        existing = by_id.get(user.id)
        if existing is not None and existing.left_at is None:
            continue  # already in the group
        if existing is not None:
            # Re-adding a former member: they only see messages from now on.
            existing.left_at = None
            existing.joined_at = now
            existing.role = "member"
            existing.last_read_message_id = None
        else:
            conv.members.append(ConversationMember(user_id=user.id, role="member", joined_at=now))
        added.append(user)
    if not added:
        raise BadRequest("Those people are already in the group")
    msg = add_system_message(db, conv, me.id, f"{_name(me)} added {_join_names([_name(u) for u in added])}")
    db.commit()
    return [msg]


def remove_member(db: Session, me: User, conversation_id: int, user_id: int) -> list[Message]:
    """Admins can remove anyone; any member can remove themselves (= leave the group)."""
    member = get_active_membership(db, conversation_id, me.id)
    conv = member.conversation
    if conv.type != "group":
        raise BadRequest("You can't leave a direct conversation")
    target = next((m for m in conv.members if m.user_id == user_id and m.left_at is None), None)
    if target is None:
        raise NotFound("That person is not in this group")
    leaving = user_id == me.id
    if not leaving:
        _require_group_admin(member)

    body = f"{_name(me)} left the group" if leaving else f"{_name(me)} removed {_name(target.user)}"
    msg = add_system_message(db, conv, me.id, body)
    # Same timestamp as the system message, so the removed person still sees that last notice.
    target.left_at = msg.created_at
    target.role = "member"

    # Never leave a group without an admin: promote the longest-standing member.
    remaining = [m for m in conv.members if m.left_at is None]
    if remaining and not any(m.role == "admin" for m in remaining):
        min(remaining, key=lambda m: m.joined_at).role = "admin"

    db.commit()
    return [msg]


def set_member_role(db: Session, me: User, conversation_id: int, user_id: int, role: str) -> list[Message]:
    member = get_active_membership(db, conversation_id, me.id)
    _require_group_admin(member)
    conv = member.conversation
    target = next((m for m in conv.members if m.user_id == user_id and m.left_at is None), None)
    if target is None:
        raise NotFound("That person is not in this group")
    if target.role == role:
        return []
    if role == "member" and sum(1 for m in conv.members if m.left_at is None and m.role == "admin") == 1:
        raise BadRequest("A group needs at least one admin")
    target.role = role
    verb = "made {} an admin" if role == "admin" else "removed {} as an admin"
    msg = add_system_message(db, conv, me.id, f"{_name(me)} {verb.format(_name(target.user))}")
    db.commit()
    return [msg]


def mark_read_pointer(db: Session, me: User, conversation_id: int, message_id: int) -> None:
    """Advance my read pointer without sending read receipts (used when receipts are disabled)."""
    member = get_membership(db, conversation_id, me.id)
    if (member.last_read_message_id or 0) < message_id:
        member.last_read_message_id = message_id
        db.commit()

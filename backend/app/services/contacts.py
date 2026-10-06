from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Contact, User
from app.schemas.contact import ContactCreate
from app.services.errors import BadRequest, NotFound


def list_contacts(db: Session, me: User) -> list[Contact]:
    return list(
        db.scalars(select(Contact).where(Contact.owner_id == me.id).options(selectinload(Contact.contact)))
    )


def add_contact(db: Session, me: User, data: ContactCreate) -> Contact:
    if data.user_id is not None:
        target = db.get(User, data.user_id)
    elif data.phone:
        target = db.scalar(select(User).where(User.phone == data.phone.replace(" ", "")))
    else:
        username = (data.username or "").lstrip("@").lower()
        target = db.scalar(select(User).where(User.username == username))
    if target is None or not target.display_name:
        raise NotFound("No Signal user found")
    if target.id == me.id:
        raise BadRequest("You can't add yourself as a contact")

    contact = db.get(Contact, (me.id, target.id))
    if contact is None:
        contact = Contact(owner_id=me.id, contact_id=target.id)
        db.add(contact)
    if data.nickname is not None:
        contact.nickname = data.nickname.strip() or None
    db.commit()
    db.refresh(contact)
    return contact


def remove_contact(db: Session, me: User, contact_id: int) -> None:
    contact = db.get(Contact, (me.id, contact_id))
    if contact is None:
        raise NotFound("Contact not found")
    db.delete(contact)
    db.commit()

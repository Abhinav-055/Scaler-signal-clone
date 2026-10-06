from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.models import Contact
from app.schemas.contact import ContactCreate, ContactOut
from app.services import contacts as contact_service
from app.services.presenters import user_out

router = APIRouter(prefix="/contacts", tags=["contacts"])


def _out(c: Contact) -> ContactOut:
    return ContactOut(user=user_out(c.contact), nickname=c.nickname, created_at=c.created_at)


@router.get("", response_model=list[ContactOut])
def list_contacts(db: DB, user: CurrentUser) -> list[ContactOut]:
    return [_out(c) for c in contact_service.list_contacts(db, user)]


@router.post("", response_model=ContactOut, status_code=201)
def add_contact(body: ContactCreate, db: DB, user: CurrentUser) -> ContactOut:
    return _out(contact_service.add_contact(db, user, body))


@router.delete("/{contact_id}", status_code=204)
def remove_contact(contact_id: int, db: DB, user: CurrentUser) -> None:
    contact_service.remove_contact(db, user, contact_id)

from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.schemas.message import MessageInfo, ReactionOut, ReactionSet
from app.services import messages as msg_service
from app.ws import broadcast

router = APIRouter(prefix="/messages", tags=["messages"])


@router.put("/{message_id}/reactions", response_model=list[ReactionOut])
async def set_reaction(message_id: int, body: ReactionSet, db: DB, user: CurrentUser) -> list[ReactionOut]:
    msg = msg_service.set_reaction(db, user, message_id, body.emoji)
    await broadcast.reactions_changed(db, msg)
    return msg_service.reactions_out(msg)


@router.delete("/{message_id}/reactions", response_model=list[ReactionOut])
async def remove_reaction(message_id: int, db: DB, user: CurrentUser) -> list[ReactionOut]:
    msg = msg_service.remove_reaction(db, user, message_id)
    await broadcast.reactions_changed(db, msg)
    return msg_service.reactions_out(msg)


@router.get("/{message_id}/info", response_model=MessageInfo)
def message_info(message_id: int, db: DB, user: CurrentUser) -> MessageInfo:
    return msg_service.message_info(db, user, message_id)


@router.delete("/{message_id}", status_code=204)
def delete_for_me(message_id: int, db: DB, user: CurrentUser) -> None:
    msg_service.hide_message(db, user, message_id)

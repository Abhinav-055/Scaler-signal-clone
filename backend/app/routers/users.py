import asyncio

from fastapi import APIRouter, Query

from app.deps import DB, CurrentUser
from app.schemas.user import UserOut, UserUpdate
from app.services import users as user_service
from app.services.cloudinary_service import delete_assets
from app.services.presenters import user_out

router = APIRouter(prefix="/users", tags=["users"])


@router.patch("/me", response_model=UserOut)
async def update_me(body: UserUpdate, db: DB, user: CurrentUser) -> UserOut:
    user, old_public_id = user_service.update_profile(db, user, body)
    if old_public_id:
        # Don't make the user wait for Cloudinary; delete the old photo in the background.
        asyncio.create_task(asyncio.to_thread(delete_assets, [(old_public_id, "image")]))
    return user_out(user)


@router.get("/search", response_model=list[UserOut])
def search(db: DB, user: CurrentUser, q: str = Query("", max_length=64)) -> list[UserOut]:
    return [user_out(u) for u in user_service.search_users(db, user, q)]

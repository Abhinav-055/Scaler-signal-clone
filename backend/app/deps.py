"""FastAPI dependencies shared by the routers."""

from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.db import get_db
from app.models import User
from app.services.auth import user_for_token
from app.services.errors import Unauthorized

bearer = HTTPBearer(auto_error=False)

DB = Annotated[Session, Depends(get_db)]


def get_token(
    creds: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
) -> str:
    if creds is None:
        raise Unauthorized("Missing bearer token")
    return creds.credentials


def get_current_user(db: DB, token: Annotated[str, Depends(get_token)]) -> User:
    return user_for_token(db, token)


CurrentUser = Annotated[User, Depends(get_current_user)]
Token = Annotated[str, Depends(get_token)]

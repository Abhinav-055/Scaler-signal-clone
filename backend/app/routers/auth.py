from fastapi import APIRouter

from app.deps import DB, CurrentUser, Token
from app.schemas.auth import AuthResponse, OtpRequest, OtpRequestResponse, OtpVerify
from app.schemas.user import UserOut
from app.services import auth as auth_service
from app.services.presenters import user_out

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/request-otp", response_model=OtpRequestResponse)
def request_otp(body: OtpRequest, db: DB) -> OtpRequestResponse:
    is_new = auth_service.request_otp(db, body.phone)
    return OtpRequestResponse(
        sent=True, is_new_user=is_new, hint="Demo mode: the code is fixed by the server"
    )


@router.post("/verify-otp", response_model=AuthResponse)
def verify_otp(body: OtpVerify, db: DB) -> AuthResponse:
    session, is_new = auth_service.verify_otp(db, body.phone, body.code)
    return AuthResponse(token=session.token, user=user_out(session.user), is_new_user=is_new)


@router.post("/logout", status_code=204)
def logout(db: DB, token: Token) -> None:
    auth_service.logout(db, token)


@router.get("/me", response_model=UserOut)
def me(user: CurrentUser) -> UserOut:
    return user_out(user)

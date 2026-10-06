from fastapi import APIRouter

from app.deps import DB, CurrentUser
from app.models import Attachment, Message
from app.schemas.attachment import DownloadResponse, SignRequest, SignResponse
from app.services.cloudinary_service import sign_upload, signed_download_url
from app.services.errors import NotFound
from app.services.queries import get_membership

router = APIRouter(prefix="/attachments", tags=["attachments"])


@router.post("/sign", response_model=SignResponse)
def sign(body: SignRequest, user: CurrentUser) -> SignResponse:
    """Return a signature so the browser can upload this file directly to Cloudinary."""
    return sign_upload(body)


@router.get("/{attachment_id}/download", response_model=DownloadResponse)
def download(attachment_id: int, db: DB, user: CurrentUser) -> DownloadResponse:
    """Short-lived signed link to download a file. Only members of the conversation get one."""
    attachment = db.get(Attachment, attachment_id)
    message = db.get(Message, attachment.message_id) if attachment else None
    if attachment is None or message is None:
        raise NotFound("File not found")
    get_membership(db, message.conversation_id, user.id)  # 404 if never a member
    return DownloadResponse(
        url=signed_download_url(attachment.public_id, attachment.resource_type, attachment.secure_url)
    )

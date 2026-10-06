"""Cloudinary integration: sign direct browser uploads and delete assets.

The browser uploads bytes straight to Cloudinary using a short-lived signature we
generate here, so file data never passes through (or is stored by) our backend.
"""

import logging
import time

import cloudinary
import cloudinary.uploader
import cloudinary.utils

from app.config import get_settings
from app.schemas.attachment import SignRequest, SignResponse
from app.services.errors import BadRequest, Unavailable

logger = logging.getLogger(__name__)

MB = 1024 * 1024
AVATAR_MAX_BYTES = 5 * MB
ATTACHMENT_MAX_BYTES = 25 * MB

IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
FILE_MIME_TYPES = {
    "application/pdf",
    "application/zip",
    "application/x-zip-compressed",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "text/csv",
    "application/json",
    "audio/mpeg",
    "audio/ogg",
    "audio/wav",
}
# Videos are uploaded as Cloudinary "video" (not "raw"): raw files are capped at 10 MB on free
# plans and can't be streamed, so videos failed to upload and showed only as file cards.
VIDEO_MIME_TYPES = {
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-matroska",
    "video/x-msvideo",
    "video/3gpp",
    "video/ogg",
}


def _configure() -> None:
    s = get_settings()
    if not s.cloudinary_enabled:
        raise Unavailable("File uploads are not configured on this server")
    cloudinary.config(
        cloud_name=s.cloudinary_cloud_name,
        api_key=s.cloudinary_api_key,
        api_secret=s.cloudinary_api_secret,
        secure=True,
    )


def sign_upload(req: SignRequest) -> SignResponse:
    """Validate what the user wants to upload, then return a signature for it."""
    if req.kind == "avatar":
        if req.mime_type not in IMAGE_MIME_TYPES:
            raise BadRequest("Profile photos must be JPEG, PNG, WebP or GIF")
        if req.size_bytes > AVATAR_MAX_BYTES:
            raise BadRequest("Profile photos must be 5 MB or smaller")
    else:
        if req.mime_type not in IMAGE_MIME_TYPES | VIDEO_MIME_TYPES | FILE_MIME_TYPES:
            raise BadRequest("This file type is not supported")
        if req.size_bytes > ATTACHMENT_MAX_BYTES:
            raise BadRequest("Attachments must be 25 MB or smaller")

    _configure()
    s = get_settings()
    # Images as "image" (Cloudinary can resize them), videos as "video" (streamable),
    # everything else as "raw".
    if req.mime_type in IMAGE_MIME_TYPES:
        resource_type = "image"
    elif req.mime_type in VIDEO_MIME_TYPES:
        resource_type = "video"
    else:
        resource_type = "raw"
    folder = f"signal-clone/{req.kind}s"
    timestamp = int(time.time())
    # Only these params are signed; the browser must send exactly the same values.
    signature = cloudinary.utils.api_sign_request(
        {"folder": folder, "timestamp": timestamp}, s.cloudinary_api_secret
    )
    return SignResponse(
        upload_url=f"https://api.cloudinary.com/v1_1/{s.cloudinary_cloud_name}/{resource_type}/upload",
        cloud_name=s.cloudinary_cloud_name,
        api_key=s.cloudinary_api_key,
        timestamp=timestamp,
        signature=signature,
        folder=folder,
        resource_type=resource_type,
    )


def is_our_asset(secure_url: str, public_id: str) -> bool:
    """Reject attachment metadata that does not point at our own Cloudinary account."""
    s = get_settings()
    prefix = "https://res.cloudinary.com/"
    if s.cloudinary_cloud_name:
        prefix += s.cloudinary_cloud_name + "/"
    return secure_url.startswith(prefix) and public_id.startswith("signal-clone/")


DOWNLOAD_URL_TTL_SECONDS = 300


def signed_download_url(public_id: str, resource_type: str, fallback_url: str) -> str:
    """Short-lived, signed download link that goes through Cloudinary's API.

    New Cloudinary accounts block public delivery of PDF/ZIP files ("deny or ACL failure"),
    so the plain secure_url fails for them. A signed download URL is authorised by our API key
    instead, works for every file type, and expires after a few minutes.
    Files not hosted in our account (e.g. seed data) just use their normal URL.
    """
    if not get_settings().cloudinary_enabled or not public_id.startswith("signal-clone/"):
        return fallback_url
    _configure()
    return cloudinary.utils.private_download_url(
        public_id,
        "",  # raw public_ids already include the extension; images keep their original format
        resource_type=resource_type,
        type="upload",
        expires_at=int(time.time()) + DOWNLOAD_URL_TTL_SECONDS,
        attachment=True,  # Content-Disposition: attachment -> the browser saves the file
    )


def delete_assets(assets: list[tuple[str, str]]) -> None:
    """Best-effort delete of (public_id, resource_type) pairs. Blocking; run it in a thread."""
    if not assets or not get_settings().cloudinary_enabled:
        return
    _configure()
    for public_id, resource_type in assets:
        try:
            cloudinary.uploader.destroy(public_id, resource_type=resource_type, invalidate=True)
        except Exception:
            logger.warning("Could not delete Cloudinary asset %s", public_id, exc_info=True)

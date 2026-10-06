from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class AttachmentIn(BaseModel):
    """What the browser sends after a successful direct upload to Cloudinary."""

    public_id: str = Field(max_length=255)
    secure_url: str = Field(max_length=500)
    resource_type: Literal["image", "video", "raw"]
    file_name: str = Field(max_length=255)
    mime_type: str = Field(max_length=100)
    size_bytes: int = Field(ge=0)
    width: int | None = None
    height: int | None = None


class AttachmentOut(AttachmentIn):
    model_config = ConfigDict(from_attributes=True)

    id: int


class SignRequest(BaseModel):
    kind: Literal["avatar", "attachment"]
    mime_type: str = Field(max_length=100)
    size_bytes: int = Field(gt=0)


class DownloadResponse(BaseModel):
    url: str


class SignResponse(BaseModel):
    """Everything the browser needs to POST the file straight to Cloudinary."""

    upload_url: str
    cloud_name: str
    api_key: str
    timestamp: int
    signature: str
    folder: str
    resource_type: Literal["image", "video", "raw"]

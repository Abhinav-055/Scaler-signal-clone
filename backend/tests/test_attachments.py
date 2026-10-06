from collections.abc import Iterator

import pytest

from app.config import get_settings
from tests.conftest import Account

MB = 1024 * 1024


@pytest.fixture
def cloudinary_configured(monkeypatch: pytest.MonkeyPatch) -> Iterator[None]:
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "demo-cloud")
    monkeypatch.setenv("CLOUDINARY_API_KEY", "key123")
    monkeypatch.setenv("CLOUDINARY_API_SECRET", "secret456")
    get_settings.cache_clear()
    yield
    monkeypatch.delenv("CLOUDINARY_API_KEY")
    monkeypatch.delenv("CLOUDINARY_API_SECRET")
    monkeypatch.setenv("CLOUDINARY_CLOUD_NAME", "")
    get_settings.cache_clear()


def test_sign_returns_503_when_not_configured(alice: Account) -> None:
    alice.post(
        "/attachments/sign", {"kind": "attachment", "mime_type": "image/png", "size_bytes": 100}, expect=503
    )


def test_sign_validates_type_and_size(alice: Account, cloudinary_configured: None) -> None:
    alice.post(
        "/attachments/sign", {"kind": "avatar", "mime_type": "application/pdf", "size_bytes": 10}, expect=400
    )
    alice.post(
        "/attachments/sign", {"kind": "avatar", "mime_type": "image/png", "size_bytes": 6 * MB}, expect=400
    )
    alice.post(
        "/attachments/sign",
        {"kind": "attachment", "mime_type": "application/x-msdownload", "size_bytes": 10},
        expect=400,
    )
    alice.post(
        "/attachments/sign",
        {"kind": "attachment", "mime_type": "video/mp4", "size_bytes": 26 * MB},
        expect=400,
    )


def test_sign_returns_signature(alice: Account, cloudinary_configured: None) -> None:
    image = alice.post(
        "/attachments/sign", {"kind": "attachment", "mime_type": "image/jpeg", "size_bytes": 2 * MB}
    )
    assert image["resource_type"] == "image"
    assert image["upload_url"] == "https://api.cloudinary.com/v1_1/demo-cloud/image/upload"
    assert image["folder"] == "signal-clone/attachments"
    assert len(image["signature"]) == 40  # SHA-1 hex

    pdf = alice.post(
        "/attachments/sign", {"kind": "attachment", "mime_type": "application/pdf", "size_bytes": MB}
    )
    assert pdf["resource_type"] == "raw"


def test_attachment_must_point_at_our_cloudinary(
    alice: Account, bob: Account, cloudinary_configured: None
) -> None:
    conv_id = alice.direct_with(bob)
    attachment = {
        "public_id": "signal-clone/attachments/x",
        "secure_url": "https://evil.example.com/x.png",
        "resource_type": "image",
        "file_name": "x.png",
        "mime_type": "image/png",
        "size_bytes": 10,
    }
    with alice.ws() as ws:
        ws.send_json(
            {
                "type": "message.send",
                "payload": {
                    "client_id": "client-id-3001",
                    "conversation_id": conv_id,
                    "attachments": [attachment],
                },
            }
        )
        error = ws.receive_json()
        assert error["type"] == "error"

        attachment["secure_url"] = (
            "https://res.cloudinary.com/demo-cloud/image/upload/v1/signal-clone/attachments/x.png"
        )
        ws.send_json(
            {
                "type": "message.send",
                "payload": {
                    "client_id": "client-id-3002",
                    "conversation_id": conv_id,
                    "attachments": [attachment],
                },
            }
        )
        ack = ws.receive_json()
    assert ack["type"] == "message.ack"
    assert ack["payload"]["message"]["type"] == "image"


def test_download_link_is_signed_and_members_only(
    alice: Account, bob: Account, carol: Account, cloudinary_configured: None
) -> None:
    conv_id = alice.direct_with(bob)
    pdf = {
        "public_id": "signal-clone/attachments/report.pdf",
        "secure_url": "https://res.cloudinary.com/demo-cloud/raw/upload/v1/signal-clone/attachments/report.pdf",
        "resource_type": "raw",
        "file_name": "report.pdf",
        "mime_type": "application/pdf",
        "size_bytes": 1234,
    }
    with alice.ws() as ws:
        ws.send_json(
            {
                "type": "message.send",
                "payload": {"client_id": "client-id-3003", "conversation_id": conv_id, "attachments": [pdf]},
            }
        )
        attachment_id = ws.receive_json()["payload"]["message"]["attachments"][0]["id"]

    url = bob.get(f"/attachments/{attachment_id}/download")["url"]
    # Signed API download (works even when public PDF delivery is blocked), not the public URL.
    assert url.startswith("https://api.cloudinary.com/v1_1/demo-cloud/raw/download?")
    assert "signature=" in url and "expires_at=" in url

    res = carol.client.get(f"/api/attachments/{attachment_id}/download", headers=carol.headers)
    assert res.status_code == 404  # not a member of the conversation


def test_videos_are_signed_as_video(alice: Account, cloudinary_configured: None) -> None:
    for mime in ("video/mp4", "video/quicktime", "video/x-matroska"):
        res = alice.post("/attachments/sign", {"kind": "attachment", "mime_type": mime, "size_bytes": 5 * MB})
        assert res["resource_type"] == "video"
        assert res["upload_url"].endswith("/video/upload")

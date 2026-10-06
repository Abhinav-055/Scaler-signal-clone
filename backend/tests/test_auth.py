from fastapi.testclient import TestClient

PHONE = "+919800012345"


def test_request_otp_reports_new_user(client: TestClient) -> None:
    res = client.post("/api/auth/request-otp", json={"phone": PHONE})
    assert res.status_code == 200
    assert res.json()["is_new_user"] is True


def test_invalid_phone_is_rejected(client: TestClient) -> None:
    res = client.post("/api/auth/request-otp", json={"phone": "12345"})
    assert res.status_code == 422


def test_wrong_code_is_rejected(client: TestClient) -> None:
    res = client.post("/api/auth/verify-otp", json={"phone": PHONE, "code": "000000"})
    assert res.status_code == 400


def test_verify_creates_user_once_and_logs_in(client: TestClient) -> None:
    first = client.post("/api/auth/verify-otp", json={"phone": PHONE, "code": "123456"}).json()
    assert first["is_new_user"] is True
    assert first["user"]["phone"] == PHONE

    second = client.post("/api/auth/verify-otp", json={"phone": PHONE, "code": "123456"}).json()
    assert second["is_new_user"] is False
    assert second["user"]["id"] == first["user"]["id"]
    assert second["token"] != first["token"]  # every login is a new session

    me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {first['token']}"})
    assert me.status_code == 200
    assert me.json()["id"] == first["user"]["id"]


def test_requests_without_valid_token_are_401(client: TestClient) -> None:
    assert client.get("/api/auth/me").status_code == 401
    assert client.get("/api/auth/me", headers={"Authorization": "Bearer nope"}).status_code == 401


def test_logout_invalidates_token(client: TestClient) -> None:
    token = client.post("/api/auth/verify-otp", json={"phone": PHONE, "code": "123456"}).json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    assert client.post("/api/auth/logout", headers=headers).status_code == 204
    assert client.get("/api/auth/me", headers=headers).status_code == 401


def test_websocket_rejects_bad_token(client: TestClient) -> None:
    with client.websocket_connect("/ws?token=bad") as ws:
        message = ws.receive()
        assert message["type"] == "websocket.close"
        assert message["code"] == 4401


def test_profile_update_and_username_uniqueness(client: TestClient) -> None:
    a = client.post("/api/auth/verify-otp", json={"phone": PHONE, "code": "123456"}).json()["token"]
    b = client.post("/api/auth/verify-otp", json={"phone": "+919800054321", "code": "123456"}).json()["token"]
    res = client.patch(
        "/api/users/me",
        json={"display_name": "Asha", "username": "asha"},
        headers={"Authorization": f"Bearer {a}"},
    )
    assert res.status_code == 200
    assert res.json()["display_name"] == "Asha"
    res = client.patch("/api/users/me", json={"username": "ASHA"}, headers={"Authorization": f"Bearer {b}"})
    assert res.status_code == 409

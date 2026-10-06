from datetime import timedelta

from app.db import SessionLocal
from app.models import Message
from app.models.types import utcnow
from app.services.messages import delete_expired
from tests.conftest import Account, recv, send_message


def test_only_one_direct_conversation_per_pair(alice: Account, bob: Account) -> None:
    first = alice.direct_with(bob)
    assert bob.direct_with(alice) == first
    assert alice.direct_with(bob) == first


def test_send_is_idempotent_by_client_id(alice: Account, bob: Account) -> None:
    conv_id = alice.direct_with(bob)
    with alice.ws() as ws:
        first = send_message(ws, conv_id, "hello", "client-id-0001")
        retry = send_message(ws, conv_id, "hello", "client-id-0001")  # e.g. resent after a reconnect
    assert retry["id"] == first["id"]
    page = alice.get(f"/conversations/{conv_id}/messages")
    assert [m["body"] for m in page["messages"]] == ["hello"]


def test_message_is_delivered_live_and_receipts_flow_back(alice: Account, bob: Account) -> None:
    conv_id = alice.direct_with(bob)
    with alice.ws() as a_ws, bob.ws() as b_ws:
        sent = send_message(a_ws, conv_id, "hi bob", "client-id-0002")
        assert sent["status"] == "sent"

        incoming = recv(b_ws, "message.new")
        assert incoming["body"] == "hi bob"
        assert incoming["status"] is None  # status is only shown to the sender

        b_ws.send_json({"type": "receipt.delivered", "payload": {"message_ids": [incoming["id"]]}})
        update = recv(a_ws, "receipt.updated")
        assert update["updates"] == [{"message_id": sent["id"], "status": "delivered"}]

        b_ws.send_json({"type": "receipt.read", "payload": {"message_ids": [incoming["id"]]}})
        update = recv(a_ws, "receipt.updated")
        assert update["updates"] == [{"message_id": sent["id"], "status": "read"}]

    page = alice.get(f"/conversations/{conv_id}/messages")
    assert page["messages"][0]["status"] == "read"


def test_offline_recipient_gets_delivered_on_connect(alice: Account, bob: Account) -> None:
    conv_id = alice.direct_with(bob)
    with alice.ws() as a_ws:
        sent = send_message(a_ws, conv_id, "are you there?", "client-id-0003")
        with bob.ws():
            update = recv(a_ws, "receipt.updated")
    assert update["updates"] == [{"message_id": sent["id"], "status": "delivered"}]


def test_unread_counts_and_read_pointer(alice: Account, bob: Account) -> None:
    conv_id = alice.direct_with(bob)
    with alice.ws() as ws:
        ids = [send_message(ws, conv_id, f"msg {i}", f"client-id-01{i:02d}")["id"] for i in range(3)]

    def bob_view() -> dict:
        return next(c for c in bob.get("/conversations") if c["id"] == conv_id)

    assert bob_view()["unread_count"] == 3
    assert next(c for c in alice.get("/conversations") if c["id"] == conv_id)["unread_count"] == 0

    with bob.ws() as ws:
        ws.send_json({"type": "receipt.read", "payload": {"message_ids": ids[:2]}})
        recv(ws, "conversation.updated")
    assert bob_view()["unread_count"] == 1

    # Read receipts turned off: pointer moves through REST and no receipt is sent.
    bob.post(f"/conversations/{conv_id}/read", {"message_id": ids[2]}, expect=204)
    assert bob_view()["unread_count"] == 0
    statuses = [m["status"] for m in alice.get(f"/conversations/{conv_id}/messages")["messages"]]
    assert statuses == ["read", "read", "delivered"]


def test_non_member_cannot_send(alice: Account, bob: Account, carol: Account) -> None:
    conv_id = alice.direct_with(bob)
    with carol.ws() as ws:
        ws.send_json(
            {
                "type": "message.send",
                "payload": {"client_id": "client-id-0004", "conversation_id": conv_id, "body": "x"},
            }
        )
        error = recv(ws, "error")
    assert error["client_id"] == "client-id-0004"
    assert alice.get(f"/conversations/{conv_id}/messages")["messages"] == []


def test_reactions_one_per_user(alice: Account, bob: Account) -> None:
    conv_id = alice.direct_with(bob)
    with alice.ws() as ws:
        msg = send_message(ws, conv_id, "react to me", "client-id-0005")
    bob.client.put(f"/api/messages/{msg['id']}/reactions", json={"emoji": "👍"}, headers=bob.headers)
    res = bob.client.put(f"/api/messages/{msg['id']}/reactions", json={"emoji": "❤️"}, headers=bob.headers)
    assert res.json() == [{"user_id": bob.id, "emoji": "❤️"}]
    res = bob.client.delete(f"/api/messages/{msg['id']}/reactions", headers=bob.headers)
    assert res.json() == []


def test_delete_for_me_hides_only_for_me(alice: Account, bob: Account) -> None:
    conv_id = alice.direct_with(bob)
    with alice.ws() as ws:
        msg = send_message(ws, conv_id, "secret", "client-id-0006")
    bob.delete(f"/messages/{msg['id']}", expect=204)
    assert bob.get(f"/conversations/{conv_id}/messages")["messages"] == []
    assert len(alice.get(f"/conversations/{conv_id}/messages")["messages"]) == 1


def test_disappearing_messages_expire(alice: Account, bob: Account) -> None:
    conv_id = alice.direct_with(bob)
    alice.patch(f"/conversations/{conv_id}", {"disappearing_seconds": 30})
    with alice.ws() as ws:
        msg = send_message(ws, conv_id, "self-destruct", "client-id-0007")
    assert msg["expires_at"] is not None

    with SessionLocal() as db:
        row = db.get(Message, msg["id"])
        assert row is not None
        row.expires_at = utcnow() - timedelta(seconds=1)  # pretend 30s have passed
        db.commit()
        batches, _assets = delete_expired(db)
    assert batches[0].message_ids == [msg["id"]]
    bodies = [m["body"] for m in alice.get(f"/conversations/{conv_id}/messages")["messages"]]
    assert "self-destruct" not in bodies
    assert any("disappearing message timer" in b for b in bodies)  # the system notice stays


def test_pagination_with_before_cursor(alice: Account, bob: Account) -> None:
    conv_id = alice.direct_with(bob)
    with alice.ws() as ws:
        for i in range(5):
            send_message(ws, conv_id, f"m{i}", f"client-id-02{i:02d}")
    page = alice.get(f"/conversations/{conv_id}/messages?limit=2")
    assert [m["body"] for m in page["messages"]] == ["m3", "m4"]
    assert page["has_more"] is True
    older = alice.get(f"/conversations/{conv_id}/messages?limit=10&before={page['messages'][0]['id']}")
    assert [m["body"] for m in older["messages"]] == ["m0", "m1", "m2"]
    assert older["has_more"] is False

from tests.conftest import Account, recv, send_message


def make_group(admin: Account, *members: Account) -> int:
    conv = admin.post(
        "/conversations",
        {"type": "group", "name": "Trek", "member_ids": [m.id for m in members]},
        expect=201,
    )
    return conv["id"]


def roles(account: Account, conv_id: int) -> dict[int, str]:
    conv = account.get(f"/conversations/{conv_id}")
    return {m["user"]["id"]: m["role"] for m in conv["members"] if m["left_at"] is None}


def test_creator_is_admin_and_system_messages_are_created(
    alice: Account, bob: Account, carol: Account
) -> None:
    conv_id = make_group(alice, bob, carol)
    assert roles(alice, conv_id) == {alice.id: "admin", bob.id: "member", carol.id: "member"}
    bodies = [m["body"] for m in bob.get(f"/conversations/{conv_id}/messages")["messages"]]
    assert bodies == ["Alice created the group “Trek”", "Alice added Bob and Carol"]


def test_members_cannot_do_admin_things(alice: Account, bob: Account, carol: Account) -> None:
    conv_id = make_group(alice, bob)
    bob.post(f"/conversations/{conv_id}/members", {"user_ids": [carol.id]}, expect=403)
    bob.delete(f"/conversations/{conv_id}/members/{alice.id}", expect=403)
    bob.patch(f"/conversations/{conv_id}/members/{bob.id}", {"role": "admin"}, expect=403)
    bob.patch(f"/conversations/{conv_id}", {"name": "Hijacked"}, expect=403)
    bob.patch(f"/conversations/{conv_id}", {"disappearing_seconds": 30}, expect=403)
    # ...but personal settings are fine
    bob.patch(f"/conversations/{conv_id}", {"archived": True})


def test_admin_can_add_promote_and_remove(alice: Account, bob: Account, carol: Account) -> None:
    conv_id = make_group(alice, bob)
    alice.post(f"/conversations/{conv_id}/members", {"user_ids": [carol.id]})
    alice.patch(f"/conversations/{conv_id}/members/{bob.id}", {"role": "admin"})
    assert roles(alice, conv_id)[bob.id] == "admin"
    bob.delete(f"/conversations/{conv_id}/members/{carol.id}")  # the new admin can remove people
    assert carol.id not in roles(alice, conv_id)


def test_removed_member_keeps_history_but_stops_receiving(
    alice: Account, bob: Account, carol: Account
) -> None:
    conv_id = make_group(alice, bob, carol)
    with alice.ws() as ws:
        send_message(ws, conv_id, "before removal", "client-id-1001")
    alice.delete(f"/conversations/{conv_id}/members/{carol.id}")

    with alice.ws() as a_ws, carol.ws() as c_ws:
        send_message(a_ws, conv_id, "after removal", "client-id-1002")
        # Carol can't send anymore
        c_ws.send_json(
            {
                "type": "message.send",
                "payload": {"client_id": "client-id-1003", "conversation_id": conv_id, "body": "hey"},
            }
        )
        assert recv(c_ws, "error")["code"] == "forbidden"

    carol_view = carol.get(f"/conversations/{conv_id}")
    assert carol_view["is_active_member"] is False
    bodies = [m["body"] for m in carol.get(f"/conversations/{conv_id}/messages")["messages"]]
    assert "before removal" in bodies
    assert "Alice removed Carol" in bodies
    assert "after removal" not in bodies


def test_last_admin_leaving_promotes_someone(alice: Account, bob: Account, carol: Account) -> None:
    conv_id = make_group(alice, bob, carol)
    alice.delete(f"/conversations/{conv_id}/members/{alice.id}")
    remaining = roles(bob, conv_id)
    assert alice.id not in remaining
    assert "admin" in remaining.values()


def test_cannot_demote_the_only_admin(alice: Account, bob: Account) -> None:
    conv_id = make_group(alice, bob)
    alice.patch(f"/conversations/{conv_id}/members/{alice.id}", {"role": "member"}, expect=400)


def test_group_messages_reach_all_members(alice: Account, bob: Account, carol: Account) -> None:
    conv_id = make_group(alice, bob, carol)
    with alice.ws() as a_ws, bob.ws() as b_ws, carol.ws() as c_ws:
        sent = send_message(a_ws, conv_id, "hello group", "client-id-1004")
        assert recv(b_ws, "message.new")["id"] == sent["id"]
        assert recv(c_ws, "message.new")["id"] == sent["id"]
        # Group status is the lowest across recipients: one delivered receipt is not enough.
        b_ws.send_json({"type": "receipt.delivered", "payload": {"message_ids": [sent["id"]]}})
        assert recv(a_ws, "receipt.updated")["updates"][0]["status"] == "sent"
        c_ws.send_json({"type": "receipt.delivered", "payload": {"message_ids": [sent["id"]]}})
        assert recv(a_ws, "receipt.updated")["updates"][0]["status"] == "delivered"

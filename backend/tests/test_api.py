def test_health_and_route_protection(client):
    assert client.get("/api/health").json() == {"status": "ok", "mode": "development"}
    client.post("/api/auth/logout")
    assert client.get("/api/dashboard").status_code == 401


def test_login_and_seeded_dashboard(client):
    assert client.post(
        "/api/auth/login", json={"username": "demo", "password": "wrong-password"}
    ).status_code == 401
    response = client.post(
        "/api/auth/login", json={"username": "demo", "password": "Momentum123!"}
    )
    assert response.status_code == 200
    dashboard = client.get("/api/dashboard").json()
    assert [wallet["symbol"] for wallet in dashboard["wallets"]] == [
        "BTC",
        "ETH",
        "USDT",
        "TON",
    ]
    assert len(dashboard["transactions"]) == 4
    assert set(dashboard["periods"]) == {"1H", "24H", "1W", "1M", "ALL"}
    # The chart is reconstructed from the transaction ledger. The seeded demo
    # account's deposits all happened at seed time, i.e. before every period's
    # window start relative to "now" - so every window opens at $0 and closes
    # at the current balance, and the zero-start guard keeps "change" at 0.
    expected_points = {"1H": 7, "24H": 13, "1W": 13, "1M": 13, "ALL": 13}
    for label, point_count in expected_points.items():
        period = dashboard["periods"][label]
        assert period["change"] == "0.00"
        assert len(period["values"]) == point_count
        assert period["values"][0] == "0.00"
        assert period["values"][-1] == dashboard["total_balance"]


def test_seeded_client_accounts_accept_documented_credentials(client):
    expected_names = {
        "mia": "Mia Warren",
        "ethan": "Ethan Cole",
        "nora": "Nora Hayes",
        "marcus": "Marcus Chen",
        "olivia": "Olivia Lane",
    }
    for username, name in expected_names.items():
        response = client.post(
            "/api/auth/login",
            json={"username": username, "password": "Momentum123!"},
        )
        assert response.status_code == 200
        assert response.json()["user"]["name"] == name
        client.post("/api/auth/logout")


def test_register_unique_user_and_preferences(client):
    payload = {
        "name": "Alex Morgan",
        "username": "alex_test",
        "email": "alex_test@example.com",
        "password": "A-secure-password-123",
    }
    response = client.post("/api/auth/register", json=payload)
    assert response.status_code == 201
    assert response.json()["user"]["username"] == "alex_test"
    assert client.post("/api/auth/register", json=payload).status_code == 409
    wallets = client.get("/api/wallets").json()["items"]
    assert len(wallets) == 4
    preference = client.patch(
        "/api/preferences", json={"theme": "light", "sounds": False, "language": "fr"}
    ).json()
    assert preference == {"theme": "light", "sounds": False, "language": "fr"}
    assert client.get("/api/auth/me").json()["user"]["language"] == "fr"

    settings_payload = {
        "name": "Alex Rivera",
        "username": "alex_rivera",
        "email": "alex.rivera@example.com",
        "daily_send_limit": "2500.00",
        "monthly_send_limit": "60000.00",
    }
    updated = client.patch("/api/account/settings", json=settings_payload)
    assert updated.status_code == 200
    saved = updated.json()["user"]
    assert saved["name"] == "Alex Rivera"
    assert saved["username"] == "alex_rivera"
    assert saved["email"] == "alex.rivera@example.com"
    assert saved["daily_send_limit"] == "2500.00"
    assert saved["monthly_send_limit"] == "60000.00"
    assert client.get("/api/auth/me").json()["user"]["username"] == "alex_rivera"

    invalid_limits = {**settings_payload, "monthly_send_limit": "1000.00"}
    assert client.patch("/api/account/settings", json=invalid_limits).status_code == 422
    invalid_name = {**settings_payload, "name": "  "}
    assert client.patch("/api/account/settings", json=invalid_name).status_code == 422
    duplicate_email = {**settings_payload, "email": "mia.warren@example.com"}
    assert client.patch("/api/account/settings", json=duplicate_email).status_code == 409


def test_support_is_persisted(authenticated_client):
    initial = authenticated_client.get("/api/support/messages").json()
    before = initial["items"]
    assert initial["unread_count"] >= 1
    assert authenticated_client.post("/api/support/read").json() == {"unread_count": 0}
    assert authenticated_client.get("/api/support/messages").json()["unread_count"] == 0
    response = authenticated_client.post(
        "/api/support/messages", json={"body": "Please check my transfer"}
    )
    assert response.status_code == 201
    after = authenticated_client.get("/api/support/messages").json()["items"]
    assert len(after) == len(before) + 2
    assert after[-2]["sender"] == "user"
    assert after[-1]["sender"] == "support"
    assert authenticated_client.get("/api/support/messages").json()["unread_count"] == 1


def test_deposit_requires_support_approval(authenticated_client):
    before = next(
        wallet
        for wallet in authenticated_client.get("/api/wallets").json()["items"]
        if wallet["symbol"] == "USDT"
    )
    created = authenticated_client.post(
        "/api/deposit-requests", json={"asset": "USDT", "amount_usd": "250.00"}
    )
    assert created.status_code == 201
    request = created.json()["request"]
    assert request["status"] == "pending"
    assert request["amount_usd"] == "250.00"
    unchanged = next(
        wallet
        for wallet in authenticated_client.get("/api/wallets").json()["items"]
        if wallet["symbol"] == "USDT"
    )
    assert unchanged["balance"] == before["balance"]
    assert authenticated_client.post(
        "/api/demo/buy", json={"asset": "BTC", "amount_usd": "10.00"}
    ).status_code == 409

    authenticated_client.post("/api/auth/logout")
    assert authenticated_client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    ).status_code == 200
    target = authenticated_client.get("/api/staff/clients?query=%40demo").json()["items"][0]
    detail = authenticated_client.get(f"/api/staff/clients/{target['id']}").json()["client"]
    assert detail["deposit_requests"][0]["id"] == request["id"]
    approved = authenticated_client.post(
        f"/api/staff/clients/{target['id']}/deposit-requests/{request['id']}/decision",
        json={"decision": "approve"},
    )
    assert approved.status_code == 200
    approved_request = approved.json()["client"]["deposit_requests"][0]
    assert approved_request["status"] == "approved"
    assert authenticated_client.post(
        f"/api/staff/clients/{target['id']}/deposit-requests/{request['id']}/decision",
        json={"decision": "approve"},
    ).status_code == 409

    authenticated_client.post("/api/auth/logout")
    authenticated_client.post(
        "/api/auth/login", json={"username": "demo", "password": "Momentum123!"}
    )
    after = next(
        wallet
        for wallet in authenticated_client.get("/api/wallets").json()["items"]
        if wallet["symbol"] == "USDT"
    )
    assert float(after["balance"]) > float(before["balance"])
    latest = authenticated_client.get("/api/transactions").json()["items"][0]
    assert latest["kind"] == "buy"
    assert latest["usd_value"] == "250.00"
    assert "verified and approved" in authenticated_client.get(
        "/api/support/messages"
    ).json()["items"][-1]["body"]


def test_legacy_withdrawal_api_is_removed(authenticated_client):
    assert authenticated_client.post(
        "/api/withdrawals",
        json={
            "asset": "USDT",
            "amount": "10",
            "cardholder": "Demo",
            "card_last4": "4242",
        },
    ).status_code == 404
    assert authenticated_client.post(
        "/api/withdrawals/1/authorize", json={"password": "Momentum123!"}
    ).status_code == 404
    assert authenticated_client.post(
        "/api/withdrawals/1/verify", json={"code": "999999"}
    ).status_code == 404


def test_demo_operations_reject_overdraft(authenticated_client):
    response = authenticated_client.post(
        "/api/demo/send",
        json={"asset": "BTC", "amount": "9999", "address": "destination_address"},
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "Insufficient balance"


def test_staff_workspace_is_role_protected_and_operational(client):
    client.post("/api/auth/login", json={"username": "demo", "password": "Momentum123!"})
    assert client.get("/api/staff/clients").status_code == 403

    response = client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    )
    assert response.status_code == 200
    assert response.json()["user"]["is_staff"] is True

    clients = client.get("/api/staff/clients").json()
    assert clients["summary"]["clients"] >= 41
    assert clients["pagination"] == {
        "page": 1,
        "page_size": 25,
        "total": clients["summary"]["clients"],
        "pages": 2,
    }
    first_page = client.get("/api/staff/clients?page=1&page_size=2").json()
    second_page = client.get("/api/staff/clients?page=2&page_size=2").json()
    assert len(first_page["items"]) == 2
    assert len(second_page["items"]) == 2
    assert first_page["pagination"]["total"] == clients["summary"]["clients"]
    assert first_page["summary"] == second_page["summary"]
    assert {item["id"] for item in first_page["items"]}.isdisjoint(
        item["id"] for item in second_page["items"]
    )
    assert client.get("/api/staff/clients?page_size=101").status_code == 422
    target = client.get("/api/staff/clients?query=%40mia").json()["items"][0]
    detail = client.get(f"/api/staff/clients/{target['id']}").json()["client"]
    before = next(wallet for wallet in detail["wallets"] if wallet["symbol"] == "USDT")
    adjusted = client.post(
        f"/api/staff/clients/{target['id']}/balance",
        json={"asset": "USDT", "action": "credit", "amount": "25"},
    )
    assert adjusted.status_code == 201
    after = next(
        wallet for wallet in adjusted.json()["client"]["wallets"] if wallet["symbol"] == "USDT"
    )
    assert float(after["balance"]) == float(before["balance"]) + 25
    manual_credit = next(
        item
        for item in adjusted.json()["client"]["transactions"]
        if item["details"].get("reason") == "Manual account adjustment"
    )
    assert manual_credit["editable"] is True
    recorded_at = manual_credit["created_at"]
    edited = client.patch(
        f"/api/staff/clients/{target['id']}/transactions/{manual_credit['id']}",
        json={"amount": "40", "effective_at": target["created_at"]},
    )
    assert edited.status_code == 200
    after = next(
        wallet for wallet in edited.json()["client"]["wallets"] if wallet["symbol"] == "USDT"
    )
    assert float(after["balance"]) == float(before["balance"]) + 40
    edited_credit = next(
        item
        for item in edited.json()["client"]["transactions"]
        if item["id"] == manual_credit["id"]
    )
    assert edited_credit["amount"] == "4E+1"
    assert edited_credit["created_at"] == recorded_at
    assert edited_credit["effective_at"] == target["created_at"]
    future_edit = client.patch(
        f"/api/staff/clients/{target['id']}/transactions/{manual_credit['id']}",
        json={"amount": "40", "effective_at": "2999-01-01T00:00:00Z"},
    )
    assert future_edit.status_code == 422
    assert future_edit.json()["detail"] == "Credit date cannot be in the future"
    regular_transaction = next(
        item for item in edited.json()["client"]["transactions"] if not item["editable"]
    )
    forbidden_edit = client.patch(
        f"/api/staff/clients/{target['id']}/transactions/{regular_transaction['id']}",
        json={
            "amount": regular_transaction["amount"],
            "effective_at": regular_transaction["effective_at"],
        },
    )
    assert forbidden_edit.status_code == 422
    assert forbidden_edit.json()["detail"] == "Only manual credits can be edited"

    updated_settings = client.patch(
        f"/api/staff/clients/{target['id']}/settings",
        json={
            "name": "Mia Settings",
            "username": "mia_settings",
            "email": "mia.settings@example.com",
            "daily_send_limit": "2500.00",
            "monthly_send_limit": "75000.00",
            "manual_review_threshold": "12500.00",
            "theme": "light",
            "sounds": False,
        },
    )
    assert updated_settings.status_code == 200
    saved_client = updated_settings.json()["client"]
    assert saved_client["name"] == "Mia Settings"
    assert saved_client["username"] == "mia_settings"
    assert saved_client["daily_send_limit"] == "2500.00"
    assert saved_client["monthly_send_limit"] == "75000.00"
    assert saved_client["manual_review_threshold"] == "12500.00"
    assert saved_client["theme"] == "light"
    assert saved_client["sounds"] is False

    codes = client.post(
        f"/api/staff/clients/{target['id']}/codes", json={"count": 3}
    )
    assert codes.status_code == 201
    assert len(codes.json()["items"]) == 3
    cleared = client.delete(f"/api/staff/clients/{target['id']}/codes")
    assert cleared.status_code == 204
    cleared_detail = client.get(f"/api/staff/clients/{target['id']}").json()["client"]
    assert cleared_detail["codes"] == []
    assert client.post(
        f"/api/staff/clients/{target['id']}/messages",
        json={"body": "We reviewed your account and the transfer is now confirmed."},
    ).status_code == 201

    login_as_client = client.post(
        "/api/auth/login",
        json={"username": "mia_settings", "password": "Momentum123!"},
    )
    assert login_as_client.status_code == 200
    logged_in_user = login_as_client.json()["user"]
    assert logged_in_user["name"] == "Mia Settings"
    assert logged_in_user["daily_send_limit"] == "2500.00"
    assert logged_in_user["theme"] == "light"
    assert logged_in_user["sounds"] is False
    client_wallets = client.get("/api/wallets").json()["items"]
    visible_balance = next(wallet for wallet in client_wallets if wallet["symbol"] == "USDT")
    assert float(visible_balance["balance"]) == float(after["balance"])
    visible_credit = next(
        item
        for item in client.get("/api/transactions").json()["items"]
        if item["id"] == manual_credit["id"]
    )
    assert visible_credit["title"] == "Received USDT"
    assert visible_credit["effective_at"] == target["created_at"]
    assert "Momentum Operations" not in visible_credit["title"]


def test_staff_can_open_client_profile_and_return_without_password(client):
    client.post("/api/auth/logout")
    staff_login = client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    )
    assert staff_login.status_code == 200

    target = client.get("/api/staff/clients?query=%40mia").json()["items"][0]
    opened = client.post(f"/api/staff/clients/{target['id']}/impersonate")
    assert opened.status_code == 200
    assert opened.json()["user"]["username"] == target["username"]
    assert opened.json()["user"]["is_staff"] is False
    assert opened.json()["user"]["impersonating"] is True

    # The active cookie now has client permissions, while a reload still knows
    # that the protected staff session can be restored.
    assert client.get("/api/staff/clients").status_code == 403
    me = client.get("/api/auth/me").json()["user"]
    assert me["username"] == target["username"]
    assert me["impersonating"] is True

    # The protected staff cookie keeps Operations usable if the active client
    # session is no longer valid before the moderator returns to the workspace.
    client.cookies.delete("momentum_session")
    reopened = client.post(f"/api/staff/clients/{target['id']}/impersonate")
    assert reopened.status_code == 200
    assert reopened.json()["user"]["username"] == target["username"]

    restored = client.post("/api/auth/impersonation/exit")
    assert restored.status_code == 200
    assert restored.json()["user"]["username"] == "moderator"
    assert restored.json()["user"]["is_staff"] is True
    assert restored.json()["user"]["impersonating"] is False
    assert client.get("/api/staff/clients").status_code == 200
    assert client.post("/api/auth/impersonation/exit").status_code == 401

    client.post("/api/auth/logout")
    client.post("/api/auth/login", json={"username": "demo", "password": "Momentum123!"})
    assert client.post(f"/api/staff/clients/{target['id']}/impersonate").status_code == 403
    assert client.post("/api/auth/impersonation/exit").status_code == 401


def test_staff_can_set_wallet_balance_and_permanently_delete_client(client):
    client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    )
    created = client.post(
        "/api/staff/clients",
        json={
            "name": "Delete Balance Test",
            "username": "delete_balance_test",
            "email": "delete.balance.test@example.com",
            "required_codes": 2,
        },
    )
    assert created.status_code == 201
    payload = created.json()
    user_id = payload["client"]["id"]
    temporary_password = payload["temporary_password"]

    set_higher = client.post(
        f"/api/staff/clients/{user_id}/balance",
        json={"asset": "BTC", "action": "set", "amount": "1.25000000"},
    )
    assert set_higher.status_code == 201
    bitcoin = next(
        wallet
        for wallet in set_higher.json()["client"]["wallets"]
        if wallet["symbol"] == "BTC"
    )
    assert bitcoin["balance"] == "1.25"

    set_lower = client.post(
        f"/api/staff/clients/{user_id}/balance",
        json={"asset": "BTC", "action": "set", "amount": "0.4"},
    )
    assert set_lower.status_code == 201
    bitcoin = next(
        wallet
        for wallet in set_lower.json()["client"]["wallets"]
        if wallet["symbol"] == "BTC"
    )
    assert bitcoin["balance"] == "0.4"
    adjustment = next(
        item
        for item in set_lower.json()["client"]["transactions"]
        if item["kind"] == "adjustment"
    )
    assert adjustment["amount"] == "-0.85"
    assert adjustment["details"]["balance_after"] == "0.40000000"
    assert adjustment["editable"] is False

    set_zero = client.post(
        f"/api/staff/clients/{user_id}/balance",
        json={"asset": "BTC", "action": "set", "amount": "0"},
    )
    assert set_zero.status_code == 201
    bitcoin = next(
        wallet
        for wallet in set_zero.json()["client"]["wallets"]
        if wallet["symbol"] == "BTC"
    )
    assert bitcoin["balance"] == "0"

    deleted = client.delete(f"/api/staff/clients/{user_id}")
    assert deleted.status_code == 204
    assert client.get(f"/api/staff/clients/{user_id}").status_code == 404
    assert client.delete(f"/api/staff/clients/{user_id}").status_code == 404
    assert client.get("/api/staff/clients?query=delete_balance_test").json()["items"] == []

    client.post("/api/auth/logout")
    rejected_login = client.post(
        "/api/auth/login",
        json={"username": "delete_balance_test", "password": temporary_password},
    )
    assert rejected_login.status_code == 401


def test_managed_profile_and_persistent_multi_code_transfer(client):
    client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    )
    missing_identity_fields = client.post(
        "/api/staff/clients",
        json={"name": "Incomplete profile"},
    )
    assert missing_identity_fields.status_code == 422
    created = client.post(
        "/api/staff/clients",
        json={
            "name": "Olena",
            "username": "olena_managed_1",
            "email": "olena.managed.1@example.com",
            "required_codes": 2,
        },
    )
    assert created.status_code == 201
    payload = created.json()
    assert payload["client"]["name"] == "Olena"
    assert payload["client"]["verification_required"] == 2
    assert len(payload["client"]["codes"]) == 2
    assert [item["id"] for item in payload["client"]["codes"]] == sorted(
        item["id"] for item in payload["client"]["codes"]
    )
    assert all(float(wallet["balance"]) == 0 for wallet in payload["client"]["wallets"])
    assert "temporary_password" in payload

    credited = client.post(
        f"/api/staff/clients/{payload['client']['id']}/balance",
        json={"asset": "USDT", "action": "credit", "amount": "2"},
    )
    assert credited.status_code == 201

    search = client.get("/api/staff/clients?query=olena").json()["items"]
    assert [item["id"] for item in search] == [payload["client"]["id"]]
    search_by_id = client.get(f"/api/staff/clients?query={payload['client']['id']}").json()["items"]
    assert any(item["id"] == payload["client"]["id"] for item in search_by_id)
    search_by_username = client.get("/api/staff/clients?query=%40olena_managed_1").json()["items"]
    assert [item["id"] for item in search_by_username] == [payload["client"]["id"]]

    reset = client.post(
        f"/api/staff/clients/{payload['client']['id']}/reset-password"
    )
    assert reset.status_code == 200
    new_password = reset.json()["temporary_password"]
    assert new_password != payload["temporary_password"]

    login = client.post(
        "/api/auth/login", json={"username": "olena_managed_1", "password": new_password}
    )
    assert login.status_code == 200
    cancelled_transfer = client.post(
        "/api/demo/transfers",
        json={
            "method": "crypto",
            "asset": "USDT",
            "amount": "1",
            "destination": "demo_address_123",
        },
    )
    assert cancelled_transfer.status_code == 201
    cancelled_id = cancelled_transfer.json()["transfer"]["id"]
    assert client.delete(f"/api/demo/transfers/{cancelled_id}").status_code == 204
    assert client.get("/api/demo/transfers/active").json()["transfer"] is None

    transfer = client.post(
        "/api/demo/transfers",
        json={
            "method": "crypto",
            "asset": "USDT",
            "amount": "1",
            "destination": "demo_address_123",
        },
    )
    assert transfer.status_code == 201
    transfer_id = transfer.json()["transfer"]["id"]
    codes = sorted(payload["client"]["codes"], key=lambda item: item["id"])

    first = client.post(
        f"/api/demo/transfers/{transfer_id}/codes", json={"code": codes[0]["code"]}
    )
    assert first.status_code == 200
    assert first.json()["transfer"]["status"] == "verification"
    assert first.json()["transfer"]["used_codes"] == 1

    second = client.post(
        f"/api/demo/transfers/{transfer_id}/codes", json={"code": codes[1]["code"]}
    )
    assert second.status_code == 200
    assert second.json()["transfer"]["status"] == "processing"
    assert second.json()["transfer"]["processing_until"] is not None
    assert second.json()["transfer"]["processing_until"].endswith("Z")
    assert client.delete(f"/api/demo/transfers/{transfer_id}").status_code == 409
    status_payload = client.get("/api/verification/status").json()
    assert status_payload["state"] == "processing"
    assert status_payload["used"] == 2


def test_staff_can_manage_real_profile_statuses(client):
    client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    )
    created = client.post(
        "/api/staff/clients",
        json={
            "name": "Status Test",
            "username": "status_test_client",
            "email": "status.test@example.com",
            "required_codes": 0,
        },
    ).json()
    user_id = created["client"]["id"]
    temporary_password = created["temporary_password"]
    assert created["client"]["account_status"] == "active"

    suspended = client.patch(
        f"/api/staff/clients/{user_id}/status",
        json={"status": "suspended"},
    )
    assert suspended.status_code == 200
    assert suspended.json()["client"]["account_status"] == "suspended"
    blocked_login = client.post(
        "/api/auth/login",
        json={"username": "status_test_client", "password": temporary_password},
    )
    assert blocked_login.status_code == 200
    assert blocked_login.json()["user"]["account_status"] == "suspended"
    assert client.get("/api/auth/me").json()["user"]["account_status"] == "suspended"
    assert client.get("/api/wallets").status_code == 403

    client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    )
    archived = client.patch(
        f"/api/staff/clients/{user_id}/status",
        json={"status": "archived"},
    )
    assert archived.status_code == 200
    assert archived.json()["client"]["account_status"] == "archived"
    archived_login = client.post(
        "/api/auth/login",
        json={"username": "status_test_client", "password": temporary_password},
    )
    assert archived_login.status_code == 200
    assert archived_login.json()["user"]["account_status"] == "archived"
    assert client.get("/api/dashboard").status_code == 403

    client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    )
    activated = client.patch(
        f"/api/staff/clients/{user_id}/status",
        json={"status": "active"},
    )
    assert activated.status_code == 200
    assert activated.json()["client"]["account_status"] == "active"
    assert client.post(
        "/api/auth/login",
        json={"username": "status_test_client", "password": temporary_password},
    ).status_code == 200


def test_staff_verification_change_updates_active_transfer(client):
    client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    )
    created = client.post(
        "/api/staff/clients",
        json={
            "name": "Code Sync",
            "username": "code_sync_client",
            "email": "code.sync@example.com",
            "required_codes": 3,
        },
    ).json()
    user_id = created["client"]["id"]
    password = created["temporary_password"]
    codes = created["client"]["codes"]
    assert all(float(wallet["balance"]) == 0 for wallet in created["client"]["wallets"])
    assert client.post(
        f"/api/staff/clients/{user_id}/balance",
        json={"asset": "USDT", "action": "credit", "amount": "2"},
    ).status_code == 201

    client.post("/api/auth/login", json={"username": "code_sync_client", "password": password})
    transfer = client.post(
        "/api/demo/transfers",
        json={
            "method": "crypto",
            "asset": "USDT",
            "amount": "1",
            "destination": "demo_address_123",
        },
    ).json()["transfer"]
    transfer_id = transfer["id"]
    first = client.post(
        f"/api/demo/transfers/{transfer_id}/codes", json={"code": codes[0]["code"]}
    )
    assert first.json()["transfer"]["used_codes"] == 1

    client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    )
    too_low = client.patch(
        f"/api/staff/clients/{user_id}/verification", json={"required_codes": 0}
    )
    assert too_low.status_code == 422
    increased = client.patch(
        f"/api/staff/clients/{user_id}/verification", json={"required_codes": 4}
    )
    assert increased.status_code == 200

    client.post("/api/auth/login", json={"username": "code_sync_client", "password": password})
    current = client.get(f"/api/demo/transfers/{transfer_id}").json()["transfer"]
    assert current["required_codes"] == 4
    assert current["used_codes"] == 1

    client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    )
    completed = client.patch(
        f"/api/staff/clients/{user_id}/verification", json={"required_codes": 1}
    )
    assert completed.status_code == 200
    assert completed.json()["client"]["verification_state"] == "processing"

    client.post("/api/auth/login", json={"username": "code_sync_client", "password": password})
    current = client.get(f"/api/demo/transfers/{transfer_id}").json()["transfer"]
    assert current["status"] == "processing"
    assert current["required_codes"] == 1

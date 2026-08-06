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
    assert dashboard["periods"]["24H"]["change"] == "-0.60"
    assert dashboard["periods"]["1W"]["change"] == "2.84"
    assert dashboard["periods"]["1W"]["values"][-1] == dashboard["total_balance"]


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
        "/api/preferences", json={"theme": "light", "sounds": False}
    ).json()
    assert preference == {"theme": "light", "sounds": False}


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
    assert clients["summary"]["clients"] >= 6
    assert clients["pagination"] == {
        "page": 1,
        "page_size": 25,
        "total": clients["summary"]["clients"],
        "pages": 1,
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
        json={"username": target["username"], "password": "Momentum123!"},
    )
    assert login_as_client.status_code == 200
    client_wallets = client.get("/api/wallets").json()["items"]
    visible_balance = next(wallet for wallet in client_wallets if wallet["symbol"] == "USDT")
    assert float(visible_balance["balance"]) == float(after["balance"])


def test_managed_profile_and_persistent_multi_code_transfer(client):
    client.post(
        "/api/auth/login",
        json={"username": "moderator", "password": "MomentumAdmin123!"},
    )
    created = client.post(
        "/api/staff/clients",
        json={
            "profile_label": "Olena campaign 1",
            "name": "Olena",
            "username": "olena_managed_1",
            "email": "olena.managed.1@example.com",
            "required_codes": 2,
        },
    )
    assert created.status_code == 201
    payload = created.json()
    assert payload["client"]["profile_label"] == "Olena campaign 1"
    assert payload["client"]["verification_required"] == 2
    assert len(payload["client"]["codes"]) == 2
    assert [item["id"] for item in payload["client"]["codes"]] == sorted(
        item["id"] for item in payload["client"]["codes"]
    )
    assert "temporary_password" in payload

    search = client.get("/api/staff/clients?query=campaign%201").json()["items"]
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
            "profile_label": "Status test profile",
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
    assert blocked_login.status_code == 403

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

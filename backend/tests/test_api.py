import asyncio

from sqlalchemy import select

from app.db import SessionLocal
from app.models import Withdrawal


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


def test_full_sandbox_withdrawal(authenticated_client):
    draft = authenticated_client.post(
        "/api/withdrawals",
        json={
            "asset": "USDT",
            "amount": "10",
            "cardholder": "Demo",
            "card_last4": "4242",
        },
    )
    assert draft.status_code == 201
    withdrawal_id = draft.json()["id"]
    assert authenticated_client.post(
        f"/api/withdrawals/{withdrawal_id}/authorize", json={"password": "wrong"}
    ).status_code == 401
    authorized = authenticated_client.post(
        f"/api/withdrawals/{withdrawal_id}/authorize",
        json={"password": "Momentum123!"},
    )
    assert authorized.status_code == 200
    code = authorized.json()["demo_code"]
    assert len(code) == 6
    assert authenticated_client.post(
        f"/api/withdrawals/{withdrawal_id}/verify", json={"code": "999999"}
    ).status_code == 422
    verified = authenticated_client.post(
        f"/api/withdrawals/{withdrawal_id}/verify", json={"code": code}
    )
    assert verified.status_code == 200
    assert verified.json()["status"] == "pending"
    assert verified.json()["transaction"]["amount"] == "-1E+1"

    async def inspect() -> Withdrawal:
        async with SessionLocal() as session:
            return await session.scalar(select(Withdrawal).where(Withdrawal.id == withdrawal_id))

    stored = asyncio.run(inspect())
    assert stored.card_last4 == "4242"
    assert not hasattr(stored, "card_number")


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
    target = clients["items"][0]
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
    assert client.post(
        f"/api/staff/clients/{target['id']}/messages",
        json={"body": "We reviewed your account and the transfer is now confirmed."},
    ).status_code == 201


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
    assert "temporary_password" in payload

    search = client.get("/api/staff/clients?query=campaign%201").json()["items"]
    assert [item["id"] for item in search] == [payload["client"]["id"]]
    search_by_id = client.get(f"/api/staff/clients?query={payload['client']['id']}").json()["items"]
    assert any(item["id"] == payload["client"]["id"] for item in search_by_id)

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
        json={"method": "crypto", "asset": "USDT", "amount": "1", "destination": "demo_address_123"},
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

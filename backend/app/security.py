from __future__ import annotations

import hashlib
import secrets
import string

import httpx
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

password_hasher = PasswordHasher(time_cost=2, memory_cost=65536, parallelism=2)


def hash_password(password: str) -> str:
    return password_hasher.hash(password)


def verify_password(password_hash: str, password: str) -> bool:
    try:
        return password_hasher.verify(password_hash, password)
    except VerifyMismatchError:
        return False


def make_session_token() -> str:
    return secrets.token_urlsafe(48)


def make_otp() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def make_client_number() -> int:
    while True:
        candidate = 100_000 + secrets.randbelow(900_000)
        if candidate % 10 != 0:
            return candidate


def make_temporary_password(length: int = 18) -> str:
    alphabet = string.ascii_letters + string.digits
    return "M!" + "".join(secrets.choice(alphabet) for _ in range(length - 2))


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


async def verify_turnstile_token(
    token: str, secret_key: str, expected_hostnames: set[str]
) -> bool:
    async with httpx.AsyncClient(timeout=5.0) as client:
        response = await client.post(
            "https://challenges.cloudflare.com/turnstile/v0/siteverify",
            data={"secret": secret_key, "response": token},
        )
        response.raise_for_status()
        result = response.json()

    if not isinstance(result, dict):
        return False
    hostname = str(result.get("hostname", "")).lower().rstrip(".")
    return (
        result.get("success") is True
        and result.get("action") == "register"
        and hostname in expected_hostnames
    )

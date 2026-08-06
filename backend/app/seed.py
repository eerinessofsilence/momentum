from __future__ import annotations

from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Preference, SupportMessage, Transaction, User, Wallet
from .security import hash_password

ASSETS = [
    {
        "name": "Bitcoin",
        "symbol": "BTC",
        "network": "Bitcoin network",
        "balance": Decimal("0.031"),
        "price": Decimal("87499.99"),
        "change": Decimal("-2.36"),
    },
    {
        "name": "Ethereum",
        "symbol": "ETH",
        "network": "Ethereum network",
        "balance": Decimal("0.486"),
        "price": Decimal("3200"),
        "change": Decimal("-1.22"),
    },
    {
        "name": "Tether",
        "symbol": "USDT",
        "network": "TRC-20",
        "balance": Decimal("3474"),
        "price": Decimal("1"),
        "change": Decimal("0.01"),
    },
    {
        "name": "Toncoin",
        "symbol": "TON",
        "network": "TON network",
        "balance": Decimal("313"),
        "price": Decimal("5.40"),
        "change": Decimal("2.67"),
    },
]


def account_address(symbol: str, user_id: int) -> str:
    suffix = f"{user_id:04d}momentumvault"
    if symbol == "BTC":
        return f"bc1q{suffix}x9p29lckxsupfandmrdc3fp"
    if symbol == "ETH":
        return f"0xd96d4093{user_id:08x}b862f06a26ef75e7f5"
    if symbol == "USDT":
        return f"TsnWxe1CcA{user_id:04d}rEzbWAMomentumVault"
    return f"EQuByp1Unb{user_id:04d}zD0-vVMomentumVault"


async def provision_user(session: AsyncSession, user: User, seed_demo_data: bool = False) -> None:
    for asset in ASSETS:
        session.add(
            Wallet(
                user_id=user.id,
                name=asset["name"],
                symbol=asset["symbol"],
                network=asset["network"],
                address=account_address(asset["symbol"], user.id),
                balance=asset["balance"] if seed_demo_data else Decimal("0"),
                price_usd=asset["price"],
                change_24h=asset["change"],
            )
        )
    session.add(Preference(user_id=user.id, theme="dark", sounds=True))
    session.add(
        SupportMessage(
            user_id=user.id,
            sender="support",
            body=(
                "Welcome to Momentum. Our support team is here to help. "
                "Ask us anything about your wallet, deposits, or withdrawals."
            ),
        )
    )
    if seed_demo_data:
        initial_transactions = [
            ("TON", Decimal("313"), Decimal("1690.20")),
            ("USDT", Decimal("3474"), Decimal("3474.00")),
            ("ETH", Decimal("0.486"), Decimal("1555.20")),
            ("BTC", Decimal("0.031"), Decimal("2712.50")),
        ]
        for symbol, amount, usd_value in initial_transactions:
            session.add(
                Transaction(
                    user_id=user.id,
                    kind="receive",
                    status="approved",
                    asset=symbol,
                    amount=amount,
                    usd_value=usd_value,
                    title=f"Received {symbol}",
                    details={"source": "Momentum account setup"},
                )
            )
    await session.flush()


async def seed_demo_user(session: AsyncSession) -> None:
    existing = await session.scalar(select(User).where(User.username == "demo"))
    if existing:
        existing.name = "Demo"
        existing.username = "demo"
        existing.email = "demo@momentum.local"
        wallets = (
            await session.scalars(select(Wallet).where(Wallet.user_id == existing.id))
        ).all()
        for wallet in wallets:
            wallet.address = account_address(wallet.symbol, existing.id)
        messages = (
            await session.scalars(
                select(SupportMessage).where(
                    SupportMessage.user_id == existing.id,
                    SupportMessage.sender == "support",
                )
            )
        ).all()
        for message in messages:
            if "sandbox" in message.body.lower():
                message.body = (
                    "Welcome to Momentum. Our support team is here to help. "
                    "Ask us anything about your wallet, deposits, or withdrawals."
                )
        await session.commit()
        return
    user = User(
        name="Demo",
        username="demo",
        email="demo@momentum.local",
        password_hash=hash_password("Momentum123!"),
    )
    session.add(user)
    await session.flush()
    await provision_user(session, user, seed_demo_data=True)
    await session.commit()


async def seed_staff_workspace(session: AsyncSession) -> None:
    staff = await session.scalar(select(User).where(User.username == "moderator"))
    if not staff:
        staff = User(
            name="Morgan Reed",
            username="moderator",
            email="operations@momentum.local",
            password_hash=hash_password("MomentumAdmin123!"),
            is_staff=True,
        )
        session.add(staff)
        await session.flush()
        session.add(Preference(user_id=staff.id, theme="dark", sounds=True))
    else:
        staff.is_staff = True

    demo_clients = [
        ("Olivia Lane", "olivia", "olivia.lane@example.com"),
        ("Marcus Chen", "marcus", "marcus.chen@example.com"),
        ("Nora Hayes", "nora", "nora.hayes@example.com"),
        ("Ethan Cole", "ethan", "ethan.cole@example.com"),
        ("Mia Warren", "mia", "mia.warren@example.com"),
    ]
    for name, username, email in demo_clients:
        if await session.scalar(select(User).where(User.username == username)):
            continue
        client = User(
            name=name,
            username=username,
            email=email,
            password_hash=hash_password("Momentum123!"),
        )
        session.add(client)
        await session.flush()
        await provision_user(session, client, seed_demo_data=True)
        session.add(
            SupportMessage(
                user_id=client.id,
                sender="user",
                body=(
                    "Could you review my latest transfer? It has been pending longer than expected."
                    if username in {"olivia", "nora"}
                    else "Thanks, everything is working well on my account."
                ),
            )
        )
    await session.commit()

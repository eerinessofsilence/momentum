from __future__ import annotations

import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from decimal import ROUND_DOWN, Decimal
from pathlib import Path

from fastapi import Cookie, Depends, FastAPI, File, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import Base, SessionLocal, engine, get_db
from .models import (
    ConfirmationCode,
    Preference,
    Session,
    SupportAttachment,
    SupportMessage,
    Transaction,
    User,
    VerificationChallenge,
    Wallet,
    Withdrawal,
)
from .schemas import (
    AuthorizeWithdrawalInput,
    BuyInput,
    LoginInput,
    PreferenceInput,
    RegisterInput,
    SendInput,
    SupportMessageInput,
    StaffBalanceInput,
    StaffCodeInput,
    SwapInput,
    VerifyWithdrawalInput,
    WithdrawalInput,
)
from .security import (
    hash_password,
    make_otp,
    make_session_token,
    token_hash,
    verify_password,
)
from .seed import provision_user, seed_demo_user, seed_staff_workspace

COOKIE_NAME = "momentum_session"
SUPPORTED_ASSETS = {"BTC", "ETH", "USDT", "TON"}
MONEY_EPSILON = Decimal("0.00000001")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    async with SessionLocal() as session:
        await seed_demo_user(session)
        await seed_staff_workspace(session)
    yield


app = FastAPI(title="Momentum API", version="1.0.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.frontend_origin],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.mount("/uploads", StaticFiles(directory=settings.upload_dir, check_dir=False), name="uploads")


def now() -> datetime:
    return datetime.utcnow()


def as_decimal(value: Decimal | str | int | float) -> Decimal:
    return Decimal(str(value))


def require_asset(asset: str) -> str:
    normalized = asset.upper()
    if normalized not in SUPPORTED_ASSETS:
        raise HTTPException(status_code=422, detail="Unsupported asset")
    return normalized


def serialize_user(user: User, preference: Preference | None = None) -> dict:
    return {
        "id": user.id,
        "name": "Demo" if user.username.lower() == "demo" else user.name,
        "username": user.username,
        "email": user.email,
        "created_at": user.created_at,
        "theme": preference.theme if preference else "dark",
        "sounds": preference.sounds if preference else True,
        "is_staff": user.is_staff,
    }


def serialize_wallet(wallet: Wallet) -> dict:
    balance = as_decimal(wallet.balance)
    price = as_decimal(wallet.price_usd)
    return {
        "id": wallet.id,
        "name": wallet.name,
        "symbol": wallet.symbol,
        "network": wallet.network,
        "address": wallet.address,
        "balance": str(balance.normalize()),
        "price_usd": str(price),
        "usd_value": str((balance * price).quantize(Decimal("0.01"))),
        "change_24h": str(as_decimal(wallet.change_24h)),
    }


def serialize_transaction(transaction: Transaction) -> dict:
    return {
        "id": transaction.id,
        "kind": transaction.kind,
        "status": transaction.status,
        "asset": transaction.asset,
        "amount": str(as_decimal(transaction.amount).normalize()),
        "usd_value": str(as_decimal(transaction.usd_value).quantize(Decimal("0.01"))),
        "title": transaction.title,
        "details": transaction.details or {},
        "created_at": transaction.created_at,
    }


async def current_user(
    momentum_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    if not momentum_session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Sign in required")
    row = await db.execute(
        select(User)
        .join(Session, Session.user_id == User.id)
        .where(Session.token_hash == token_hash(momentum_session), Session.expires_at > now())
    )
    user = row.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Session expired")
    return user


async def issue_session(db: AsyncSession, response: Response, user: User) -> None:
    raw_token = make_session_token()
    db.add(
        Session(
            user_id=user.id,
            token_hash=token_hash(raw_token),
            expires_at=now() + timedelta(days=settings.session_days),
        )
    )
    await db.commit()
    response.set_cookie(
        COOKIE_NAME,
        raw_token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=not settings.demo_mode,
        samesite="lax",
        path="/",
    )


async def current_staff(user: User = Depends(current_user)) -> User:
    if not user.is_staff:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return user


async def owned_wallet(db: AsyncSession, user_id: int, symbol: str, lock: bool = False) -> Wallet:
    statement = select(Wallet).where(Wallet.user_id == user_id, Wallet.symbol == symbol)
    if lock:
        statement = statement.with_for_update()
    wallet = await db.scalar(statement)
    if not wallet:
        raise HTTPException(status_code=404, detail="Wallet not found")
    return wallet


@app.get("/api/health")
async def health() -> dict:
    return {"status": "ok", "mode": "development" if settings.demo_mode else "configured"}


@app.post("/api/auth/register", status_code=201)
async def register(
    payload: RegisterInput, response: Response, db: AsyncSession = Depends(get_db)
) -> dict:
    user = User(
        name=payload.name.strip(),
        username=payload.username.strip().lower(),
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    try:
        await db.flush()
        await provision_user(db, user)
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Username or email is already registered")
    preference = await db.get(Preference, user.id)
    await issue_session(db, response, user)
    return {"user": serialize_user(user, preference)}


@app.post("/api/auth/login")
async def login(
    payload: LoginInput, response: Response, db: AsyncSession = Depends(get_db)
) -> dict:
    identity = payload.username.strip().lower()
    user = await db.scalar(
        select(User).where(or_(User.username == identity, func.lower(User.email) == identity))
    )
    if not user or not verify_password(user.password_hash, payload.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    preference = await db.get(Preference, user.id)
    await issue_session(db, response, user)
    return {"user": serialize_user(user, preference)}


@app.post("/api/auth/logout", status_code=204)
async def logout(
    response: Response,
    momentum_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> Response:
    if momentum_session:
        session = await db.scalar(
            select(Session).where(Session.token_hash == token_hash(momentum_session))
        )
        if session:
            await db.delete(session)
            await db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")
    response.status_code = 204
    return response


@app.get("/api/auth/me")
async def me(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    preference = await db.get(Preference, user.id)
    return {"user": serialize_user(user, preference)}


@app.get("/api/dashboard")
async def dashboard(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    wallet_rows = await db.scalars(
        select(Wallet).where(Wallet.user_id == user.id).order_by(Wallet.id)
    )
    wallets = list(wallet_rows.all())
    transactions = list(
        (
            await db.scalars(
                select(Transaction)
                .where(Transaction.user_id == user.id)
                .order_by(Transaction.created_at.desc(), Transaction.id.desc())
                .limit(5)
            )
        ).all()
    )
    total = sum(
        (as_decimal(wallet.balance) * as_decimal(wallet.price_usd) for wallet in wallets),
        Decimal("0"),
    ).quantize(Decimal("0.01"))
    chart_profiles = {
        "1H": {
            "change": "0.12",
            "multipliers": ["0.9988", "0.9994", "0.9991", "1.0002", "0.9998", "1.0005", "1"],
        },
        "24H": {
            "change": "-0.60",
            "multipliers": [
                "1.0060", "1.0031", "1.0040", "1.0018", "0.9989", "1.0007", "0.9978",
                "0.9996", "0.9969", "0.9981", "0.9992", "0.9974", "1",
            ],
        },
        "1W": {
            "change": "2.84",
            "multipliers": [
                "0.9724", "0.9691", "0.9702", "0.9764", "0.9781", "0.9758", "0.9836",
                "0.9874", "0.9852", "0.9786", "0.9769", "0.9818", "1",
            ],
        },
        "1M": {
            "change": "8.17",
            "multipliers": [
                "0.9245", "0.9318", "0.9284", "0.9427", "0.9511", "0.9473", "0.9628",
                "0.9714", "0.9659", "0.9803", "0.9861", "0.9915", "1",
            ],
        },
        "ALL": {
            "change": "24.63",
            "multipliers": [
                "0.8023", "0.8248", "0.8171", "0.8516", "0.8794", "0.8712", "0.9057",
                "0.9316", "0.9188", "0.9541", "0.9725", "0.9632", "1",
            ],
        },
    }
    return {
        "total_balance": str(total),
        "periods": {
            period: {
                "change": profile["change"],
                "values": [
                    str((total * Decimal(multiplier)).quantize(Decimal("0.01")))
                    for multiplier in profile["multipliers"]
                ],
            }
            for period, profile in chart_profiles.items()
        },
        "wallets": [serialize_wallet(wallet) for wallet in wallets],
        "transactions": [serialize_transaction(item) for item in transactions],
    }


@app.get("/api/wallets")
async def wallets(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    items = (
        await db.scalars(select(Wallet).where(Wallet.user_id == user.id).order_by(Wallet.id))
    ).all()
    return {"items": [serialize_wallet(item) for item in items]}


@app.get("/api/transactions")
async def transactions(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    items = (
        await db.scalars(
            select(Transaction)
            .where(Transaction.user_id == user.id)
            .order_by(Transaction.created_at.desc(), Transaction.id.desc())
        )
    ).all()
    return {"items": [serialize_transaction(item) for item in items]}


@app.get("/api/preferences")
async def get_preferences(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    preference = await db.get(Preference, user.id)
    return {"theme": preference.theme, "sounds": preference.sounds}


@app.patch("/api/preferences")
async def update_preferences(
    payload: PreferenceInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    preference = await db.get(Preference, user.id)
    if payload.theme is not None:
        preference.theme = payload.theme
    if payload.sounds is not None:
        preference.sounds = payload.sounds
    await db.commit()
    return {"theme": preference.theme, "sounds": preference.sounds}


@app.get("/api/support/messages")
async def support_messages(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    items = (
        await db.scalars(
            select(SupportMessage)
            .where(SupportMessage.user_id == user.id)
            .order_by(SupportMessage.created_at, SupportMessage.id)
        )
    ).all()
    result = []
    for item in items:
        attachment = (
            await db.get(SupportAttachment, item.attachment_id) if item.attachment_id else None
        )
        result.append(
            {
                "id": item.id,
                "sender": item.sender,
                "body": item.body,
                "created_at": item.created_at,
                "attachment": (
                    {"id": attachment.id, "url": attachment.url, "filename": attachment.filename}
                    if attachment
                    else None
                ),
            }
        )
    preference = await db.get(Preference, user.id)
    unread_statement = select(func.count()).select_from(SupportMessage).where(
        SupportMessage.user_id == user.id,
        SupportMessage.sender == "support",
    )
    if preference.last_support_read_at is not None:
        unread_statement = unread_statement.where(
            SupportMessage.created_at > preference.last_support_read_at
        )
    unread_count = await db.scalar(unread_statement)
    return {"items": result, "unread_count": unread_count or 0}


@app.post("/api/support/read")
async def mark_support_read(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    preference = await db.get(Preference, user.id)
    preference.last_support_read_at = now()
    await db.commit()
    return {"unread_count": 0}


@app.post("/api/support/attachments", status_code=201)
async def upload_support_attachment(
    upload: UploadFile = File(...),
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    allowed = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
    if upload.content_type not in allowed:
        raise HTTPException(status_code=415, detail="Upload a PNG, JPEG, or WebP image")
    content = await upload.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Image must be smaller than 5 MB")
    safe_name = f"{user.id}-{uuid.uuid4().hex}{allowed[upload.content_type]}"
    path = settings.upload_dir / safe_name
    path.write_bytes(content)
    attachment = SupportAttachment(
        user_id=user.id,
        filename=(upload.filename or "screenshot")[:255],
        content_type=upload.content_type,
        url=f"/uploads/{safe_name}",
        size=len(content),
    )
    db.add(attachment)
    await db.commit()
    await db.refresh(attachment)
    return {"id": attachment.id, "url": attachment.url, "filename": attachment.filename}


@app.post("/api/support/messages", status_code=201)
async def post_support_message(
    payload: SupportMessageInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if payload.attachment_id:
        attachment = await db.scalar(
            select(SupportAttachment).where(
                SupportAttachment.id == payload.attachment_id,
                SupportAttachment.user_id == user.id,
            )
        )
        if not attachment:
            raise HTTPException(status_code=404, detail="Attachment not found")
    message = SupportMessage(
        user_id=user.id,
        sender="user",
        body=payload.body.strip(),
        attachment_id=payload.attachment_id,
    )
    db.add(message)
    await db.flush()
    reply = SupportMessage(
        user_id=user.id,
        sender="support",
        body="Thanks — we received your message. Your request is now in the support queue.",
    )
    db.add(reply)
    await db.commit()
    return {"message_id": message.id, "reply_id": reply.id}


@app.post("/api/demo/send", status_code=201)
async def demo_send(
    payload: SendInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    symbol = require_asset(payload.asset)
    wallet = await owned_wallet(db, user.id, symbol, lock=True)
    amount = as_decimal(payload.amount)
    if as_decimal(wallet.balance) < amount:
        raise HTTPException(status_code=422, detail="Insufficient balance")
    wallet.balance = as_decimal(wallet.balance) - amount
    transaction = Transaction(
        user_id=user.id,
        kind="send",
        status="approved",
        asset=symbol,
        amount=-amount,
        usd_value=(amount * as_decimal(wallet.price_usd)).quantize(Decimal("0.01")),
        title=f"Sent {symbol}",
        details={"address": payload.address[:12] + "…", "environment": "development"},
    )
    db.add(transaction)
    await db.commit()
    return {"transaction": serialize_transaction(transaction), "wallet": serialize_wallet(wallet)}


@app.post("/api/demo/buy", status_code=201)
async def demo_buy(
    payload: BuyInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    symbol = require_asset(payload.asset)
    wallet = await owned_wallet(db, user.id, symbol, lock=True)
    amount_usd = as_decimal(payload.amount_usd)
    quantity = (amount_usd / as_decimal(wallet.price_usd)).quantize(
        MONEY_EPSILON, rounding=ROUND_DOWN
    )
    wallet.balance = as_decimal(wallet.balance) + quantity
    transaction = Transaction(
        user_id=user.id,
        kind="buy",
        status="approved",
        asset=symbol,
        amount=quantity,
        usd_value=amount_usd.quantize(Decimal("0.01")),
        title=f"Bought {symbol}",
        details={"payment": "Account balance", "environment": "development"},
    )
    db.add(transaction)
    await db.commit()
    return {"transaction": serialize_transaction(transaction), "wallet": serialize_wallet(wallet)}


@app.post("/api/demo/swap", status_code=201)
async def demo_swap(
    payload: SwapInput, user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    from_symbol = require_asset(payload.from_asset)
    to_symbol = require_asset(payload.to_asset)
    if from_symbol == to_symbol:
        raise HTTPException(status_code=422, detail="Choose two different assets")
    source = await owned_wallet(db, user.id, from_symbol, lock=True)
    target = await owned_wallet(db, user.id, to_symbol, lock=True)
    amount = as_decimal(payload.amount)
    if as_decimal(source.balance) < amount:
        raise HTTPException(status_code=422, detail="Insufficient balance")
    usd_value = amount * as_decimal(source.price_usd)
    target_amount = ((usd_value * Decimal("0.995")) / as_decimal(target.price_usd)).quantize(
        MONEY_EPSILON, rounding=ROUND_DOWN
    )
    source.balance = as_decimal(source.balance) - amount
    target.balance = as_decimal(target.balance) + target_amount
    transaction = Transaction(
        user_id=user.id,
        kind="swap",
        status="approved",
        asset=from_symbol,
        amount=-amount,
        usd_value=usd_value.quantize(Decimal("0.01")),
        title=f"Swapped {from_symbol} to {to_symbol}",
        details={"received": str(target_amount), "target_asset": to_symbol, "fee": "0.5%"},
    )
    db.add(transaction)
    await db.commit()
    return {
        "transaction": serialize_transaction(transaction),
        "received": str(target_amount),
        "wallets": [serialize_wallet(source), serialize_wallet(target)],
    }


@app.post("/api/withdrawals", status_code=201)
async def create_withdrawal(
    payload: WithdrawalInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    symbol = require_asset(payload.asset)
    if payload.card_last4 != "4242":
        raise HTTPException(status_code=422, detail="Use the development card ending in 4242")
    wallet = await owned_wallet(db, user.id, symbol)
    amount = as_decimal(payload.amount)
    if as_decimal(wallet.balance) < amount:
        raise HTTPException(status_code=422, detail="Insufficient balance")
    withdrawal = Withdrawal(
        user_id=user.id,
        asset=symbol,
        amount=amount,
        cardholder=payload.cardholder.strip().upper(),
        card_last4=payload.card_last4,
        status="draft",
    )
    db.add(withdrawal)
    await db.commit()
    await db.refresh(withdrawal)
    return {"id": withdrawal.id, "status": withdrawal.status}


@app.post("/api/withdrawals/{withdrawal_id}/authorize")
async def authorize_withdrawal(
    withdrawal_id: int,
    payload: AuthorizeWithdrawalInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    withdrawal = await db.scalar(
        select(Withdrawal).where(Withdrawal.id == withdrawal_id, Withdrawal.user_id == user.id)
    )
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if withdrawal.status != "draft":
        raise HTTPException(status_code=409, detail="Withdrawal has already been authorized")
    if not verify_password(user.password_hash, payload.password):
        raise HTTPException(status_code=401, detail="Account password is incorrect")
    code = make_otp()
    challenge = VerificationChallenge(
        withdrawal_id=withdrawal.id,
        code_hash=token_hash(code),
        expires_at=now() + timedelta(minutes=5),
    )
    withdrawal.status = "verification"
    db.add(challenge)
    await db.commit()
    result = {"status": withdrawal.status, "expires_in": 300}
    if settings.demo_mode:
        result["demo_code"] = code
    return result


@app.post("/api/withdrawals/{withdrawal_id}/verify")
async def verify_withdrawal(
    withdrawal_id: int,
    payload: VerifyWithdrawalInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    withdrawal = await db.scalar(
        select(Withdrawal)
        .where(Withdrawal.id == withdrawal_id, Withdrawal.user_id == user.id)
        .with_for_update()
    )
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if withdrawal.status != "verification":
        raise HTTPException(status_code=409, detail="Withdrawal is not awaiting verification")
    challenge = await db.scalar(
        select(VerificationChallenge)
        .where(
            VerificationChallenge.withdrawal_id == withdrawal.id,
            VerificationChallenge.used.is_(False),
        )
        .order_by(VerificationChallenge.id.desc())
        .with_for_update()
    )
    if not challenge or challenge.expires_at < now():
        raise HTTPException(status_code=410, detail="Verification code expired")
    if challenge.attempts >= 5:
        raise HTTPException(status_code=429, detail="Too many verification attempts")
    if not secrets.compare_digest(challenge.code_hash, token_hash(payload.code)):
        challenge.attempts += 1
        await db.commit()
        raise HTTPException(status_code=422, detail="Invalid verification code")
    wallet = await owned_wallet(db, user.id, withdrawal.asset, lock=True)
    amount = as_decimal(withdrawal.amount)
    if as_decimal(wallet.balance) < amount:
        raise HTTPException(status_code=422, detail="Insufficient balance")
    wallet.balance = as_decimal(wallet.balance) - amount
    withdrawal.status = "pending"
    challenge.used = True
    transaction = Transaction(
        user_id=user.id,
        kind="withdrawal",
        status="pending",
        asset=withdrawal.asset,
        amount=-amount,
        usd_value=(amount * as_decimal(wallet.price_usd)).quantize(Decimal("0.01")),
        title=f"Card withdrawal ···· {withdrawal.card_last4}",
        details={"environment": "development", "card_last4": withdrawal.card_last4},
    )
    db.add(transaction)
    await db.commit()
    return {
        "id": withdrawal.id,
        "status": withdrawal.status,
        "transaction": serialize_transaction(transaction),
    }


@app.get("/api/app-config")
async def app_config() -> dict:
    return {
        "demo_mode": settings.demo_mode,
        "support_email": settings.support_email,
        "support_telegram": settings.support_telegram,
        "version": "1.0.0",
    }


async def serialize_staff_client(db: AsyncSession, user: User, detailed: bool = False) -> dict:
    wallets = list(
        (await db.scalars(select(Wallet).where(Wallet.user_id == user.id).order_by(Wallet.id))).all()
    )
    total = sum(
        (as_decimal(wallet.balance) * as_decimal(wallet.price_usd) for wallet in wallets),
        Decimal("0"),
    ).quantize(Decimal("0.01"))
    transaction_count = await db.scalar(
        select(func.count()).select_from(Transaction).where(Transaction.user_id == user.id)
    )
    last_message = await db.scalar(
        select(SupportMessage)
        .where(SupportMessage.user_id == user.id)
        .order_by(SupportMessage.created_at.desc(), SupportMessage.id.desc())
        .limit(1)
    )
    result = {
        "id": user.id,
        "name": user.name,
        "username": user.username,
        "email": user.email,
        "created_at": user.created_at,
        "total_balance": str(total),
        "transaction_count": transaction_count or 0,
        "needs_reply": bool(last_message and last_message.sender == "user"),
        "last_message_at": last_message.created_at if last_message else None,
    }
    if not detailed:
        return result
    messages = list(
        (
            await db.scalars(
                select(SupportMessage)
                .where(SupportMessage.user_id == user.id)
                .order_by(SupportMessage.created_at, SupportMessage.id)
            )
        ).all()
    )
    transactions = list(
        (
            await db.scalars(
                select(Transaction)
                .where(Transaction.user_id == user.id)
                .order_by(Transaction.created_at.desc(), Transaction.id.desc())
                .limit(30)
            )
        ).all()
    )
    codes = list(
        (
            await db.scalars(
                select(ConfirmationCode)
                .where(ConfirmationCode.user_id == user.id)
                .order_by(ConfirmationCode.created_at.desc(), ConfirmationCode.id.desc())
            )
        ).all()
    )
    result.update(
        {
            "wallets": [serialize_wallet(wallet) for wallet in wallets],
            "transactions": [serialize_transaction(item) for item in transactions],
            "messages": [
                {
                    "id": item.id,
                    "sender": item.sender,
                    "body": item.body,
                    "created_at": item.created_at,
                    "attachment": None,
                }
                for item in messages
            ],
            "codes": [
                {
                    "id": item.id,
                    "code": item.code,
                    "status": item.status,
                    "created_at": item.created_at,
                }
                for item in codes
            ],
        }
    )
    return result


@app.get("/api/staff/clients")
async def staff_clients(
    query: str = "",
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    statement = select(User).where(User.is_staff.is_(False))
    if query.strip():
        term = f"%{query.strip().lower()}%"
        statement = statement.where(
            or_(
                func.lower(User.name).like(term),
                func.lower(User.username).like(term),
                func.lower(User.email).like(term),
            )
        )
    users = list((await db.scalars(statement.order_by(User.created_at.desc(), User.id.desc()))).all())
    items = [await serialize_staff_client(db, user) for user in users]
    return {
        "items": items,
        "summary": {
            "clients": len(items),
            "portfolio": str(sum((as_decimal(item["total_balance"]) for item in items), Decimal("0"))),
            "needs_reply": sum(1 for item in items if item["needs_reply"]),
            "transactions": sum(item["transaction_count"] for item in items),
        },
    }


@app.get("/api/staff/clients/{user_id}")
async def staff_client(
    user_id: int,
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user = await db.scalar(select(User).where(User.id == user_id, User.is_staff.is_(False)))
    if not user:
        raise HTTPException(status_code=404, detail="Client not found")
    return {"client": await serialize_staff_client(db, user, detailed=True)}


@app.post("/api/staff/clients/{user_id}/balance", status_code=201)
async def staff_adjust_balance(
    user_id: int,
    payload: StaffBalanceInput,
    staff: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    client = await db.scalar(select(User).where(User.id == user_id, User.is_staff.is_(False)))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    symbol = require_asset(payload.asset)
    wallet = await owned_wallet(db, client.id, symbol, lock=True)
    amount = as_decimal(payload.amount)
    if payload.action == "debit" and as_decimal(wallet.balance) < amount:
        raise HTTPException(status_code=422, detail="Adjustment exceeds the available balance")
    direction = Decimal("1") if payload.action == "credit" else Decimal("-1")
    wallet.balance = as_decimal(wallet.balance) + amount * direction
    transaction = Transaction(
        user_id=client.id,
        kind="receive" if payload.action == "credit" else "send",
        status="approved",
        asset=symbol,
        amount=amount * direction,
        usd_value=(amount * as_decimal(wallet.price_usd)).quantize(Decimal("0.01")),
        title=f"Manual {payload.action} by Momentum Operations",
        details={"staff_id": staff.id, "reason": "Manual account adjustment"},
    )
    db.add(transaction)
    await db.commit()
    return {"client": await serialize_staff_client(db, client, detailed=True)}


@app.post("/api/staff/clients/{user_id}/messages", status_code=201)
async def staff_post_message(
    user_id: int,
    payload: SupportMessageInput,
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    client = await db.scalar(select(User).where(User.id == user_id, User.is_staff.is_(False)))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    message = SupportMessage(user_id=client.id, sender="support", body=payload.body.strip())
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return {"id": message.id}


@app.post("/api/staff/clients/{user_id}/codes", status_code=201)
async def staff_generate_codes(
    user_id: int,
    payload: StaffCodeInput,
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    client = await db.scalar(select(User).where(User.id == user_id, User.is_staff.is_(False)))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    created = []
    for _index in range(payload.count):
        item = ConfirmationCode(user_id=client.id, code=make_otp(), status="ready")
        db.add(item)
        created.append(item)
    await db.commit()
    return {"items": [{"id": item.id, "code": item.code, "status": item.status, "created_at": item.created_at} for item in created]}


@app.delete("/api/staff/clients/{user_id}/codes", status_code=204)
async def staff_clear_codes(
    user_id: int,
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> Response:
    items = list(
        (await db.scalars(select(ConfirmationCode).where(ConfirmationCode.user_id == user_id))).all()
    )
    for item in items:
        await db.delete(item)
    await db.commit()
    return Response(status_code=204)


static_dir = Path(__file__).resolve().parent.parent / "static"
if static_dir.exists():
    assets_dir = static_dir / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=assets_dir), name="frontend-assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def frontend_app(full_path: str) -> FileResponse:
        requested = static_dir / full_path
        if requested.is_file() and static_dir in requested.resolve().parents:
            return FileResponse(requested)
        return FileResponse(static_dir / "index.html")

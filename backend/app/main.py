from __future__ import annotations

import asyncio
import contextlib
import secrets
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from decimal import ROUND_DOWN, Decimal
from pathlib import Path

from fastapi import (
    Cookie,
    Depends,
    FastAPI,
    File,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import String, cast, delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .db import Base, SessionLocal, engine, get_db
from .models import (
    ConfirmationCode,
    DemoTransfer,
    DepositRequest,
    Preference,
    Session,
    SupportAttachment,
    SupportMessage,
    Transaction,
    User,
    Wallet,
)
from .prices import price_refresh_loop
from .schemas import (
    AccountSettingsInput,
    DemoCodeInput,
    DemoTransferInput,
    DepositRequestInput,
    LoginInput,
    PreferenceInput,
    RegisterInput,
    SendInput,
    StaffBalanceInput,
    StaffClientCreateInput,
    StaffClientSettingsInput,
    StaffCodeInput,
    StaffDepositDecisionInput,
    StaffProfileStatusInput,
    StaffTransactionUpdateInput,
    StaffVerificationInput,
    SupportMessageInput,
    SwapInput,
)
from .security import (
    hash_password,
    make_otp,
    make_session_token,
    make_temporary_password,
    token_hash,
    verify_password,
)
from .seed import assign_client_number, provision_user, seed_demo_user, seed_staff_workspace

COOKIE_NAME = "momentum_session"
STAFF_COOKIE_NAME = "momentum_staff_session"
SUPPORTED_ASSETS = {"BTC", "ETH", "USDT", "TON"}
MONEY_EPSILON = Decimal("0.00000001")
SWAP_FEE_RATE = Decimal("0.005")


@asynccontextmanager
async def lifespan(_: FastAPI):
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    # Tests use disposable SQLite databases and need their schema initialized.
    # PostgreSQL is persistent and must be changed exclusively through Alembic;
    # create_all() can create new tables but cannot upgrade existing ones, which
    # otherwise leaves a partially-upgraded schema before migrations run.
    if engine.dialect.name == "sqlite":
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    # The demo user and the fixed staff-workspace client roster are sandbox
    # fixtures, not real accounts — only seed them when running as a demo.
    if settings.demo_mode:
        async with SessionLocal() as session:
            await seed_demo_user(session)
            await seed_staff_workspace(session)
    price_task = (
        asyncio.create_task(price_refresh_loop(SessionLocal))
        if settings.price_refresh_enabled
        else None
    )
    try:
        yield
    finally:
        if price_task:
            price_task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await price_task


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


def utc_iso(value: datetime | None) -> str | None:
    return f"{value.isoformat()}Z" if value is not None else None


def naive_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def require_asset(asset: str) -> str:
    normalized = asset.upper()
    if normalized not in SUPPORTED_ASSETS:
        raise HTTPException(status_code=422, detail="Unsupported asset")
    return normalized


def serialize_user(
    user: User, preference: Preference | None = None, *, impersonating: bool = False
) -> dict:
    return {
        "id": user.id,
        "client_number": user.client_number,
        "name": "Demo" if user.username.lower() == "demo" else user.name,
        "username": user.username,
        "email": user.email,
        "created_at": user.created_at,
        "theme": preference.theme if preference else "dark",
        "sounds": preference.sounds if preference else True,
        "language": preference.language if preference else "en",
        "is_staff": user.is_staff,
        "impersonating": impersonating,
        "account_status": user.account_status,
        "daily_send_limit": str(as_decimal(user.daily_send_limit).quantize(Decimal("0.01"))),
        "monthly_send_limit": str(
            as_decimal(user.monthly_send_limit).quantize(Decimal("0.01"))
        ),
        "manual_review_threshold": str(
            as_decimal(user.manual_review_threshold).quantize(Decimal("0.01"))
        ),
        "verification": {
            "state": user.verification_state,
            "required": user.verification_target,
            "used": user.verification_used,
            "processing_until": utc_iso(user.processing_until),
        },
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
    details = transaction.details or {}
    return {
        "id": transaction.id,
        "kind": transaction.kind,
        "status": transaction.status,
        "asset": transaction.asset,
        "amount": str(as_decimal(transaction.amount).normalize()),
        "usd_value": str(as_decimal(transaction.usd_value).quantize(Decimal("0.01"))),
        "title": transaction.title,
        "details": details,
        "created_at": transaction.created_at,
        "effective_at": transaction.effective_at,
        "editable": is_manual_credit(transaction),
    }


def is_manual_credit(transaction: Transaction) -> bool:
    details = transaction.details or {}
    return (
        transaction.kind == "receive"
        and transaction.status == "approved"
        and details.get("reason") == "Manual account adjustment"
        and isinstance(details.get("staff_id"), int)
    )


def serialize_demo_transfer(item: DemoTransfer) -> dict:
    return {
        "id": item.id,
        "method": item.method,
        "asset": item.asset,
        "amount": str(as_decimal(item.amount).normalize()),
        "destination": item.destination,
        "status": item.status,
        "required_codes": item.required_codes,
        "used_codes": item.used_codes,
        "processing_until": utc_iso(item.processing_until),
        "created_at": item.created_at,
    }


def serialize_deposit_request(item: DepositRequest) -> dict:
    return {
        "id": item.id,
        "asset": item.asset,
        "amount_usd": str(as_decimal(item.amount_usd).quantize(Decimal("0.01"))),
        "status": item.status,
        "created_at": item.created_at,
        "decided_at": utc_iso(item.decided_at),
    }


async def refresh_demo_transfer(
    db: AsyncSession, user: User, transfer: DemoTransfer
) -> DemoTransfer:
    if (
        transfer.status == "processing"
        and transfer.processing_until is not None
        and transfer.processing_until <= now()
    ):
        transfer.status = "completed"
        user.verification_state = "completed"
        user.processing_until = None
        if transfer.transaction_id:
            transaction = await db.get(Transaction, transfer.transaction_id)
            if transaction:
                transaction.status = "approved"
        await db.commit()
    return transfer


async def begin_demo_processing(
    db: AsyncSession, user: User, transfer: DemoTransfer
) -> None:
    wallet = await owned_wallet(db, user.id, transfer.asset, lock=True)
    amount = as_decimal(transfer.amount)
    if as_decimal(wallet.balance) < amount:
        raise HTTPException(status_code=422, detail="Insufficient balance")
    wallet.balance = as_decimal(wallet.balance) - amount
    processing_until = now() + timedelta(hours=24)
    transfer.status = "processing"
    transfer.processing_until = processing_until
    user.verification_state = "processing"
    user.processing_until = processing_until
    title = (
        f"Demo card transfer ···· {transfer.destination}"
        if transfer.method == "card"
        else f"Demo crypto transfer to {transfer.destination[:12]}…"
    )
    transaction = Transaction(
        user_id=user.id,
        kind="withdrawal" if transfer.method == "card" else "send",
        status="pending",
        asset=transfer.asset,
        amount=-amount,
        usd_value=(amount * as_decimal(wallet.price_usd)).quantize(Decimal("0.01")),
        title=title,
        details={"method": transfer.method, "environment": "development"},
    )
    db.add(transaction)
    await db.flush()
    transfer.transaction_id = transaction.id


async def authenticated_user(
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


async def current_user(user: User = Depends(authenticated_user)) -> User:
    if user.account_status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not active")
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
    set_session_cookie(response, COOKIE_NAME, raw_token)


def set_session_cookie(response: Response, name: str, raw_token: str) -> None:
    response.set_cookie(
        name,
        raw_token,
        max_age=settings.session_days * 86400,
        httponly=True,
        secure=not settings.demo_mode,
        samesite="lax",
        path="/",
    )


async def current_staff(
    momentum_session: str | None = Cookie(default=None),
    momentum_staff_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> User:
    # During impersonation the active session belongs to the client, while the
    # moderator's session is retained in a separate HttpOnly cookie. Only use
    # that backup after the active token has actually expired: a valid client
    # token must never gain staff API access.
    try:
        user = await authenticated_user(momentum_session, db)
    except HTTPException as error:
        if error.status_code != status.HTTP_401_UNAUTHORIZED:
            raise
        staff = await valid_staff_session(db, momentum_staff_session)
        if staff:
            return staff
        raise

    if user.account_status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not active")
    if not user.is_staff:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Staff access required")
    return user


async def valid_staff_session(db: AsyncSession, raw_token: str | None) -> User | None:
    if not raw_token:
        return None
    return await db.scalar(
        select(User)
        .join(Session, Session.user_id == User.id)
        .where(
            Session.token_hash == token_hash(raw_token),
            Session.expires_at > now(),
            User.is_staff.is_(True),
            User.account_status == "active",
        )
    )


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
        client_number=await assign_client_number(db),
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
    momentum_staff_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> Response:
    raw_tokens = {token for token in (momentum_session, momentum_staff_session) if token}
    if raw_tokens:
        sessions = await db.scalars(
            select(Session).where(
                Session.token_hash.in_([token_hash(token) for token in raw_tokens])
            )
        )
        for session in sessions.all():
            await db.delete(session)
        await db.commit()
    response.delete_cookie(COOKIE_NAME, path="/")
    response.delete_cookie(STAFF_COOKIE_NAME, path="/")
    response.status_code = 204
    return response


@app.get("/api/auth/me")
async def me(
    user: User = Depends(authenticated_user),
    momentum_staff_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    preference = await db.get(Preference, user.id)
    impersonating = not user.is_staff and bool(
        await valid_staff_session(db, momentum_staff_session)
    )
    return {"user": serialize_user(user, preference, impersonating=impersonating)}


@app.post("/api/staff/clients/{user_id}/impersonate")
async def staff_impersonate_client(
    user_id: int,
    response: Response,
    momentum_session: str | None = Cookie(default=None),
    momentum_staff_session: str | None = Cookie(default=None),
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    client = await db.scalar(select(User).where(User.id == user_id, User.is_staff.is_(False)))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    staff_token = (
        momentum_session
        if await valid_staff_session(db, momentum_session)
        else momentum_staff_session
    )
    if not staff_token:
        raise HTTPException(status_code=401, detail="Staff session expired")

    # Preserve the staff token only in a second HttpOnly cookie. The browser
    # never receives a client password, and the staff session remains the sole
    # authority that can restore the operations workspace.
    set_session_cookie(response, STAFF_COOKIE_NAME, staff_token)
    preference = await db.get(Preference, client.id)
    await issue_session(db, response, client)
    return {"user": serialize_user(client, preference, impersonating=True)}


@app.post("/api/auth/impersonation/exit")
async def exit_staff_impersonation(
    response: Response,
    momentum_session: str | None = Cookie(default=None),
    momentum_staff_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    if not momentum_staff_session:
        raise HTTPException(status_code=401, detail="No staff session to restore")
    staff = await valid_staff_session(db, momentum_staff_session)
    if not staff:
        raise HTTPException(status_code=401, detail="Staff session expired")

    if momentum_session:
        client_session = await db.scalar(
            select(Session).where(Session.token_hash == token_hash(momentum_session))
        )
        if client_session:
            await db.delete(client_session)
            await db.commit()
    set_session_cookie(response, COOKIE_NAME, momentum_staff_session)
    response.delete_cookie(STAFF_COOKIE_NAME, path="/")
    preference = await db.get(Preference, staff.id)
    return {"user": serialize_user(staff, preference)}


# (period label, lookback window or None for "since account creation", sample points)
PERIOD_WINDOWS: list[tuple[str, timedelta | None, int]] = [
    ("1H", timedelta(hours=1), 7),
    ("24H", timedelta(hours=24), 13),
    ("1W", timedelta(days=7), 13),
    ("1M", timedelta(days=30), 13),
    ("ALL", None, 13),
]


def transaction_asset_deltas(transaction: Transaction) -> list[tuple[str, Decimal]]:
    """Signed quantity change(s) a transaction applied to the user's wallets.

    Every kind but swap moves a single asset, recorded directly on `amount`.
    A swap only writes a Transaction row for the "from" leg - the "to" leg
    (what the other wallet gained) lives in `details`, stashed there at
    swap time - so both legs have to be pulled from this one row.
    """
    if transaction.kind == "swap":
        deltas = [(transaction.asset, as_decimal(transaction.amount))]
        details = transaction.details or {}
        received = details.get("received")
        target_asset = details.get("target_asset")
        if received is not None and target_asset:
            deltas.append((target_asset, as_decimal(received)))
        return deltas
    return [(transaction.asset, as_decimal(transaction.amount))]


def portfolio_history(
    wallets: list[Wallet],
    transactions: list[Transaction],
    window_start: datetime,
    sample_count: int,
) -> list[Decimal]:
    """Reconstruct total portfolio value at `sample_count` evenly spaced
    points across [window_start, now].

    Unwinds the transaction ledger backwards to get each asset's *quantity*
    at each point in time, then prices every point at today's live rate.
    Pricing everything on one consistent (current) basis - rather than each
    transaction's own historical usd_value snapshot - keeps this from
    producing nonsense like a negative portfolio value when an asset's price
    has since moved a lot. `transactions` must be sorted ascending by
    effective_at.
    """
    price_by_symbol = {wallet.symbol: as_decimal(wallet.price_usd) for wallet in wallets}
    running_balance = {wallet.symbol: as_decimal(wallet.balance) for wallet in wallets}
    end = now()
    if sample_count <= 1 or window_start >= end:
        total_now = sum(
            (running_balance[symbol] * price_by_symbol[symbol] for symbol in running_balance),
            Decimal("0"),
        ).quantize(Decimal("0.01"))
        return [total_now] * max(sample_count, 1)
    step = (end - window_start) / (sample_count - 1)
    timestamps = [window_start + step * index for index in range(sample_count)]
    timestamps[-1] = end
    remaining = list(transactions)
    values: list[Decimal] = []
    for timestamp in reversed(timestamps):
        while remaining and remaining[-1].effective_at > timestamp:
            for asset, delta in transaction_asset_deltas(remaining.pop()):
                if asset in running_balance:
                    running_balance[asset] -= delta
        total_at_t = sum(
            (running_balance[symbol] * price_by_symbol[symbol] for symbol in running_balance),
            Decimal("0"),
        ).quantize(Decimal("0.01"))
        values.append(total_at_t)
    values.reverse()
    return values


@app.get("/api/dashboard")
async def dashboard(user: User = Depends(current_user), db: AsyncSession = Depends(get_db)) -> dict:
    wallet_rows = await db.scalars(
        select(Wallet).where(Wallet.user_id == user.id).order_by(Wallet.id)
    )
    wallets = list(wallet_rows.all())
    all_transactions = list(
        (
            await db.scalars(
                select(Transaction)
                .where(Transaction.user_id == user.id)
                .order_by(Transaction.effective_at, Transaction.id)
            )
        ).all()
    )
    recent_transactions = list(reversed(all_transactions[-5:]))
    total = sum(
        (as_decimal(wallet.balance) * as_decimal(wallet.price_usd) for wallet in wallets),
        Decimal("0"),
    ).quantize(Decimal("0.01"))

    periods = {}
    for label, window, sample_count in PERIOD_WINDOWS:
        window_start = user.created_at if window is None else max(user.created_at, now() - window)
        values = portfolio_history(wallets, all_transactions, window_start, sample_count)
        first, last = values[0], values[-1]
        change = (
            ((last - first) / first * 100).quantize(Decimal("0.01"))
            if first != 0
            else Decimal("0.00")
        )
        periods[label] = {"change": str(change), "values": [str(value) for value in values]}

    return {
        "total_balance": str(total),
        "periods": periods,
        "wallets": [serialize_wallet(wallet) for wallet in wallets],
        "transactions": [serialize_transaction(item) for item in recent_transactions],
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
            .order_by(Transaction.effective_at.desc(), Transaction.id.desc())
        )
    ).all()
    return {"items": [serialize_transaction(item) for item in items]}


@app.get("/api/preferences")
async def get_preferences(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    preference = await db.get(Preference, user.id)
    return {
        "theme": preference.theme,
        "sounds": preference.sounds,
        "language": preference.language,
    }


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
    if payload.language is not None:
        preference.language = payload.language
    await db.commit()
    return {
        "theme": preference.theme,
        "sounds": preference.sounds,
        "language": preference.language,
    }


@app.patch("/api/account/settings")
async def update_account_settings(
    payload: AccountSettingsInput,
    user: User = Depends(current_user),
    momentum_staff_session: str | None = Cookie(default=None),
    db: AsyncSession = Depends(get_db),
) -> dict:
    user.name = payload.name
    user.profile_label = user.name
    user.username = payload.username.strip().lower()
    user.email = str(payload.email).lower()
    user.daily_send_limit = as_decimal(payload.daily_send_limit)
    user.monthly_send_limit = as_decimal(payload.monthly_send_limit)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Username or email is already registered")
    preference = await db.get(Preference, user.id)
    impersonating = not user.is_staff and bool(
        await valid_staff_session(db, momentum_staff_session)
    )
    return {"user": serialize_user(user, preference, impersonating=impersonating)}


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


@app.post("/api/demo/transfers", status_code=201)
async def create_demo_transfer(
    payload: DemoTransferInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    existing = await db.scalar(
        select(DemoTransfer)
        .where(
            DemoTransfer.user_id == user.id,
            DemoTransfer.status.in_(("verification", "processing")),
        )
        .order_by(DemoTransfer.id.desc())
    )
    if existing:
        await refresh_demo_transfer(db, user, existing)
        if existing.status != "completed":
            raise HTTPException(status_code=409, detail="Finish the active demo transfer first")
    if (
        user.verification_target > 0
        and user.verification_used >= user.verification_target
        and user.verification_state == "completed"
    ):
        raise HTTPException(
            status_code=409,
            detail="The completed code requirement must be reset by a moderator",
        )

    symbol = require_asset(payload.asset)
    wallet = await owned_wallet(db, user.id, symbol)
    amount = as_decimal(payload.amount)
    if as_decimal(wallet.balance) < amount:
        raise HTTPException(status_code=422, detail="Insufficient balance")
    transfer = DemoTransfer(
        user_id=user.id,
        method=payload.method,
        asset=symbol,
        amount=amount,
        destination=payload.destination.strip(),
        status="verification",
        required_codes=user.verification_target,
        used_codes=user.verification_used,
    )
    db.add(transfer)
    user.verification_state = "verification"
    user.processing_until = None
    await db.flush()
    if transfer.used_codes >= transfer.required_codes:
        await begin_demo_processing(db, user, transfer)
    await db.commit()
    await db.refresh(transfer)
    return {"transfer": serialize_demo_transfer(transfer)}


@app.get("/api/demo/transfers/active")
async def active_demo_transfer(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    transfer = await db.scalar(
        select(DemoTransfer)
        .where(
            DemoTransfer.user_id == user.id,
            DemoTransfer.status.in_(("verification", "processing")),
        )
        .order_by(DemoTransfer.id.desc())
    )
    if not transfer:
        return {"transfer": None}
    await refresh_demo_transfer(db, user, transfer)
    if transfer.status == "completed":
        return {"transfer": None}
    return {"transfer": serialize_demo_transfer(transfer)}


@app.get("/api/demo/transfers/{transfer_id}")
async def demo_transfer_status(
    transfer_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    transfer = await db.scalar(
        select(DemoTransfer).where(
            DemoTransfer.id == transfer_id, DemoTransfer.user_id == user.id
        )
    )
    if not transfer:
        raise HTTPException(status_code=404, detail="Demo transfer not found")
    await refresh_demo_transfer(db, user, transfer)
    return {"transfer": serialize_demo_transfer(transfer)}


@app.delete("/api/demo/transfers/{transfer_id}", status_code=204)
async def cancel_demo_transfer(
    transfer_id: int,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    transfer = await db.scalar(
        select(DemoTransfer)
        .where(DemoTransfer.id == transfer_id, DemoTransfer.user_id == user.id)
        .with_for_update()
    )
    if not transfer:
        raise HTTPException(status_code=404, detail="Demo transfer not found")
    if transfer.status != "verification":
        raise HTTPException(
            status_code=409, detail="Only a transfer awaiting verification can be cancelled"
        )
    transfer.status = "cancelled"
    user.verification_state = (
        "locked" if user.verification_target > user.verification_used else "completed"
    )
    await db.commit()
    return Response(status_code=204)


@app.post("/api/demo/transfers/{transfer_id}/codes")
async def submit_demo_transfer_code(
    transfer_id: int,
    payload: DemoCodeInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    transfer = await db.scalar(
        select(DemoTransfer)
        .where(DemoTransfer.id == transfer_id, DemoTransfer.user_id == user.id)
        .with_for_update()
    )
    if not transfer:
        raise HTTPException(status_code=404, detail="Demo transfer not found")
    if transfer.status != "verification":
        raise HTTPException(status_code=409, detail="Transfer is not awaiting codes")
    next_code = await db.scalar(
        select(ConfirmationCode)
        .where(
            ConfirmationCode.user_id == user.id,
            ConfirmationCode.status == "ready",
        )
        .order_by(ConfirmationCode.created_at, ConfirmationCode.id)
        .with_for_update()
    )
    if not next_code:
        raise HTTPException(
            status_code=409,
            detail=(
                "No unused confirmation codes are available. "
                "Ask the moderator to generate more."
            ),
        )
    if not secrets.compare_digest(next_code.code, payload.code):
        raise HTTPException(status_code=422, detail="Enter the next confirmation code")
    next_code.status = "used"
    transfer.used_codes += 1
    user.verification_used += 1
    if transfer.used_codes >= transfer.required_codes:
        await begin_demo_processing(db, user, transfer)
    await db.commit()
    await db.refresh(transfer)
    return {"transfer": serialize_demo_transfer(transfer)}


@app.get("/api/verification/status")
async def verification_status(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    transfer = await db.scalar(
        select(DemoTransfer)
        .where(
            DemoTransfer.user_id == user.id,
            DemoTransfer.status.in_(("verification", "processing")),
        )
        .order_by(DemoTransfer.id.desc())
    )
    if transfer:
        await refresh_demo_transfer(db, user, transfer)
    return {
        "state": user.verification_state,
        "required": user.verification_target,
        "used": user.verification_used,
        "processing_until": utc_iso(user.processing_until),
        "active_transfer_id": transfer.id if transfer and transfer.status != "completed" else None,
    }


@app.get("/api/deposit-requests")
async def deposit_requests(
    user: User = Depends(current_user), db: AsyncSession = Depends(get_db)
) -> dict:
    items = list(
        (
            await db.scalars(
                select(DepositRequest)
                .where(DepositRequest.user_id == user.id)
                .order_by(DepositRequest.created_at.desc(), DepositRequest.id.desc())
            )
        ).all()
    )
    return {"items": [serialize_deposit_request(item) for item in items]}


@app.post("/api/deposit-requests", status_code=201)
@app.post("/api/demo/buy", status_code=201, include_in_schema=False)
async def create_deposit_request(
    payload: DepositRequestInput,
    user: User = Depends(current_user),
    db: AsyncSession = Depends(get_db),
) -> dict:
    symbol = require_asset(payload.asset)
    amount_usd = as_decimal(payload.amount_usd)
    pending = await db.scalar(
        select(DepositRequest).where(
            DepositRequest.user_id == user.id, DepositRequest.status == "pending"
        )
    )
    if pending:
        raise HTTPException(status_code=409, detail="A deposit request is already under review")
    request = DepositRequest(
        user_id=user.id,
        asset=symbol,
        amount_usd=amount_usd.quantize(Decimal("0.01")),
        status="pending",
    )
    db.add(request)
    db.add(
        SupportMessage(
            user_id=user.id,
            sender="user",
            body=(
                f"Deposit request: ${amount_usd.quantize(Decimal('0.01'))} in {symbol}. "
                "Please verify my account and review the request."
            ),
        )
    )
    await db.commit()
    await db.refresh(request)
    return {"request": serialize_deposit_request(request)}


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
    target_amount = (
        (usd_value * (1 - SWAP_FEE_RATE)) / as_decimal(target.price_usd)
    ).quantize(MONEY_EPSILON, rounding=ROUND_DOWN)
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
        details={
            "received": str(target_amount),
            "target_asset": to_symbol,
            "fee": f"{SWAP_FEE_RATE * 100}%",
        },
    )
    db.add(transaction)
    await db.commit()
    return {
        "transaction": serialize_transaction(transaction),
        "received": str(target_amount),
        "wallets": [serialize_wallet(source), serialize_wallet(target)],
    }


@app.get("/api/app-config")
async def app_config() -> dict:
    return {
        "demo_mode": settings.demo_mode,
        "version": "1.0.0",
    }


async def serialize_staff_client(db: AsyncSession, user: User, detailed: bool = False) -> dict:
    wallets = list(
        (
            await db.scalars(
                select(Wallet).where(Wallet.user_id == user.id).order_by(Wallet.id)
            )
        ).all()
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
        "client_number": user.client_number,
        "name": user.name,
        "account_status": user.account_status,
        "username": user.username,
        "email": user.email,
        "created_at": user.created_at,
        "total_balance": str(total),
        "transaction_count": transaction_count or 0,
        "needs_reply": bool(last_message and last_message.sender == "user"),
        "last_message_at": last_message.created_at if last_message else None,
        "verification_state": user.verification_state,
        "verification_required": user.verification_target,
        "verification_used": user.verification_used,
        "processing_until": utc_iso(user.processing_until),
        "daily_send_limit": str(as_decimal(user.daily_send_limit).quantize(Decimal("0.01"))),
        "monthly_send_limit": str(
            as_decimal(user.monthly_send_limit).quantize(Decimal("0.01"))
        ),
        "manual_review_threshold": str(
            as_decimal(user.manual_review_threshold).quantize(Decimal("0.01"))
        ),
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
                .order_by(Transaction.effective_at.desc(), Transaction.id.desc())
                .limit(30)
            )
        ).all()
    )
    codes = list(
        (
            await db.scalars(
                select(ConfirmationCode)
                .where(ConfirmationCode.user_id == user.id)
                .order_by(ConfirmationCode.created_at, ConfirmationCode.id)
            )
        ).all()
    )
    deposits = list(
        (
            await db.scalars(
                select(DepositRequest)
                .where(DepositRequest.user_id == user.id)
                .order_by(DepositRequest.created_at.desc(), DepositRequest.id.desc())
            )
        ).all()
    )
    preference = await db.get(Preference, user.id)
    result.update(
        {
            "theme": preference.theme if preference else "dark",
            "sounds": preference.sounds if preference else True,
            "language": preference.language if preference else "en",
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
            "deposit_requests": [serialize_deposit_request(item) for item in deposits],
        }
    )
    return result


def serialize_staff_client_summary(
    user: User,
    total_balance: Decimal | int,
    transaction_count: int,
    last_message_sender: str | None,
    last_message_at: datetime | None,
) -> dict:
    return {
        "id": user.id,
        "client_number": user.client_number,
        "name": user.name,
        "account_status": user.account_status,
        "username": user.username,
        "email": user.email,
        "created_at": user.created_at,
        "total_balance": str(as_decimal(total_balance).quantize(Decimal("0.01"))),
        "transaction_count": transaction_count,
        "needs_reply": last_message_sender == "user",
        "last_message_at": last_message_at,
        "verification_state": user.verification_state,
        "verification_required": user.verification_target,
        "verification_used": user.verification_used,
        "processing_until": utc_iso(user.processing_until),
    }


@app.post("/api/staff/clients", status_code=201)
async def staff_create_client(
    payload: StaffClientCreateInput,
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    username = payload.username.strip().lower()
    email = str(payload.email).lower()
    temporary_password = make_temporary_password()
    user = User(
        name=payload.name.strip(),
        # Retained internally for compatibility with existing databases; the
        # staff product uses the client's actual name as its display name.
        profile_label=payload.name.strip(),
        username=username,
        email=email,
        password_hash=hash_password(temporary_password),
        verification_target=payload.required_codes,
        verification_used=0,
        verification_state="locked" if payload.required_codes else "completed",
        client_number=await assign_client_number(db),
    )
    db.add(user)
    try:
        await db.flush()
        await provision_user(db, user)
        for _index in range(payload.required_codes):
            db.add(ConfirmationCode(user_id=user.id, code=make_otp(), status="ready"))
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Username or email is already registered")
    return {
        "client": await serialize_staff_client(db, user, detailed=True),
        "temporary_password": temporary_password,
    }


@app.post("/api/staff/clients/{user_id}/reset-password")
async def staff_reset_client_password(
    user_id: int,
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    client = await db.scalar(select(User).where(User.id == user_id, User.is_staff.is_(False)))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    temporary_password = make_temporary_password()
    client.password_hash = hash_password(temporary_password)
    sessions = list((await db.scalars(select(Session).where(Session.user_id == client.id))).all())
    for session in sessions:
        await db.delete(session)
    await db.commit()
    return {"temporary_password": temporary_password}


@app.patch("/api/staff/clients/{user_id}/verification")
async def staff_update_verification(
    user_id: int,
    payload: StaffVerificationInput,
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    client = await db.scalar(select(User).where(User.id == user_id, User.is_staff.is_(False)))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    active_transfer = await db.scalar(
        select(DemoTransfer)
        .where(
            DemoTransfer.user_id == client.id,
            DemoTransfer.status == "verification",
        )
        .order_by(DemoTransfer.id.desc())
        .with_for_update()
    )
    minimum_used = active_transfer.used_codes if active_transfer else client.verification_used
    if payload.required_codes < minimum_used:
        raise HTTPException(
            status_code=422,
            detail="Required codes cannot be lower than the number already used",
        )
    client.verification_target = payload.required_codes
    if active_transfer:
        active_transfer.required_codes = payload.required_codes
        client.verification_state = "verification"
        if active_transfer.used_codes >= active_transfer.required_codes:
            await begin_demo_processing(db, client, active_transfer)
    elif client.verification_state not in {"verification", "processing"}:
        client.verification_state = (
            "locked" if payload.required_codes > client.verification_used else "completed"
        )
    await db.commit()
    return {"client": await serialize_staff_client(db, client, detailed=True)}


@app.patch("/api/staff/clients/{user_id}/transactions/{transaction_id}")
async def staff_update_manual_credit(
    user_id: int,
    transaction_id: int,
    payload: StaffTransactionUpdateInput,
    staff: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    client = await db.scalar(
        select(User).where(User.id == user_id, User.is_staff.is_(False))
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    transaction = await db.scalar(
        select(Transaction)
        .where(Transaction.id == transaction_id, Transaction.user_id == client.id)
        .with_for_update()
    )
    if not transaction:
        raise HTTPException(status_code=404, detail="Transaction not found")
    if not is_manual_credit(transaction):
        raise HTTPException(status_code=422, detail="Only manual credits can be edited")

    effective_at = naive_utc(payload.effective_at)
    current_time = now()
    if effective_at < client.created_at:
        raise HTTPException(
            status_code=422, detail="Credit date cannot be before account creation"
        )
    if effective_at > current_time:
        raise HTTPException(status_code=422, detail="Credit date cannot be in the future")

    wallet = await owned_wallet(db, client.id, transaction.asset, lock=True)
    old_amount = as_decimal(transaction.amount)
    new_amount = as_decimal(payload.amount).quantize(MONEY_EPSILON, rounding=ROUND_DOWN)
    next_balance = as_decimal(wallet.balance) + new_amount - old_amount
    if next_balance < 0:
        raise HTTPException(
            status_code=422,
            detail="Credit cannot be reduced below the amount still available in the wallet",
        )

    wallet.balance = next_balance
    transaction.amount = new_amount
    transaction.usd_value = (new_amount * as_decimal(wallet.price_usd)).quantize(
        Decimal("0.01")
    )
    transaction.effective_at = effective_at
    transaction.details = {
        **(transaction.details or {}),
        "last_edited_by_staff_id": staff.id,
        "last_edited_at": utc_iso(current_time),
    }
    await db.commit()
    return {"client": await serialize_staff_client(db, client, detailed=True)}


@app.patch("/api/staff/clients/{user_id}/status")
async def staff_update_client_status(
    user_id: int,
    payload: StaffProfileStatusInput,
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    client = await db.scalar(select(User).where(User.id == user_id, User.is_staff.is_(False)))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client.account_status = payload.status
    if payload.status != "active":
        sessions = list(
            (await db.scalars(select(Session).where(Session.user_id == client.id))).all()
        )
        for session in sessions:
            await db.delete(session)
    await db.commit()
    return {"client": await serialize_staff_client(db, client, detailed=True)}


@app.patch("/api/staff/clients/{user_id}/settings")
async def staff_update_client_settings(
    user_id: int,
    payload: StaffClientSettingsInput,
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    client = await db.scalar(select(User).where(User.id == user_id, User.is_staff.is_(False)))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    client.name = payload.name.strip()
    client.profile_label = client.name
    client.username = payload.username.strip().lower()
    client.email = str(payload.email).lower()
    client.daily_send_limit = as_decimal(payload.daily_send_limit)
    client.monthly_send_limit = as_decimal(payload.monthly_send_limit)
    client.manual_review_threshold = as_decimal(payload.manual_review_threshold)
    if payload.theme is not None or payload.sounds is not None:
        preference = await db.get(Preference, client.id)
        if not preference:
            preference = Preference(user_id=client.id)
            db.add(preference)
        if payload.theme is not None:
            preference.theme = payload.theme
        if payload.sounds is not None:
            preference.sounds = payload.sounds
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Username or email is already registered")
    return {"client": await serialize_staff_client(db, client, detailed=True)}


@app.get("/api/staff/clients")
async def staff_clients(
    query: str = "",
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    filters = [User.is_staff.is_(False)]
    if query.strip():
        normalized_query = query.strip().lower()
        term = f"%{normalized_query}%"
        username_term = f"%{normalized_query.removeprefix('@')}%"
        id_term = f"%{normalized_query.removeprefix('#')}%"
        filters.append(
            or_(
                cast(User.id, String).like(id_term),
                func.lower(User.name).like(term),
                func.lower(User.username).like(username_term),
                func.lower(User.email).like(term),
            )
        )

    total = int(
        await db.scalar(select(func.count()).select_from(User).where(*filters)) or 0
    )
    pages = max(1, (total + page_size - 1) // page_size)
    resolved_page = min(page, pages)

    wallet_totals = (
        select(
            Wallet.user_id.label("user_id"),
            func.sum(Wallet.balance * Wallet.price_usd).label("total_balance"),
        )
        .group_by(Wallet.user_id)
        .subquery()
    )
    transaction_totals = (
        select(
            Transaction.user_id.label("user_id"),
            func.count(Transaction.id).label("transaction_count"),
        )
        .group_by(Transaction.user_id)
        .subquery()
    )
    last_message_ids = (
        select(
            SupportMessage.user_id.label("user_id"),
            func.max(SupportMessage.id).label("message_id"),
        )
        .group_by(SupportMessage.user_id)
        .subquery()
    )
    statement = (
        select(
            User,
            func.coalesce(wallet_totals.c.total_balance, 0),
            func.coalesce(transaction_totals.c.transaction_count, 0),
            SupportMessage.sender,
            SupportMessage.created_at,
        )
        .outerjoin(wallet_totals, wallet_totals.c.user_id == User.id)
        .outerjoin(transaction_totals, transaction_totals.c.user_id == User.id)
        .outerjoin(last_message_ids, last_message_ids.c.user_id == User.id)
        .outerjoin(SupportMessage, SupportMessage.id == last_message_ids.c.message_id)
        .where(*filters)
        .order_by(User.created_at.desc(), User.id.desc())
        .offset((resolved_page - 1) * page_size)
        .limit(page_size)
    )
    rows = (await db.execute(statement)).all()
    items = [
        serialize_staff_client_summary(
            user, total_balance, transaction_count, last_message_sender, last_message_at
        )
        for user, total_balance, transaction_count, last_message_sender, last_message_at in rows
    ]

    portfolio = await db.scalar(
        select(func.coalesce(func.sum(Wallet.balance * Wallet.price_usd), 0))
        .select_from(User)
        .join(Wallet, Wallet.user_id == User.id)
        .where(*filters)
    )
    transaction_count = await db.scalar(
        select(func.count(Transaction.id))
        .select_from(User)
        .join(Transaction, Transaction.user_id == User.id)
        .where(*filters)
    )
    needs_reply = await db.scalar(
        select(func.count())
        .select_from(User)
        .join(last_message_ids, last_message_ids.c.user_id == User.id)
        .join(SupportMessage, SupportMessage.id == last_message_ids.c.message_id)
        .where(*filters, SupportMessage.sender == "user")
    )
    return {
        "items": items,
        "summary": {
            "clients": total,
            "portfolio": str(as_decimal(portfolio or 0).quantize(Decimal("0.01"))),
            "needs_reply": int(needs_reply or 0),
            "transactions": int(transaction_count or 0),
        },
        "pagination": {
            "page": resolved_page,
            "page_size": page_size,
            "total": total,
            "pages": pages,
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
    amount = as_decimal(payload.amount).quantize(MONEY_EPSILON, rounding=ROUND_DOWN)
    current_balance = as_decimal(wallet.balance)
    adjustment = amount if payload.action == "credit" else amount - current_balance
    wallet.balance = current_balance + adjustment
    if not adjustment:
        await db.commit()
        return {"client": await serialize_staff_client(db, client, detailed=True)}
    transaction = Transaction(
        user_id=client.id,
        kind="receive" if payload.action == "credit" else "adjustment",
        status="approved",
        asset=symbol,
        amount=adjustment,
        usd_value=(adjustment * as_decimal(wallet.price_usd)).quantize(Decimal("0.01")),
        title=f"Received {symbol}" if payload.action == "credit" else f"Adjusted {symbol} balance",
        details={
            "staff_id": staff.id,
            "reason": (
                "Manual account adjustment"
                if payload.action == "credit"
                else "Manual balance override"
            ),
            **({"balance_after": str(amount)} if payload.action == "set" else {}),
        },
    )
    db.add(transaction)
    await db.commit()
    return {"client": await serialize_staff_client(db, client, detailed=True)}


@app.delete("/api/staff/clients/{user_id}", status_code=204)
async def staff_delete_client(
    user_id: int,
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> Response:
    client = await db.scalar(
        select(User).where(User.id == user_id, User.is_staff.is_(False)).with_for_update()
    )
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    # Keep deletion reliable in the SQLite test environment as well as in
    # PostgreSQL, where the foreign keys also enforce these cascades.
    for model in (
        SupportMessage,
        SupportAttachment,
        ConfirmationCode,
        DemoTransfer,
        DepositRequest,
        Session,
        Transaction,
        Preference,
        Wallet,
    ):
        await db.execute(delete(model).where(model.user_id == client.id))
    await db.delete(client)
    await db.commit()
    return Response(status_code=204)


@app.post("/api/staff/clients/{user_id}/deposit-requests/{request_id}/decision")
async def staff_decide_deposit_request(
    user_id: int,
    request_id: int,
    payload: StaffDepositDecisionInput,
    staff: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> dict:
    client = await db.scalar(select(User).where(User.id == user_id, User.is_staff.is_(False)))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    request = await db.scalar(
        select(DepositRequest)
        .where(DepositRequest.id == request_id, DepositRequest.user_id == user_id)
        .with_for_update()
    )
    if not request:
        raise HTTPException(status_code=404, detail="Deposit request not found")
    if request.status != "pending":
        raise HTTPException(status_code=409, detail="Deposit request has already been reviewed")

    request.decided_by = staff.id
    request.decided_at = now()
    if payload.decision == "reject":
        request.status = "rejected"
        db.add(
            SupportMessage(
                user_id=client.id,
                sender="support",
                body=(
                    f"Your ${as_decimal(request.amount_usd).quantize(Decimal('0.01'))} "
                    f"{request.asset} deposit request was not approved. Contact support if "
                    "you need more information."
                ),
            )
        )
    else:
        wallet = await owned_wallet(db, client.id, request.asset, lock=True)
        amount_usd = as_decimal(request.amount_usd).quantize(Decimal("0.01"))
        quantity = (amount_usd / as_decimal(wallet.price_usd)).quantize(
            MONEY_EPSILON, rounding=ROUND_DOWN
        )
        wallet.balance = as_decimal(wallet.balance) + quantity
        transaction = Transaction(
            user_id=client.id,
            kind="buy",
            status="approved",
            asset=request.asset,
            amount=quantity,
            usd_value=amount_usd,
            title=f"Bought {request.asset}",
            details={
                "payment": "Support-approved deposit",
                "deposit_request_id": str(request.id),
                "staff_id": str(staff.id),
                "environment": "development",
            },
        )
        db.add(transaction)
        await db.flush()
        request.transaction_id = transaction.id
        request.status = "approved"
        db.add(
            SupportMessage(
                user_id=client.id,
                sender="support",
                body=(
                    f"Your ${amount_usd} {request.asset} deposit request was verified and "
                    "approved. The funds are now available in your wallet."
                ),
            )
        )
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
    active_count = await db.scalar(
        select(func.count()).select_from(ConfirmationCode).where(
            ConfirmationCode.user_id == client.id,
            ConfirmationCode.status == "ready",
        )
    )
    if (active_count or 0) + payload.count > 1000:
        raise HTTPException(status_code=422, detail="A profile can have at most 1000 ready codes")
    created = []
    for _index in range(payload.count):
        item = ConfirmationCode(user_id=client.id, code=make_otp(), status="ready")
        db.add(item)
        created.append(item)
    await db.commit()
    return {
        "items": [
            {
                "id": item.id,
                "code": item.code,
                "status": item.status,
                "created_at": item.created_at,
            }
            for item in created
        ]
    }


@app.delete("/api/staff/clients/{user_id}/codes", status_code=204)
async def staff_clear_codes(
    user_id: int,
    _: User = Depends(current_staff),
    db: AsyncSession = Depends(get_db),
) -> Response:
    active_transfer = await db.scalar(
        select(DemoTransfer).where(
            DemoTransfer.user_id == user_id,
            DemoTransfer.status.in_(("verification", "processing")),
        )
    )
    if active_transfer:
        raise HTTPException(
            status_code=409, detail="Codes cannot be cleared during an active transfer"
        )
    client = await db.scalar(select(User).where(User.id == user_id, User.is_staff.is_(False)))
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")
    items = list(
        (
            await db.scalars(
                select(ConfirmationCode).where(ConfirmationCode.user_id == user_id)
            )
        ).all()
    )
    for item in items:
        await db.delete(item)
    client.verification_used = 0
    client.verification_state = "locked" if client.verification_target else "completed"
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

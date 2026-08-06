from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    JSON,
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def utcnow() -> datetime:
    return datetime.utcnow()


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(80))
    username: Mapped[str] = mapped_column(String(40), unique=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    profile_label: Mapped[str | None] = mapped_column(String(120), nullable=True, index=True)
    account_status: Mapped[str] = mapped_column(
        String(20), default="active", server_default="active", index=True
    )
    verification_target: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    verification_used: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    verification_state: Mapped[str] = mapped_column(
        String(20), default="completed", server_default="completed", index=True
    )
    processing_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    wallets: Mapped[list["Wallet"]] = relationship(back_populates="user", cascade="all, delete")
    preferences: Mapped["Preference"] = relationship(
        back_populates="user", cascade="all, delete", uselist=False
    )


class ConfirmationCode(Base):
    __tablename__ = "confirmation_codes"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    code: Mapped[str] = mapped_column(String(6), index=True)
    status: Mapped[str] = mapped_column(String(20), default="ready", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Wallet(Base):
    __tablename__ = "wallets"
    __table_args__ = (UniqueConstraint("user_id", "symbol"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(40))
    symbol: Mapped[str] = mapped_column(String(10), index=True)
    network: Mapped[str] = mapped_column(String(50))
    address: Mapped[str] = mapped_column(String(160))
    balance: Mapped[Decimal] = mapped_column(Numeric(28, 8), default=Decimal("0"))
    price_usd: Mapped[Decimal] = mapped_column(Numeric(20, 8))
    change_24h: Mapped[Decimal] = mapped_column(Numeric(8, 2), default=Decimal("0"))

    user: Mapped[User] = relationship(back_populates="wallets")


class Transaction(Base):
    __tablename__ = "transactions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(20), index=True)
    status: Mapped[str] = mapped_column(String(20), default="approved", index=True)
    asset: Mapped[str] = mapped_column(String(10))
    amount: Mapped[Decimal] = mapped_column(Numeric(28, 8))
    usd_value: Mapped[Decimal] = mapped_column(Numeric(20, 2))
    title: Mapped[str] = mapped_column(String(120))
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Withdrawal(Base):
    __tablename__ = "withdrawals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    asset: Mapped[str] = mapped_column(String(10))
    amount: Mapped[Decimal] = mapped_column(Numeric(28, 8))
    cardholder: Mapped[str] = mapped_column(String(100))
    card_last4: Mapped[str] = mapped_column(String(4))
    status: Mapped[str] = mapped_column(String(20), default="draft")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class VerificationChallenge(Base):
    __tablename__ = "verification_challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    withdrawal_id: Mapped[int] = mapped_column(
        ForeignKey("withdrawals.id", ondelete="CASCADE"), index=True
    )
    code_hash: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class DemoTransfer(Base):
    __tablename__ = "demo_transfers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    transaction_id: Mapped[int | None] = mapped_column(
        ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
    method: Mapped[str] = mapped_column(String(20))
    asset: Mapped[str] = mapped_column(String(10))
    amount: Mapped[Decimal] = mapped_column(Numeric(28, 8))
    destination: Mapped[str] = mapped_column(String(180))
    status: Mapped[str] = mapped_column(String(20), default="verification", index=True)
    required_codes: Mapped[int] = mapped_column(Integer, default=0)
    used_codes: Mapped[int] = mapped_column(Integer, default=0)
    processing_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class SupportAttachment(Base):
    __tablename__ = "support_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(80))
    url: Mapped[str] = mapped_column(String(500))
    size: Mapped[int] = mapped_column(BigInteger)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SupportMessage(Base):
    __tablename__ = "support_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    sender: Mapped[str] = mapped_column(String(20))
    body: Mapped[str] = mapped_column(Text)
    attachment_id: Mapped[int | None] = mapped_column(
        ForeignKey("support_attachments.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    attachment: Mapped[SupportAttachment | None] = relationship()


class Preference(Base):
    __tablename__ = "preferences"

    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    theme: Mapped[str] = mapped_column(String(10), default="dark")
    sounds: Mapped[bool] = mapped_column(Boolean, default=True)
    last_support_read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped[User] = relationship(back_populates="preferences")

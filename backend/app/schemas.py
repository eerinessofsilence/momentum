from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


class RegisterInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_]+$")
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginInput(BaseModel):
    username: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class PreferenceInput(BaseModel):
    theme: Optional[Literal["dark", "light"]] = None
    sounds: Optional[bool] = None
    language: Optional[Literal["en", "fr", "es", "de"]] = None


class AccountSettingsInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_]+$")
    email: EmailStr
    daily_send_limit: Decimal = Field(ge=0, max_digits=20, decimal_places=2)
    monthly_send_limit: Decimal = Field(ge=0, max_digits=20, decimal_places=2)

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        normalized = value.strip()
        if len(normalized) < 2:
            raise ValueError("Name must contain at least 2 non-whitespace characters")
        return normalized

    @model_validator(mode="after")
    def validate_limits(self) -> "AccountSettingsInput":
        if self.monthly_send_limit < self.daily_send_limit:
            raise ValueError("Monthly limit must be greater than or equal to daily limit")
        return self


class SupportMessageInput(BaseModel):
    body: str = Field(min_length=1, max_length=3000)
    attachment_id: Optional[int] = None


class SendInput(BaseModel):
    asset: str
    amount: Decimal = Field(gt=0)
    address: str = Field(min_length=8, max_length=180)


class DepositRequestInput(BaseModel):
    asset: str
    amount_usd: Decimal = Field(gt=0, le=50000)


class SwapInput(BaseModel):
    from_asset: str
    to_asset: str
    amount: Decimal = Field(gt=0)

    @field_validator("to_asset")
    @classmethod
    def assets_must_differ(cls, value: str, info):
        if info.data.get("from_asset") == value:
            raise ValueError("Choose two different assets")
        return value


class StaffBalanceInput(BaseModel):
    asset: str
    action: Literal["credit", "set"] = "credit"
    amount: Decimal = Field(ge=0, max_digits=28, decimal_places=8)

    @model_validator(mode="after")
    def validate_credit_amount(self) -> "StaffBalanceInput":
        if self.action == "credit" and self.amount <= 0:
            raise ValueError("Credit amount must be greater than zero")
        return self


class StaffTransactionUpdateInput(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=28, decimal_places=8)
    effective_at: datetime


class StaffDepositDecisionInput(BaseModel):
    decision: Literal["approve", "reject"]


class StaffCodeInput(BaseModel):
    count: int = Field(ge=1, le=1000)


class StaffClientCreateInput(BaseModel):
    profile_label: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=2, max_length=80)
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_]+$")
    email: EmailStr
    required_codes: int = Field(default=0, ge=0, le=1000)


class StaffVerificationInput(BaseModel):
    required_codes: int = Field(ge=0, le=1000)


class StaffProfileStatusInput(BaseModel):
    status: Literal["active", "suspended", "archived"]


class StaffClientSettingsInput(BaseModel):
    profile_label: str = Field(min_length=1, max_length=120)
    name: str = Field(min_length=2, max_length=80)
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_]+$")
    email: EmailStr
    daily_send_limit: Decimal = Field(ge=0, max_digits=20, decimal_places=2)
    monthly_send_limit: Decimal = Field(ge=0, max_digits=20, decimal_places=2)
    manual_review_threshold: Decimal = Field(ge=0, max_digits=20, decimal_places=2)
    theme: Optional[Literal["dark", "light"]] = None
    sounds: Optional[bool] = None


class DemoTransferInput(BaseModel):
    method: Literal["card", "crypto"]
    asset: str
    amount: Decimal = Field(gt=0)
    destination: str = Field(min_length=4, max_length=180)


class DemoCodeInput(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")

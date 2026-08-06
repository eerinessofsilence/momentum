from __future__ import annotations

from decimal import Decimal
from typing import Literal, Optional

from pydantic import BaseModel, EmailStr, Field, field_validator


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


class SupportMessageInput(BaseModel):
    body: str = Field(min_length=1, max_length=3000)
    attachment_id: Optional[int] = None


class SendInput(BaseModel):
    asset: str
    amount: Decimal = Field(gt=0)
    address: str = Field(min_length=8, max_length=180)


class BuyInput(BaseModel):
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
    action: Literal["credit"] = "credit"
    amount: Decimal = Field(gt=0)


class StaffCodeInput(BaseModel):
    count: int = Field(ge=1, le=1000)


class StaffClientCreateInput(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    username: str = Field(min_length=3, max_length=40, pattern=r"^[A-Za-z0-9_]+$")
    email: EmailStr
    required_codes: int = Field(default=0, ge=0, le=1000)


class StaffVerificationInput(BaseModel):
    required_codes: int = Field(ge=0, le=1000)


class StaffProfileStatusInput(BaseModel):
    status: Literal["active", "suspended", "archived"]


class DemoTransferInput(BaseModel):
    method: Literal["card", "crypto"]
    asset: str
    amount: Decimal = Field(gt=0)
    destination: str = Field(min_length=4, max_length=180)


class DemoCodeInput(BaseModel):
    code: str = Field(pattern=r"^\d{6}$")

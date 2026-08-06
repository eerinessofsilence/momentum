from __future__ import annotations

import asyncio
import logging
from decimal import Decimal

import httpx
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from .config import settings
from .models import Wallet

logger = logging.getLogger(__name__)

COINGECKO_IDS = {
    "BTC": "bitcoin",
    "ETH": "ethereum",
    "USDT": "tether",
    "TON": "the-open-network",
}

PRICE_API_URL = "https://api.coingecko.com/api/v3/simple/price"
REQUEST_TIMEOUT_SECONDS = 8.0


async def fetch_live_prices() -> dict[str, tuple[Decimal, Decimal]]:
    """Fetch {symbol: (price_usd, change_24h_pct)} from CoinGecko. Raises on failure."""
    async with httpx.AsyncClient(timeout=REQUEST_TIMEOUT_SECONDS) as client:
        response = await client.get(
            PRICE_API_URL,
            params={
                "ids": ",".join(COINGECKO_IDS.values()),
                "vs_currencies": "usd",
                "include_24hr_change": "true",
            },
        )
        response.raise_for_status()
        payload = response.json()

    prices: dict[str, tuple[Decimal, Decimal]] = {}
    for symbol, coin_id in COINGECKO_IDS.items():
        entry = payload.get(coin_id)
        if not entry or "usd" not in entry:
            continue
        price = Decimal(str(entry["usd"]))
        change = Decimal(str(entry.get("usd_24h_change", 0))).quantize(Decimal("0.01"))
        prices[symbol] = (price, change)
    return prices


async def refresh_wallet_prices(session: AsyncSession) -> None:
    prices = await fetch_live_prices()
    for symbol, (price, change) in prices.items():
        await session.execute(
            update(Wallet)
            .where(Wallet.symbol == symbol)
            .values(price_usd=price, change_24h=change)
        )
    await session.commit()


async def price_refresh_loop(session_factory) -> None:
    while True:
        try:
            async with session_factory() as session:
                await refresh_wallet_prices(session)
        except Exception:  # noqa: BLE001 - a bad refresh must never crash the app
            logger.warning("Price refresh failed; keeping previous values", exc_info=True)
        await asyncio.sleep(settings.price_refresh_interval_seconds)

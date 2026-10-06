"""Background loop that deletes disappearing messages once they expire."""

import asyncio
import logging

from app.db import SessionLocal
from app.services.cloudinary_service import delete_assets
from app.services.messages import delete_expired
from app.ws import broadcast

logger = logging.getLogger(__name__)

INTERVAL_SECONDS = 5


async def run_expiry_once() -> int:
    """One sweep. Returns how many messages were deleted."""
    with SessionLocal() as db:
        batches, assets = delete_expired(db)
        for batch in batches:
            await broadcast.messages_expired(db, batch.conversation_id, batch.message_ids)
    if assets:
        # The Cloudinary SDK is blocking; keep it off the event loop.
        await asyncio.to_thread(delete_assets, assets)
    return sum(len(b.message_ids) for b in batches)


async def expiry_loop() -> None:
    while True:
        try:
            await run_expiry_once()
        except Exception:  # never let one bad sweep kill the loop
            logger.exception("Disappearing-message sweep failed")
        await asyncio.sleep(INTERVAL_SECONDS)

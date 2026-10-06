"""App factory: CORS, routers, error mapping, and startup work (migrations, seed, expiry loop)."""

import asyncio
import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager, suppress
from pathlib import Path

from fastapi import APIRouter, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.routers import attachments, auth, contacts, conversations, messages, users
from app.services.errors import ServiceError
from app.tasks.expiry import expiry_loop
from app.ws.handlers import websocket_endpoint

logger = logging.getLogger(__name__)
BACKEND_DIR = Path(__file__).resolve().parent.parent


def run_migrations() -> None:
    """Equivalent of `alembic upgrade head`, run on every startup (it is a no-op when up to date)."""
    from alembic import command
    from alembic.config import Config

    cfg = Config(str(BACKEND_DIR / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    cfg.set_main_option("sqlalchemy.url", get_settings().database_url)
    command.upgrade(cfg, "head")


def seed_if_empty() -> None:
    from seed import seed_if_empty as _seed

    _seed()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    settings = get_settings()
    run_migrations()
    if settings.auto_seed:
        seed_if_empty()
    task = asyncio.create_task(expiry_loop())
    yield
    task.cancel()
    with suppress(asyncio.CancelledError):
        await task


def create_app(*, with_lifespan: bool = True) -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Signal Clone API", lifespan=lifespan if with_lifespan else None)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origin_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(ServiceError)
    async def service_error_handler(_request: Request, exc: ServiceError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content={"detail": exc.message})

    api = APIRouter(prefix="/api")

    @api.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    for module in (auth, users, contacts, conversations, messages, attachments):
        api.include_router(module.router)
    app.include_router(api)
    app.add_api_websocket_route("/ws", websocket_endpoint)
    return app


app = create_app()

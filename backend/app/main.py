"""
FastAPI application entry-point for the Harmonized Burning Activity Calendar.

Startup sequence
----------------
1. Run validator.validate_and_update_extent() – validates both Parquet files
   and updates config.DATA_EXTENT with real data extents.
2. If validation fails the app still starts but all data endpoints return 503.

CORS is open for all origins (development mode).  Restrict origins in
production via the ALLOWED_ORIGINS environment variable.
"""

from __future__ import annotations

import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from . import config
from .validator import validate_and_update_extent
from .routes import meta, calendar, anomaly, summary, timeseries, hotspots

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(name)s  %(message)s",
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Global flag: set to False if startup validation fails
# ---------------------------------------------------------------------------
_DATA_READY: bool = False
_STARTUP_ERROR: str = ""


# ---------------------------------------------------------------------------
# Lifespan context manager
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _DATA_READY, _STARTUP_ERROR

    logger.info("═" * 60)
    logger.info("🔥  Harmonized Burning Activity Calendar – startup")
    logger.info("   Data directory : %s", config.DATA_DIR)
    logger.info("   Hotspots file  : %s", config.HOTSPOTS_FILE)
    logger.info("   Monthly file   : %s", config.MONTHLY_FILE)

    try:
        validate_and_update_extent()
        _DATA_READY = True
        logger.info("✅  Data validation passed.  DATA_EXTENT=%s", config.DATA_EXTENT)
    except FileNotFoundError as exc:
        _STARTUP_ERROR = str(exc)
        logger.error("❌  Data file missing:\n%s", exc)
        logger.error(
            "   Run  python scripts/generate_mock_data.py  to create mock data."
        )
    except ValueError as exc:
        _STARTUP_ERROR = str(exc)
        logger.error("❌  Data validation failed:\n%s", exc)
    except Exception as exc:
        _STARTUP_ERROR = f"Unexpected startup error: {exc}"
        logger.exception("❌  Unexpected error during startup validation.")

    logger.info("═" * 60)

    # Inject readiness flag into app state so routes can check it
    app.state.data_ready     = _DATA_READY
    app.state.startup_error  = _STARTUP_ERROR

    yield  # ← application runs here

    logger.info("🛑  Harmonized Burning Activity Calendar – shutdown")


# ---------------------------------------------------------------------------
# Application factory
# ---------------------------------------------------------------------------

def create_app() -> FastAPI:
    app = FastAPI(
        title="Harmonized Burning Activity Calendar API",
        description=(
            "Backend API for exploring harmonized MODIS+VIIRS fire hotspot data. "
            "All endpoints accept either a bounding-box or a GeoJSON polygon region."
        ),
        version="1.0.0",
        lifespan=lifespan,
    )

    # ── CORS ─────────────────────────────────────────────────────────────────
    allowed_origins_env = os.environ.get("ALLOWED_ORIGINS", "*")
    allowed_origins = (
        ["*"]
        if allowed_origins_env == "*"
        else [o.strip() for o in allowed_origins_env.split(",")]
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # ── Exception Handler ────────────────────────────────────────────────────
    @app.exception_handler(Exception)
    async def global_exception_handler(request, exc):
        logger.exception("Global unhandled exception: %s", exc)
        return JSONResponse(
            status_code=500,
            content={"detail": str(exc)},
        )

    # ── Routers ───────────────────────────────────────────────────────────────
    API_PREFIX = "/api"
    app.include_router(meta.router,       prefix=API_PREFIX)
    app.include_router(calendar.router,   prefix=API_PREFIX)
    app.include_router(anomaly.router,    prefix=API_PREFIX)
    app.include_router(summary.router,    prefix=API_PREFIX)
    app.include_router(timeseries.router, prefix=API_PREFIX)
    app.include_router(hotspots.router,   prefix=API_PREFIX)

    # ── Root endpoints ────────────────────────────────────────────────────────

    @app.get("/", include_in_schema=False)
    async def root() -> RedirectResponse:
        """Redirect browser root to the interactive API docs."""
        return RedirectResponse(url="/docs")

    @app.get("/health", tags=["health"])
    @app.get("/api/health", tags=["health"])
    async def health() -> JSONResponse:
        """
        Health-check endpoint.
        Returns 200 when data is ready, 503 when startup validation failed.
        """
        if _DATA_READY:
            return JSONResponse(
                content={"status": "ok", "data_extent": config.DATA_EXTENT},
                status_code=200,
            )
        return JSONResponse(
            content={
                "status": "degraded",
                "detail": _STARTUP_ERROR or "Data not yet validated.",
            },
            status_code=503,
        )

    return app


# ---------------------------------------------------------------------------
# Module-level app instance (used by uvicorn)
# ---------------------------------------------------------------------------

app = create_app()

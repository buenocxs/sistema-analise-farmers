import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import get_settings
from app.exceptions import AppException, app_exception_handler, generic_exception_handler
from app.routers import auth, sellers, conversations, analytics, alerts, exclusion_list, settings, system, agent, webhook

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
logger = logging.getLogger(__name__)

_settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("MAVE Monitoring backend starting...")
    yield
    logger.info("MAVE Monitoring backend shutting down...")


app = FastAPI(title="MAVE Monitoring", version="2.0.0", lifespan=lifespan)

# CORS
_origins = [o.strip() for o in _settings.CORS_ORIGINS.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(AppException, app_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Health check (no /api prefix)
@app.get("/health")
async def health():
    return {"status": "ok"}

# Mount routers under /api
api_router_prefix = "/api"
app.include_router(auth.router, prefix=api_router_prefix)
app.include_router(sellers.router, prefix=api_router_prefix)
app.include_router(conversations.router, prefix=api_router_prefix)
app.include_router(analytics.router, prefix=api_router_prefix)
app.include_router(alerts.router, prefix=api_router_prefix)
app.include_router(exclusion_list.router, prefix=api_router_prefix)
app.include_router(settings.router, prefix=api_router_prefix)
app.include_router(system.router, prefix=api_router_prefix)
app.include_router(agent.router, prefix=api_router_prefix)
app.include_router(webhook.router, prefix=api_router_prefix)

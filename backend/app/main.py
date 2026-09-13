"""FastAPI application main entrypoint with lifespan model management."""
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import RedirectResponse

from .core.config import settings
from .models.unet import ModelManager
from .api.api_v1 import api_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("sih.main")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Application lifespan manager to initialize model on startup."""
    logger.info("Initializing SIH26143 Oil Spill Investigation Backend...")
    logger.info(f"Project root: {settings.PROJECT_ROOT}")

    # Load U-Net segmentation model
    try:
        ModelManager.initialize(settings.MODEL_PATH)
        device = ModelManager.get_device()
        logger.info(f"U-Net model initialized successfully on device: {device}")
    except Exception as e:
        logger.error(f"Failed to load U-Net model on startup: {e}")

    # Verify environmental datasets
    if not settings.ERA5_WIND_FILE.exists():
        logger.warning(f"ERA5 Wind NetCDF not found at: {settings.ERA5_WIND_FILE}")
    else:
        logger.info(f"ERA5 Wind file verified: {settings.ERA5_WIND_FILE.name}")

    if not settings.MED_CURRENT_FILE.exists():
        logger.warning(f"Copernicus Current NetCDF not found at: {settings.MED_CURRENT_FILE}")
    else:
        logger.info(f"Copernicus Current file verified: {settings.MED_CURRENT_FILE.name}")

    yield

    logger.info("Shutting down SIH26143 backend...")


app = FastAPI(
    title=settings.PROJECT_NAME,
    description=settings.DESCRIPTION,
    version=settings.VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan
)

# CORS middleware configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include API v1 router
app.include_router(api_router, prefix=settings.API_V1_STR)


@app.get("/", include_in_schema=False)
def root_redirect():
    """Redirect root path to interactive Swagger documentation."""
    return RedirectResponse(url="/docs")

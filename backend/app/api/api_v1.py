"""API v1 router assembly."""
from fastapi import APIRouter

from .endpoints.health import router as health_router
from .endpoints.detection import router as detection_router
from .endpoints.hindcast import router as hindcast_router
from .endpoints.ais import router as ais_router
from .endpoints.investigation import router as investigation_router
from .endpoints.data import router as data_router

api_router = APIRouter()

api_router.include_router(health_router, tags=["System Diagnostics"])
api_router.include_router(investigation_router, tags=["Unified Investigation"])
api_router.include_router(detection_router, tags=["SAR Segmentation"])
api_router.include_router(hindcast_router, tags=["Environmental Hindcasting"])
api_router.include_router(ais_router, tags=["AIS Vessel Attribution"])
api_router.include_router(data_router, tags=["Data & Reference Results"])

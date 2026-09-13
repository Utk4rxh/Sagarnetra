"""Endpoints package exports."""
from .health import router as health_router
from .detection import router as detection_router
from .hindcast import router as hindcast_router
from .ais import router as ais_router
from .investigation import router as investigation_router
from .data import router as data_router

__all__ = [
    "health_router",
    "detection_router",
    "hindcast_router",
    "ais_router",
    "investigation_router",
    "data_router"
]

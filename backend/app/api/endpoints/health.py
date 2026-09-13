"""Health check and system diagnostics endpoint."""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Dict, Any

from ...core.config import settings
from ...models.unet import ModelManager

router = APIRouter()


class HealthResponse(BaseModel):
    status: str
    model_loaded: bool
    device: str
    project_root: str
    environmental_files: Dict[str, bool]
    model_checkpoint: Dict[str, Any]


@router.get("/health", response_model=HealthResponse)
def get_health() -> HealthResponse:
    """Return system readiness, active device, and file accessibility."""
    device_str = str(ModelManager.get_device()) if ModelManager.is_loaded() else "not_initialized"

    env_status = {
        "era5_wind": settings.ERA5_WIND_FILE.exists(),
        "copernicus_current": settings.MED_CURRENT_FILE.exists(),
        "oil_directory": settings.OIL_DIR.exists()
    }

    ckpt_status = {
        "exists": settings.MODEL_PATH.exists(),
        "path": str(settings.MODEL_PATH),
        "is_loaded": ModelManager.is_loaded()
    }

    overall_status = "healthy" if (ModelManager.is_loaded() and all(env_status.values())) else "degraded"

    return HealthResponse(
        status=overall_status,
        model_loaded=ModelManager.is_loaded(),
        device=device_str,
        project_root=str(settings.PROJECT_ROOT),
        environmental_files=env_status,
        model_checkpoint=ckpt_status
    )

"""Environmental Lagrangian hindcast endpoint."""
from fastapi import APIRouter, HTTPException, status

from ...core.config import settings
from ...schemas.hindcast import HindcastRequest, HindcastResult
from ...services.hindcast_service import dynamic_hindcast

router = APIRouter()


@router.post("/hindcast", response_model=HindcastResult)
def run_hindcast(request: HindcastRequest) -> HindcastResult:
    """Execute backward Lagrangian drift and particle ensemble dispersion from spill coordinates."""
    try:
        result = dynamic_hindcast(
            observation_latitude=request.latitude,
            observation_longitude=request.longitude,
            observation_time=request.observation_time,
            backtrack_hours=request.backtrack_hours or settings.BACKTRACK_HOURS,
            windage_factor=request.windage_factor or settings.WINDAGE_FACTOR,
            particle_count=request.num_particles or settings.PARTICLE_COUNT
        )
        return result
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Hindcasting failed: {str(e)}"
        )

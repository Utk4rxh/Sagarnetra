"""AIS vessel attribution and correlation endpoints."""
import shutil
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, status
import pandas as pd

from ...core.config import settings
from ...schemas.ais import AISAttributionRequest, AISAttributionResult
from ...services.ais_service import dynamic_ais_attribution, load_and_validate_ais

router = APIRouter()


@router.post("/ais/analyze", response_model=AISAttributionResult)
def analyze_ais(request: AISAttributionRequest) -> AISAttributionResult:
    """
    Primary data-driven AIS attribution endpoint.
    Accepts arbitrary origin coordinates, observation and spill timestamps,
    and returns ranked suspect vessels with trajectory coordinates, kinematic features,
    and factual evidence explanations.
    """
    try:
        result = dynamic_ais_attribution(
            ais_dataframe=None,  # Loads from dataset / dynamic generator
            origin_latitude=request.origin_latitude,
            origin_longitude=request.origin_longitude,
            observation_time=request.observation_time,
            estimated_spill_time=request.estimated_spill_time,
            max_candidate_distance_km=request.spatial_threshold_km or settings.AIS_MAX_CANDIDATE_DISTANCE_KM,
            time_window_hours=request.time_window_hours or settings.AIS_TIME_WINDOW_HOURS,
            ais_source_mode=request.ais_source or "auto"
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"AIS attribution analysis failed: {str(e)}"
        )


@router.post("/ais-attribution", response_model=AISAttributionResult)
def run_ais_attribution(request: AISAttributionRequest) -> AISAttributionResult:
    """Backward-compatible AIS attribution endpoint."""
    return analyze_ais(request)


@router.post("/ais/upload-and-analyze", response_model=AISAttributionResult)
async def upload_and_analyze_ais(
    file: UploadFile = File(..., description="Custom AIS CSV dataset file"),
    origin_latitude: float = Form(..., description="Probable spill origin latitude"),
    origin_longitude: float = Form(..., description="Probable spill origin longitude"),
    observation_time: str = Form(..., description="ISO 8601 observation timestamp"),
    estimated_spill_time: Optional[str] = Form(None, description="ISO 8601 estimated spill release timestamp"),
    spatial_threshold_km: float = Form(50.0, description="Spatial search radius in km")
) -> AISAttributionResult:
    """
    Upload a real or custom AIS CSV file and run attribution scoring against it,
    demonstrating seamless swapping from synthetic to real AIS data.
    """
    temp_path = settings.TEMP_DIR / f"upload_{file.filename}"
    try:
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        custom_df = pd.read_csv(temp_path)
        result = dynamic_ais_attribution(
            ais_dataframe=custom_df,
            origin_latitude=origin_latitude,
            origin_longitude=origin_longitude,
            observation_time=observation_time,
            estimated_spill_time=estimated_spill_time,
            max_candidate_distance_km=spatial_threshold_km
        )
        return result
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Failed to process custom AIS CSV: {str(e)}"
        )
    finally:
        if temp_path.exists():
            temp_path.unlink(missing_ok=True)

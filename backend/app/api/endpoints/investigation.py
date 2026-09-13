"""Unified end-to-end oil spill investigation endpoint."""
import os
import shutil
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status

from ...core.config import settings
from ...schemas.investigation import InvestigationResponse
from ...services.investigation_service import run_investigation

router = APIRouter()


@router.post("/investigate", response_model=InvestigationResponse)
async def investigate_spill(
    file: Optional[UploadFile] = File(None),
    image_name: Optional[str] = Form(None),
    observation_time: str = Form(..., description="ISO 8601 observation timestamp, e.g. 2019-10-19T15:56:47Z"),
    latitude: float = Form(..., description="Observation latitude in decimal degrees"),
    longitude: float = Form(..., description="Observation longitude in decimal degrees"),
    location_source: str = Form("user_provided", description="Provenance of observation coordinates (reference_case, user_supplied, image_center_suggestion)"),
    ais_file: Optional[UploadFile] = File(None, description="Optional custom AIS CSV file"),
    ais_source: Optional[str] = Form(None, description="AIS source mode ('auto', 'benchmark', 'synthetic', 'custom')"),
    time_window_hours: Optional[float] = Form(None, description="Temporal window in hours around release time (default 12.0)")
) -> InvestigationResponse:
    """Execute complete automated investigation pipeline: SAR -> Hindcast -> AIS Vessel Correlation."""
    temp_file_path: Optional[Path] = None
    temp_ais_path: Optional[Path] = None
    custom_ais_df = None

    try:
        # Resolve target SAR image
        if file is not None and file.filename:
            temp_file_path = settings.TEMP_DIR / file.filename
            with open(temp_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            target_image_path = temp_file_path
        elif image_name:
            target_image_path = settings.OIL_DIR / image_name
            if not target_image_path.exists():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"SAR image '{image_name}' not found in {settings.OIL_DIR}"
                )
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either a GeoTIFF 'file' upload or an existing 'image_name' must be provided."
            )

        # Handle optional custom AIS file upload
        if ais_file is not None and ais_file.filename:
            import pandas as pd
            temp_ais_path = settings.TEMP_DIR / f"ais_{ais_file.filename}"
            with open(temp_ais_path, "wb") as buffer:
                shutil.copyfileobj(ais_file.file, buffer)
            custom_ais_df = pd.read_csv(temp_ais_path)

        # Validate coordinates
        if not (-90.0 <= latitude <= 90.0):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Latitude must be between -90 and 90 degrees. Got {latitude}"
            )
        if not (-180.0 <= longitude <= 180.0):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Longitude must be between -180 and 180 degrees. Got {longitude}"
            )

        # Run master investigation
        response = run_investigation(
            sar_image_path=target_image_path,
            observation_time=observation_time,
            latitude=latitude,
            longitude=longitude,
            location_source=location_source,
            custom_ais_dataframe=custom_ais_df,
            ais_source=ais_source,
            time_window_hours=time_window_hours
        )

        return response

    except HTTPException:
        raise
    except FileNotFoundError as e:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(e)
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Investigation pipeline error: {str(e)}"
        )
    finally:
        if temp_file_path and temp_file_path.exists():
            try:
                os.remove(temp_file_path)
            except Exception:
                pass
        if temp_ais_path and temp_ais_path.exists():
            try:
                os.remove(temp_ais_path)
            except Exception:
                pass

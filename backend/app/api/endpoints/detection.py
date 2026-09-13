"""SAR oil spill segmentation and detection endpoints."""
import os
import shutil
from pathlib import Path
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, status

from ...core.config import settings
from ...schemas.detection import SpillDetectionResult
from ...services.sar_service import run_sar_segmentation
from ...services.geometry_service import extract_spill_geometry

router = APIRouter()


@router.post("/detect", response_model=SpillDetectionResult)
async def detect_spill(
    file: Optional[UploadFile] = File(None),
    image_name: Optional[str] = Form(None),
    threshold: Optional[float] = Form(settings.SEGMENTATION_THRESHOLD),
    min_area: Optional[int] = Form(settings.MINIMUM_COMPONENT_AREA)
) -> SpillDetectionResult:
    """Run SAR segmentation and extract oil spill footprint and centroid."""
    temp_file_path: Optional[Path] = None

    try:
        if file is not None and file.filename:
            temp_file_path = settings.TEMP_DIR / file.filename
            with open(temp_file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            target_image_path = temp_file_path
            resolved_name = file.filename
        elif image_name:
            target_image_path = settings.OIL_DIR / image_name
            if not target_image_path.exists():
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"SAR image '{image_name}' not found in {settings.OIL_DIR}"
                )
            resolved_name = image_name
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Either a GeoTIFF 'file' upload or an existing 'image_name' must be provided."
            )

        prob_map, mask, transform, crs, meta = run_sar_segmentation(
            image_path=target_image_path,
            threshold=threshold
        )

        result = extract_spill_geometry(
            prediction_mask=mask,
            transform=transform,
            image_name=resolved_name,
            min_area=min_area,
            threshold=threshold
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Segmentation failed: {str(e)}"
        )
    finally:
        if temp_file_path and temp_file_path.exists():
            try:
                os.remove(temp_file_path)
            except Exception:
                pass

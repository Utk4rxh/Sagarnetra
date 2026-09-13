"""Data browsing and reference results retrieval endpoints."""
import json
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from ...core.config import settings

router = APIRouter()


class SARImageInfo(BaseModel):
    filename: str
    size_bytes: int
    size_mb: float
    center_latitude: Optional[float] = None
    center_longitude: Optional[float] = None


class ResultsList(BaseModel):
    spill_detection_geojson: bool
    phase3_hindcast_result: bool
    phase4_ais_attribution_result: bool
    phase5_unified_investigation_result: bool


_IMAGE_CENTER_CACHE: Dict[str, tuple[Optional[float], Optional[float]]] = {}


def _get_geotiff_center(file_path: Path) -> tuple[Optional[float], Optional[float]]:
    if file_path.name in _IMAGE_CENTER_CACHE:
        return _IMAGE_CENTER_CACHE[file_path.name]
    try:
        import rasterio
        with rasterio.open(file_path) as src:
            b = src.bounds
            c_lat = round(float((b.top + b.bottom) / 2.0), 6)
            c_lon = round(float((b.left + b.right) / 2.0), 6)
            _IMAGE_CENTER_CACHE[file_path.name] = (c_lat, c_lon)
            return c_lat, c_lon
    except Exception:
        _IMAGE_CENTER_CACHE[file_path.name] = (None, None)
        return None, None


@router.get("/sar-images", response_model=List[SARImageInfo])
def list_sar_images(limit: int = 50, offset: int = 0) -> List[SARImageInfo]:
    """List available Sentinel-1 SAR GeoTIFF images in the dataset repository with center coordinates."""
    if not settings.OIL_DIR.exists():
        return []

    tif_files = sorted(settings.OIL_DIR.glob("*.tif"))
    paginated = tif_files[offset: offset + limit]

    results = []
    for f in paginated:
        c_lat, c_lon = _get_geotiff_center(f)
        results.append(
            SARImageInfo(
                filename=f.name,
                size_bytes=f.stat().st_size,
                size_mb=round(f.stat().st_size / (1024 * 1024), 2),
                center_latitude=c_lat,
                center_longitude=c_lon
            )
        )
    return results



@router.get("/results")
def get_reference_results() -> Dict[str, Any]:
    """Retrieve precomputed reference/demonstration investigation results."""
    results: Dict[str, Any] = {}

    if settings.PHASE5_RESULT_PATH.exists():
        with open(settings.PHASE5_RESULT_PATH, "r") as f:
            results["phase5_unified_investigation"] = json.load(f)

    if settings.PHASE4_RESULT_PATH.exists():
        with open(settings.PHASE4_RESULT_PATH, "r") as f:
            results["phase4_ais_attribution"] = json.load(f)

    if settings.PHASE3_RESULT_PATH.exists():
        with open(settings.PHASE3_RESULT_PATH, "r") as f:
            results["phase3_hindcast"] = json.load(f)

    if settings.SPILL_GEOJSON_PATH.exists():
        with open(settings.SPILL_GEOJSON_PATH, "r") as f:
            results["spill_detection_geojson"] = json.load(f)

    return results

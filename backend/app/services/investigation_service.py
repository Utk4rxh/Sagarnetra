"""Master unified investigation pipeline orchestrator (Phase 5)."""
import logging
from pathlib import Path
from typing import Optional
import pandas as pd

from ..core.config import settings
from ..schemas.investigation import (
    InvestigationObservation,
    InvestigationMetadata,
    InvestigationResponse
)
from .sar_service import run_sar_segmentation
from .geometry_service import extract_spill_geometry
from .hindcast_service import dynamic_hindcast
from .ais_service import generate_synthetic_ais, dynamic_ais_attribution

logger = logging.getLogger("sih.investigation")


def run_investigation(
    sar_image_path: Path,
    observation_time: str,
    latitude: float,
    longitude: float,
    location_source: str = "user_provided",
    custom_ais_dataframe: Optional[pd.DataFrame] = None,
    ais_source: Optional[str] = None,
    time_window_hours: Optional[float] = None
) -> InvestigationResponse:
    """Execute complete end-to-end investigation pipeline: SAR -> Hindcast -> AIS Attribution."""
    logger.info(f"Starting unified investigation on SAR image: {sar_image_path.name}")

    # ========================================================
    # PHASE 2: SAR SEGMENTATION & GEOMETRY EXTRACTION
    # ========================================================
    prob_map, mask, transform, crs, meta = run_sar_segmentation(
        image_path=sar_image_path,
        patch_size=settings.PATCH_SIZE,
        stride=settings.STRIDE,
        threshold=settings.SEGMENTATION_THRESHOLD
    )

    spill_detection = extract_spill_geometry(
        prediction_mask=mask,
        transform=transform,
        image_name=sar_image_path.name,
        min_area=settings.MINIMUM_COMPONENT_AREA,
        threshold=settings.SEGMENTATION_THRESHOLD
    )

    # Hindcast starting location ALWAYS uses the request-supplied observation coordinates.
    # The SAR-derived spill centroid remains available in spill_detection as the detected geometry.
    hindcast_lat = latitude
    hindcast_lon = longitude

    # ========================================================
    # PHASE 3: ENVIRONMENTAL HINDCASTING
    # ========================================================
    hindcast_result = dynamic_hindcast(
        observation_latitude=hindcast_lat,
        observation_longitude=hindcast_lon,
        observation_time=observation_time,
        backtrack_hours=settings.BACKTRACK_HOURS,
        time_step_hours=settings.TIME_STEP_HOURS,
        windage_factor=settings.WINDAGE_FACTOR,
        particle_count=settings.PARTICLE_COUNT,
        initial_uncertainty_km=settings.INITIAL_UNCERTAINTY_KM,
        drift_noise_fraction=settings.DRIFT_NOISE_FRACTION
    )

    origin_lat = hindcast_result.ensemble_origin.latitude
    origin_lon = hindcast_result.ensemble_origin.longitude

    # ========================================================
    # PHASE 4: AIS VESSEL ATTRIBUTION
    # ========================================================
    obs_dt = pd.to_datetime(observation_time, utc=True)
    backtrack_hours = hindcast_result.hindcast.backtrack_hours or settings.BACKTRACK_HOURS
    estimated_spill_dt = (obs_dt - pd.Timedelta(hours=backtrack_hours)).isoformat()
    effective_time_window = time_window_hours or settings.AIS_TIME_WINDOW_HOURS

    # Determine AIS source mode
    if custom_ais_dataframe is not None:
        source_mode = "custom"
    elif ais_source:
        source_mode = ais_source
    elif location_source == "reference_case":
        source_mode = "benchmark"
    else:
        source_mode = "auto"

    ais_attribution = dynamic_ais_attribution(
        ais_dataframe=custom_ais_dataframe,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time=observation_time,
        estimated_spill_time=estimated_spill_dt,
        max_candidate_distance_km=settings.AIS_MAX_CANDIDATE_DISTANCE_KM,
        time_window_hours=effective_time_window,
        ais_source_mode=source_mode
    )

    top_candidate = ais_attribution.ranking[0] if ais_attribution.ranking else None

    # ========================================================
    # ASSEMBLE UNIFIED RESPONSE
    # ========================================================
    return InvestigationResponse(
        investigation=InvestigationMetadata(
            sar_image=sar_image_path.name,
            observation=InvestigationObservation(
                timestamp=observation_time,
                latitude=float(latitude),
                longitude=float(longitude),
                location_source=location_source
            ),
            sar_geometry_source="geotiff_segmentation",
            environmental_data_source="ERA5 + Copernicus Marine",
            ais_data_source=ais_attribution.ais_data_source or "synthetic_simulation",
            attribution_type="correlation_ranking"
        ),
        spill_detection=spill_detection,
        hindcast=hindcast_result,
        ais_attribution=ais_attribution,
        top_candidate=top_candidate
    )

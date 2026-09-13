"""Unified investigation schemas."""
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field
from .detection import Coordinates, SpillDetectionResult
from .hindcast import HindcastResult
from .ais import AISAttributionResult, AISCandidate


class InvestigationObservation(BaseModel):
    timestamp: str = Field(..., description="ISO 8601 observation timestamp")
    latitude: float = Field(..., description="Observation latitude")
    longitude: float = Field(..., description="Observation longitude")
    location_source: str = Field("user_provided", description="Source of initial location coordinates")


class InvestigationMetadata(BaseModel):
    sar_image: str = Field(..., description="SAR image filename or identifier")
    observation: InvestigationObservation
    sar_geometry_source: str = Field("geotiff_segmentation", description="Source of SAR spill geometry")
    environmental_data_source: str = Field("ERA5 + Copernicus Marine", description="Source of environmental hindcast data")
    ais_data_source: str = Field("synthetic_simulation", description="Source of AIS vessel data")
    attribution_type: str = Field("correlation_ranking", description="Attribution scoring methodology")


class InvestigationResponse(BaseModel):
    investigation: InvestigationMetadata
    spill_detection: SpillDetectionResult
    hindcast: Optional[HindcastResult] = None
    ais_attribution: Optional[AISAttributionResult] = None
    top_candidate: Optional[AISCandidate] = None


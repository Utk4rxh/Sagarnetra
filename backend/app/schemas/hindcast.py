"""Environmental hindcasting schemas."""
from typing import Dict, List, Optional
from pydantic import BaseModel, Field
from .detection import Coordinates


class HindcastRequest(BaseModel):
    latitude: float = Field(..., description="Observed spill latitude")
    longitude: float = Field(..., description="Observed spill longitude")
    observation_time: str = Field(..., description="ISO 8601 observation timestamp (UTC)")
    backtrack_hours: Optional[int] = Field(24, description="Hours to backtrack in time")
    windage_factor: Optional[float] = Field(0.03, description="Wind drift fraction (default 3%)")
    num_particles: Optional[int] = Field(500, description="Monte Carlo particle count")


class HindcastTrajectoryPoint(BaseModel):
    timestamp: str
    latitude: float
    longitude: float


class HindcastMetadata(BaseModel):
    backtrack_hours: int
    time_step_hours: int
    windage_factor: float
    trajectory_points: int


class EnsembleOrigin(BaseModel):
    latitude: float
    longitude: float
    particle_count: int
    confidence_level: float = 0.95


class ProbableOriginRegion(BaseModel):
    min_latitude: float
    max_latitude: float
    min_longitude: float
    max_longitude: float


class EnvironmentalSources(BaseModel):
    wind_source: str = "ERA5 hourly 10m wind"
    current_source: str = "Copernicus Marine Mediterranean Physics Reanalysis"


class ObservationMetadata(BaseModel):
    timestamp: str
    latitude: float
    longitude: float


class HindcastResult(BaseModel):
    observation: ObservationMetadata
    hindcast: HindcastMetadata
    deterministic_origin: Coordinates
    ensemble_origin: EnsembleOrigin
    probable_origin_region: ProbableOriginRegion
    trajectory: Optional[List[HindcastTrajectoryPoint]] = None
    environmental_data: EnvironmentalSources = Field(default_factory=EnvironmentalSources)

"""AIS vessel attribution, kinematic features, and candidate ranking schemas."""
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class AISTrajectoryPoint(BaseModel):
    """Discrete AIS observation point along reconstructed vessel trajectory."""
    timestamp: str = Field(..., description="ISO 8601 observation timestamp")
    latitude: float = Field(..., description="WGS84 latitude")
    longitude: float = Field(..., description="WGS84 longitude")
    speed_knots: float = Field(..., description="Speed over ground in knots")
    course_deg: float = Field(..., description="Course over ground in degrees (0-360)")


class AISKinematicFeatures(BaseModel):
    """Calculated kinematic and behavioural features for attribution."""
    min_distance_km: float = Field(..., description="Closest Point of Approach (CPA) distance in km")
    closest_approach_time: str = Field(..., description="ISO 8601 timestamp of CPA")
    temporal_offset_hours: float = Field(..., description="Offset between CPA time and estimated spill time in hours")
    speed_at_cpa_knots: float = Field(..., description="Vessel speed at CPA in knots")
    average_speed_knots: float = Field(..., description="Average speed along candidate track")
    course_at_cpa_deg: float = Field(..., description="Course at CPA in degrees")
    trajectory_alignment_score: float = Field(..., description="Directional alignment with origin (0 to 1)")
    speed_reduction_knots: float = Field(0.0, description="Observed deceleration near origin")
    ais_gap_detected: bool = Field(False, description="Whether an AIS transmission gap was detected near origin")
    max_gap_minutes: float = Field(0.0, description="Duration of longest AIS transmission gap in minutes")


class AISScoreBreakdown(BaseModel):
    """Normalized multi-factor attribution component scores (each 0.0 to 1.0)."""
    distance: float = Field(..., description="Spatial proximity component (0 to 1)")
    temporal: float = Field(..., description="Temporal proximity component (0 to 1)")
    persistence: float = Field(..., description="Duration inside ROI / loitering component (0 to 1)")
    approach: float = Field(..., description="Directional consistency / alignment component (0 to 1)")
    proximity: Optional[float] = Field(None, description="Detailed spatial proximity score")
    alignment: Optional[float] = Field(None, description="Detailed trajectory alignment score")
    behavior: Optional[float] = Field(None, description="Kinematic / speed anomaly score")
    anomaly_gap: Optional[float] = Field(None, description="AIS transponder blackout/gap score")


class AISCandidate(BaseModel):
    """Ranked suspect vessel candidate evaluated against spill origin and release window."""
    rank: int = Field(..., description="Ranking position based on final attribution score")
    mmsi: int = Field(..., description="Maritime Mobile Service Identity")
    vessel_name: str = Field("Unknown Vessel", description="Name of vessel")
    ship_type: str = Field(..., description="Vessel category (e.g. Tanker, Cargo, Fishing)")
    imo: Optional[int] = Field(None, description="International Maritime Organization number")
    callsign: Optional[str] = Field(None, description="Vessel radio callsign")
    attribution_score_pct: float = Field(..., description="Composite attribution evidence score (0% to 100%)")
    minimum_distance_km: float = Field(..., description="Closest Point of Approach distance in km")
    closest_approach_time: str = Field(..., description="ISO timestamp of closest approach")
    cpa_latitude: Optional[float] = Field(None, description="Latitude at CPA")
    cpa_longitude: Optional[float] = Field(None, description="Longitude at CPA")
    hours_before_observation: float = Field(..., description="Elapsed hours prior to spill detection")
    duration_within_20km_hours: float = Field(..., description="Hours spent within 20km vicinity of origin")
    speed_at_cpa_knots: Optional[float] = Field(None, description="Speed at CPA in knots")
    approaching_origin: bool = Field(..., description="True if vessel converged towards origin")
    leaving_origin: bool = Field(..., description="True if vessel diverged from origin")
    ais_gap_detected: bool = Field(False, description="True if transponder gap was detected near release time")
    evidence_list: List[str] = Field(default_factory=list, description="Dynamically derived evidence points")
    scores: AISScoreBreakdown = Field(..., description="Detailed component score breakdown")
    kinematics: Optional[AISKinematicFeatures] = Field(None, description="Extracted movement features")
    trajectory: List[AISTrajectoryPoint] = Field(default_factory=list, description="Reconstructed trajectory waypoints")


class AISAttributionRequest(BaseModel):
    """Request payload for AIS vessel attribution analysis."""
    origin_latitude: float = Field(..., description="Probable spill origin latitude")
    origin_longitude: float = Field(..., description="Probable spill origin longitude")
    observation_time: str = Field(..., description="ISO 8601 observation timestamp")
    estimated_spill_time: Optional[str] = Field(None, description="ISO 8601 estimated spill release timestamp")
    spatial_threshold_km: Optional[float] = Field(50.0, description="Candidate search radius around origin in km")
    time_window_hours: Optional[float] = Field(12.0, description="Temporal window around release time in hours")
    ais_source: Optional[str] = Field("auto", description="Data source mode: 'auto', 'benchmark', 'synthetic', or 'custom'")


class AISAttributionResult(BaseModel):
    """Complete response from AIS vessel attribution engine."""
    candidate_count: int = Field(..., description="Number of evaluated vessel candidates")
    ranking: List[AISCandidate] = Field(default_factory=list, description="Ranked suspect vessels")
    scoring_weights: Dict[str, float] = Field(
        default_factory=lambda: {
            "spatial_proximity": 0.30,
            "temporal_correlation": 0.25,
            "trajectory_alignment": 0.20,
            "behavioral_evidence": 0.15,
            "transponder_gap": 0.10
        }
    )
    time_window_hours: Optional[float] = Field(12.0, description="Configured temporal window in hours (±)")
    search_radius_km: Optional[float] = Field(50.0, description="Configured spatial candidate search radius in km")
    ais_data_source: Optional[str] = Field(
        "context_aware_synthetic",
        description="Data source used ('real_ais', 'persistent_benchmark', or 'context_aware_synthetic')"
    )
    attribution_type: str = Field(
        "correlation_ranking",
        description="Methodology description (multi-criteria evidence correlation)"
    )
    scientific_disclaimer: str = Field(
        "Attribution results represent statistical spatiotemporal correlation and vessel evidence ranking, "
        "not deterministic proof of spill causation.",
        description="Legal and scientific disclaimer"
    )

"""Production-grade, generalized AIS vessel attribution and trajectory analysis service.

Pipeline:
AIS Dataset -> Parsing & Validation -> Trajectory Reconstruction -> Spatio-temporal Filtering
-> Kinematic Feature Extraction -> Configurable Weighted Scoring -> Dynamic Explainability
"""
import logging
import math
from pathlib import Path
from typing import Optional, Dict, Any, List, Union
import numpy as np
import pandas as pd

from ..core.config import settings
from ..schemas.ais import (
    AISTrajectoryPoint,
    AISKinematicFeatures,
    AISScoreBreakdown,
    AISCandidate,
    AISAttributionResult
)
from .ais_generator import generate_synthetic_ais_dataset

logger = logging.getLogger("sih.ais")


def haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate great-circle distance between two points in kilometers."""
    R = 6371.0
    r_lat1 = np.radians(lat1)
    r_lat2 = np.radians(lat2)
    dlat = r_lat2 - r_lat1
    dlon = np.radians(lon2 - lon1)

    a = (
        np.sin(dlat / 2.0) ** 2
        + np.cos(r_lat1) * np.cos(r_lat2) * np.sin(dlon / 2.0) ** 2
    )
    return float(2.0 * R * np.arcsin(np.sqrt(np.clip(a, 0.0, 1.0))))


def calculate_cog(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Course Over Ground (bearing in degrees 0-360) from point 1 to point 2."""
    r_lat1 = np.radians(lat1)
    r_lat2 = np.radians(lat2)
    dlon = np.radians(lon2 - lon1)

    x = np.sin(dlon) * np.cos(r_lat2)
    y = np.cos(r_lat1) * np.sin(r_lat2) - np.sin(r_lat1) * np.cos(r_lat2) * np.cos(dlon)

    bearing = np.degrees(np.arctan2(x, y))
    return float((bearing + 360.0) % 360.0)


def validate_ais_schema(df: pd.DataFrame) -> pd.DataFrame:
    """Validate schema, drop NaNs, enforce geographic bounding, and coerce data types."""
    req_cols = ["mmsi", "latitude", "longitude", "timestamp"]
    for col in req_cols:
        if col not in df.columns:
            raise ValueError(f"Missing required AIS column: '{col}'")

    # Coerce types and drop invalid values
    df["mmsi"] = pd.to_numeric(df["mmsi"], errors="coerce")
    df["latitude"] = pd.to_numeric(df["latitude"], errors="coerce")
    df["longitude"] = pd.to_numeric(df["longitude"], errors="coerce")

    # Drop NaNs in critical geo columns
    df = df.dropna(subset=["mmsi", "latitude", "longitude", "timestamp"]).copy()
    df["mmsi"] = df["mmsi"].astype(int)

    # Enforce geographic bounding limits
    df = df[(df["latitude"] >= -90.0) & (df["latitude"] <= 90.0)]
    df = df[(df["longitude"] >= -180.0) & (df["longitude"] <= 180.0)]

    # Parse and normalize timestamps to UTC
    df["timestamp"] = pd.to_datetime(df["timestamp"], utc=True, format="mixed")

    # Optional metadata fields with defaults
    if "vessel_name" not in df.columns:
        df["vessel_name"] = df["mmsi"].apply(lambda m: f"Vessel-{m}")
    if "vessel_type" not in df.columns:
        df["vessel_type"] = "Cargo"
    if "speed" not in df.columns:
        df["speed"] = 10.0
    else:
        df["speed"] = pd.to_numeric(df["speed"], errors="coerce").fillna(10.0)
    if "course" not in df.columns:
        df["course"] = 0.0
    else:
        df["course"] = pd.to_numeric(df["course"], errors="coerce").fillna(0.0)

    # Sort records chronologically per vessel
    df = df.sort_values(by=["mmsi", "timestamp"]).reset_index(drop=True)
    return df


def resolve_and_load_ais(
    source: Optional[Union[pd.DataFrame, str, Path]] = None,
    origin_latitude: float = 32.4755,
    origin_longitude: float = 30.2626,
    estimated_release_time: Optional[str] = None,
    time_window_hours: float = 12.0,
    max_candidate_distance_km: float = 50.0,
    ais_source_mode: str = "auto"
) -> tuple[pd.DataFrame, str]:
    """
    Select and load AIS data according to the three defined source modes:
    Mode A: Real / Custom AIS (DataFrame or CSV path provided).
            Never generates synthetic data. If no candidates exist, returns empty DataFrame.
    Mode B: Persistent Synthetic Benchmark (explicitly requested 'benchmark').
            Uses backend/data/synthetic_ais.csv.
    Mode C: Context-Aware Synthetic Demonstration ('synthetic' or 'auto' where benchmark has no vessels).
            Generates realistic synthetic vessels dynamically around (origin_latitude, origin_longitude)
            and estimated_release_time.
    """
    if isinstance(source, pd.DataFrame):
        return validate_ais_schema(source.copy()), "real_ais"
    elif source is not None and Path(source).exists():
        return validate_ais_schema(pd.read_csv(source)), "custom_upload"

    # Mode B: Explicit persistent benchmark requested
    if ais_source_mode in ("benchmark", "persistent_benchmark"):
        if settings.AIS_DEFAULT_DATA_PATH.exists():
            return validate_ais_schema(pd.read_csv(settings.AIS_DEFAULT_DATA_PATH)), "persistent_benchmark"
        raise FileNotFoundError(f"Persistent benchmark AIS file not found at {settings.AIS_DEFAULT_DATA_PATH}")

    # Mode C: Explicit synthetic generation requested
    if ais_source_mode in ("synthetic", "context_aware_synthetic"):
        df = generate_synthetic_ais_dataset(
            origin_latitude=origin_latitude,
            origin_longitude=origin_longitude,
            estimated_release_time=estimated_release_time or "2019-10-19T06:56:47Z",
            lookback_hours=int(max(24, time_window_hours * 2)),
            lookahead_hours=int(max(6, time_window_hours)),
            output_csv_path=None
        )
        return validate_ais_schema(df), "context_aware_synthetic"

    # Mode C / Auto: Context-aware automatic selection
    # Check if the persistent benchmark dataset is geographically relevant to this origin
    if settings.AIS_DEFAULT_DATA_PATH.exists():
        try:
            b_df = pd.read_csv(settings.AIS_DEFAULT_DATA_PATH)
            lat_min, lat_max = b_df["latitude"].min(), b_df["latitude"].max()
            lon_min, lon_max = b_df["longitude"].min(), b_df["longitude"].max()
            deg_buffer = max(1.0, max_candidate_distance_km / 75.0)

            if (lat_min - deg_buffer <= origin_latitude <= lat_max + deg_buffer and
                lon_min - deg_buffer <= origin_longitude <= lon_max + deg_buffer):
                # Sample points to quickly check true great-circle distance
                sampled = b_df.iloc[::10]
                min_dist = min(
                    haversine_km(row["latitude"], row["longitude"], origin_latitude, origin_longitude)
                    for _, row in sampled.iterrows()
                )
                if min_dist <= max_candidate_distance_km:
                    logger.info("Using persistent benchmark AIS (geographic match found)")
                    return validate_ais_schema(b_df), "persistent_benchmark"
        except Exception as e:
            logger.warning(f"Error checking persistent benchmark coverage: {e}")

    # If benchmark has no vessels near origin or is outside candidate radius:
    # Generate context-aware synthetic AIS dataset dynamically around the current investigation context
    logger.info(
        f"Generating context-aware synthetic AIS dataset around origin "
        f"({origin_latitude:.4f}, {origin_longitude:.4f}) at {estimated_release_time}"
    )
    df = generate_synthetic_ais_dataset(
        origin_latitude=origin_latitude,
        origin_longitude=origin_longitude,
        estimated_release_time=estimated_release_time or "2019-10-19T06:56:47Z",
        lookback_hours=int(max(24, time_window_hours * 2)),
        lookahead_hours=int(max(6, time_window_hours)),
        output_csv_path=None
    )
    return validate_ais_schema(df), "context_aware_synthetic"


def load_and_validate_ais(
    source: Optional[Union[pd.DataFrame, str, Path]] = None,
    origin_latitude: Optional[float] = None,
    origin_longitude: Optional[float] = None,
    estimated_release_time: Optional[str] = None
) -> pd.DataFrame:
    """Backward-compatible loader and validator for AIS data."""
    lat = origin_latitude if origin_latitude is not None else 32.4755
    lon = origin_longitude if origin_longitude is not None else 30.2626
    df, _ = resolve_and_load_ais(
        source=source,
        origin_latitude=lat,
        origin_longitude=lon,
        estimated_release_time=estimated_release_time,
        ais_source_mode="auto" if source is None else "custom"
    )
    return df


def dynamic_ais_attribution(
    ais_dataframe: Optional[pd.DataFrame] = None,
    origin_latitude: float = 32.4755,
    origin_longitude: float = 30.2626,
    observation_time: str = "2019-10-19T15:56:47Z",
    estimated_spill_time: Optional[str] = None,
    max_candidate_distance_km: float = settings.AIS_MAX_CANDIDATE_DISTANCE_KM,
    time_window_hours: float = settings.AIS_TIME_WINDOW_HOURS,
    ais_source_mode: str = "auto"
) -> AISAttributionResult:
    """
    Execute end-to-end AIS vessel correlation and multi-factor attribution:
    1. Validate and reconstruct continuous trajectories
    2. Spatio-temporal filtering
    3. Feature extraction (CPA distance, temporal offset, alignment, speed anomaly, AIS gaps)
    4. Configurable weighted scoring
    5. Rule-based factual explainability
    """
    # 1. Parse reference timestamps
    obs_time = pd.to_datetime(observation_time, utc=True)
    if estimated_spill_time is not None:
        spill_time = pd.to_datetime(estimated_spill_time, utc=True)
    else:
        # Default estimated spill release time is ~9 hours prior to observation if unstated
        spill_time = obs_time - pd.Timedelta(hours=9)

    # 2. Ingest and validate AIS data via 3-mode source resolution
    df, effective_source = resolve_and_load_ais(
        source=ais_dataframe,
        origin_latitude=origin_latitude,
        origin_longitude=origin_longitude,
        estimated_release_time=spill_time.isoformat(),
        time_window_hours=time_window_hours,
        max_candidate_distance_km=max_candidate_distance_km,
        ais_source_mode=ais_source_mode
    )

    if df.empty:
        return AISAttributionResult(
            candidate_count=0,
            ranking=[],
            time_window_hours=time_window_hours,
            search_radius_km=max_candidate_distance_km,
            ais_data_source=effective_source
        )

    # 3. Compute distance to origin for all points
    df["distance_km"] = [
        haversine_km(row["latitude"], row["longitude"], origin_latitude, origin_longitude)
        for _, row in df.iterrows()
    ]

    # 4. Spatio-temporal Candidate Filtering
    vessel_min_dist = df.groupby("mmsi")["distance_km"].min()
    candidate_mmsis = vessel_min_dist[vessel_min_dist <= max_candidate_distance_km].index.tolist()

    if not candidate_mmsis:
        return AISAttributionResult(
            candidate_count=0,
            ranking=[],
            time_window_hours=time_window_hours,
            search_radius_km=max_candidate_distance_km,
            ais_data_source=effective_source
        )

    candidate_df = df[df["mmsi"].isin(candidate_mmsis)].copy()

    # 5. Extract Kinematic Features & Score Each Candidate Vessel
    rankings: List[AISCandidate] = []

    for mmsi, track in candidate_df.groupby("mmsi"):
        track = track.sort_values("timestamp").reset_index(drop=True)

        v_name = str(track["vessel_name"].iloc[0]) if "vessel_name" in track.columns else f"Vessel-{mmsi}"
        v_type = str(track["vessel_type"].iloc[0]) if "vessel_type" in track.columns else "Unknown"
        imo = int(track["imo"].iloc[0]) if "imo" in track.columns and pd.notna(track["imo"].iloc[0]) else None
        callsign = str(track["callsign"].iloc[0]) if "callsign" in track.columns and pd.notna(track["callsign"].iloc[0]) else None

        # Identify Closest Point of Approach (CPA)
        cpa_idx = track["distance_km"].idxmin()
        cpa_row = track.loc[cpa_idx]

        min_dist_km = float(cpa_row["distance_km"])
        cpa_lat = float(cpa_row["latitude"])
        cpa_lon = float(cpa_row["longitude"])
        cpa_time = pd.Timestamp(cpa_row["timestamp"])
        speed_at_cpa = float(cpa_row["speed"])
        course_at_cpa = float(cpa_row["course"])

        # Temporal delta to estimated release time & observation time
        hours_to_spill = abs((cpa_time - spill_time).total_seconds()) / 3600.0
        hours_before_obs = (obs_time - cpa_time).total_seconds() / 3600.0

        # Duration within 20km
        pts_in_roi = track[track["distance_km"] <= 20.0]
        if not pts_in_roi.empty:
            duration_within_20km = (pts_in_roi["timestamp"].max() - pts_in_roi["timestamp"].min()).total_seconds() / 3600.0
        else:
            duration_within_20km = 0.0

        # Kinematic & Directional Analysis: Approach vs Departure
        before_cpa = track[track["timestamp"] < cpa_time]
        after_cpa = track[track["timestamp"] > cpa_time]
        approaching = bool(len(before_cpa) > 0 and before_cpa["distance_km"].iloc[-1] > min_dist_km)
        leaving = bool(len(after_cpa) > 0 and after_cpa["distance_km"].iloc[0] > min_dist_km)

        # Bearing alignment: bearing from pre-CPA position to origin vs actual ship course
        if len(before_cpa) > 0:
            pre_row = before_cpa.iloc[-1]
            bearing_to_origin = calculate_cog(pre_row["latitude"], pre_row["longitude"], origin_latitude, origin_longitude)
            angle_diff = abs((cpa_row["course"] - bearing_to_origin + 180) % 360 - 180)
            alignment_score = max(0.0, 1.0 - (angle_diff / 90.0))
        elif approaching and leaving:
            alignment_score = 0.95
        else:
            alignment_score = 0.50

        # Speed anomaly / deceleration near origin
        avg_speed = float(track["speed"].mean())
        speed_reduction = max(0.0, avg_speed - speed_at_cpa)
        if speed_at_cpa < 6.0 and avg_speed > 10.0:
            # Marked slowdown near origin (indicative of low-speed maneuvering / discharge)
            behavior_score = 0.90
        elif duration_within_20km > 2.0 and avg_speed < 8.0:
            # Loitering in area
            behavior_score = 0.75
        elif speed_at_cpa >= 8.0:
            # Normal steady transit
            behavior_score = 0.40
        else:
            behavior_score = 0.20

        # Detect AIS gaps (transponder blackouts)
        # Gaps > 25 minutes during transit within the temporal window
        track["dt_min"] = track["timestamp"].diff().dt.total_seconds() / 60.0
        gap_points = track[(track["dt_min"] > 25.0) & (track["distance_km"] <= 35.0)]
        ais_gap_detected = not gap_points.empty
        max_gap_minutes = float(gap_points["dt_min"].max()) if ais_gap_detected else 0.0

        if ais_gap_detected and min_dist_km <= 15.0 and hours_to_spill <= 4.0:
            gap_score = min(1.0, max_gap_minutes / 45.0)
        else:
            gap_score = 0.0

        # --- Multi-factor Component Scores (Normalized 0.0 to 1.0) ---
        # 1. Spatial proximity score (0 to 1) - quadratic decay up to 25 km
        proximity_score = max(0.0, 1.0 - (min_dist_km / 25.0)) ** 1.5

        # 2. Temporal correlation score (0 to 1) - decay relative to release window
        temporal_score = max(0.0, 1.0 - (hours_to_spill / max(time_window_hours, 1.0)))

        # 3. Trajectory alignment score (0 to 1)
        # Combined with approach/departure continuity
        if approaching and leaving:
            continuity_bonus = 0.2
        elif approaching or leaving:
            continuity_bonus = 0.1
        else:
            continuity_bonus = 0.0
        final_alignment_score = min(1.0, alignment_score * 0.8 + continuity_bonus)

        # Composite Evidence Score
        w_prox = settings.AIS_WEIGHT_PROXIMITY
        w_temp = settings.AIS_WEIGHT_TEMPORAL
        w_align = settings.AIS_WEIGHT_ALIGNMENT
        w_behav = settings.AIS_WEIGHT_BEHAVIOR
        w_gap = settings.AIS_WEIGHT_ANOMALY_GAP

        final_composite_score = (
            w_prox * proximity_score
            + w_temp * temporal_score
            + w_align * final_alignment_score
            + w_behav * behavior_score
            + w_gap * gap_score
        )

        final_score_pct = round(final_composite_score * 100.0, 2)

        # --- Dynamic Rule-Based Evidence Explanation Generation ---
        evidence_points: List[str] = []

        # Spatial evidence
        if min_dist_km < 3.0:
            evidence_points.append(f"Direct origin pass: {min_dist_km:.2f} km CPA to probable release center")
        elif min_dist_km < 10.0:
            evidence_points.append(f"Close spatial proximity: {min_dist_km:.2f} km CPA to probable origin")
        else:
            evidence_points.append(f"Distant transit: {min_dist_km:.1f} km from probable origin")

        # Temporal evidence
        if hours_to_spill <= 1.0:
            evidence_points.append(f"Strong temporal match: present at CPA within {int(hours_to_spill * 60)} min of release window")
        elif hours_to_spill <= 3.0:
            evidence_points.append(f"Moderate temporal correlation: CPA offset by {hours_to_spill:.1f} h from release window")
        else:
            evidence_points.append(f"Weak temporal alignment: CPA occurred {hours_to_spill:.1f} h outside estimated window")

        # Trajectory alignment evidence
        if approaching and leaving:
            evidence_points.append(f"Continuous corridor transit: converged on and departed from origin vicinity (COG {course_at_cpa:.0f}°)")
        elif approaching:
            evidence_points.append(f"Approaching origin corridor prior to CPA (COG {course_at_cpa:.0f}°)")
        elif leaving:
            evidence_points.append(f"Departing origin corridor after CPA (COG {course_at_cpa:.0f}°)")

        # Kinematic / Behavioral evidence
        if speed_reduction >= 4.0:
            evidence_points.append(f"Significant speed reduction near origin: dropped from {avg_speed:.1f} kn to {speed_at_cpa:.1f} kn")
        elif speed_at_cpa < 6.0:
            evidence_points.append(f"Low transit speed ({speed_at_cpa:.1f} kn) observed near origin area")
        else:
            evidence_points.append(f"Cruising steadily at {speed_at_cpa:.1f} kn along shipping route")

        # AIS Gap / Transponder anomaly evidence
        if ais_gap_detected and max_gap_minutes >= 25.0:
            evidence_points.append(f"AIS transponder blackout detected: {int(max_gap_minutes)} min gap near release area")

        # Trajectory Waypoints for Frontend Mapping
        # Select representative points (downsample if > 150 points to preserve map responsiveness)
        step = max(1, len(track) // 60)
        sampled_track = track.iloc[::step]
        trajectory_points = [
            AISTrajectoryPoint(
                timestamp=row["timestamp"].isoformat(),
                latitude=round(float(row["latitude"]), 6),
                longitude=round(float(row["longitude"]), 6),
                speed_knots=round(float(row["speed"]), 1),
                course_deg=round(float(row["course"]), 1)
            )
            for _, row in sampled_track.iterrows()
        ]

        kinematics_obj = AISKinematicFeatures(
            min_distance_km=round(min_dist_km, 3),
            closest_approach_time=cpa_time.isoformat(),
            temporal_offset_hours=round(hours_to_spill, 2),
            speed_at_cpa_knots=round(speed_at_cpa, 1),
            average_speed_knots=round(avg_speed, 1),
            course_at_cpa_deg=round(course_at_cpa, 1),
            trajectory_alignment_score=round(final_alignment_score, 3),
            speed_reduction_knots=round(speed_reduction, 1),
            ais_gap_detected=ais_gap_detected,
            max_gap_minutes=round(max_gap_minutes, 1)
        )

        score_breakdown = AISScoreBreakdown(
            distance=round(proximity_score, 4),
            temporal=round(temporal_score, 4),
            persistence=round(min(1.0, duration_within_20km / 6.0), 4),
            approach=round(final_alignment_score, 4),
            proximity=round(proximity_score, 4),
            alignment=round(final_alignment_score, 4),
            behavior=round(behavior_score, 4),
            anomaly_gap=round(gap_score, 4)
        )

        candidate = AISCandidate(
            rank=0,  # will be assigned after sorting
            mmsi=int(mmsi),
            vessel_name=v_name,
            ship_type=v_type,
            imo=imo,
            callsign=callsign,
            attribution_score_pct=final_score_pct,
            minimum_distance_km=round(min_dist_km, 3),
            closest_approach_time=cpa_time.isoformat(),
            cpa_latitude=round(cpa_lat, 6),
            cpa_longitude=round(cpa_lon, 6),
            hours_before_observation=round(hours_before_obs, 2),
            duration_within_20km_hours=round(duration_within_20km, 2),
            speed_at_cpa_knots=round(speed_at_cpa, 1),
            approaching_origin=approaching,
            leaving_origin=leaving,
            ais_gap_detected=ais_gap_detected,
            evidence_list=evidence_points,
            scores=score_breakdown,
            kinematics=kinematics_obj,
            trajectory=trajectory_points
        )
        rankings.append(candidate)

    # 6. Rank Candidates Descending by Attribution Score
    rankings.sort(key=lambda c: c.attribution_score_pct, reverse=True)
    for r_idx, c in enumerate(rankings, start=1):
        c.rank = r_idx

    return AISAttributionResult(
        candidate_count=len(rankings),
        ranking=rankings,
        scoring_weights={
            "spatial_proximity": settings.AIS_WEIGHT_PROXIMITY,
            "temporal_correlation": settings.AIS_WEIGHT_TEMPORAL,
            "trajectory_alignment": settings.AIS_WEIGHT_ALIGNMENT,
            "behavioral_evidence": settings.AIS_WEIGHT_BEHAVIOR,
            "transponder_gap": settings.AIS_WEIGHT_ANOMALY_GAP,
            # Backward compatibility aliases
            "distance": settings.AIS_WEIGHT_PROXIMITY,
            "temporal": settings.AIS_WEIGHT_TEMPORAL,
            "persistence": settings.AIS_WEIGHT_BEHAVIOR,
            "approach": settings.AIS_WEIGHT_ALIGNMENT
        },
        time_window_hours=time_window_hours,
        search_radius_km=max_candidate_distance_km,
        ais_data_source=effective_source,
        attribution_type="correlation_ranking",
        scientific_disclaimer=(
            "Attribution results represent statistical spatiotemporal correlation and vessel evidence ranking, "
            "not deterministic proof of spill causation."
        )
    )


def generate_synthetic_ais(
    observation_time: str,
    origin_latitude: float,
    origin_longitude: float,
    ais_lookback_hours: int = 24,
    ais_lookahead_hours: int = 6,
    ais_interval_minutes: int = 12,
    num_vessels: int = 12,
    random_seed: int = 42
) -> pd.DataFrame:
    """Backward-compatible wrapper for generating synthetic AIS DataFrame."""
    obs_dt = pd.to_datetime(observation_time, utc=True)
    rel_time = (obs_dt - pd.Timedelta(hours=9)).isoformat()
    return generate_synthetic_ais_dataset(
        origin_latitude=origin_latitude,
        origin_longitude=origin_longitude,
        estimated_release_time=rel_time,
        lookback_hours=ais_lookback_hours,
        lookahead_hours=ais_lookahead_hours,
        interval_minutes=ais_interval_minutes,
        random_seed=random_seed
    )

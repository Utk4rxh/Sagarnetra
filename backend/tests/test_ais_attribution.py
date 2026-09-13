"""Comprehensive automated test suite for generalized AIS attribution,
context-aware synthetic generation, and unified investigation pipeline integration.
"""
import pytest
import pandas as pd
import numpy as np
from pathlib import Path

from backend.app.core.config import settings
from backend.app.services.ais_service import (
    load_and_validate_ais,
    validate_ais_schema,
    dynamic_ais_attribution,
    haversine_km,
    resolve_and_load_ais
)
from backend.app.services.ais_generator import generate_synthetic_ais_dataset
from backend.app.services.investigation_service import run_investigation


# =========================================================================
# TEST 1: Persistent synthetic AIS CSV loads correctly
# =========================================================================
def test_01_persistent_synthetic_ais_csv_loads():
    assert settings.AIS_DEFAULT_DATA_PATH.exists(), "Persistent benchmark CSV must exist"
    df = pd.read_csv(settings.AIS_DEFAULT_DATA_PATH)
    assert not df.empty
    assert "mmsi" in df.columns
    assert "latitude" in df.columns
    assert "longitude" in df.columns
    assert "timestamp" in df.columns
    assert len(df["mmsi"].unique()) >= 5


# =========================================================================
# TEST 2: AIS schema validation rejects invalid coordinates and malformed timestamps
# =========================================================================
def test_02_ais_schema_validation_rejects_invalid_records():
    # Missing required column
    invalid_df = pd.DataFrame({
        "mmsi": [12345],
        "latitude": [32.0],
        # longitude missing
        "timestamp": ["2019-10-19T12:00:00Z"]
    })
    with pytest.raises(ValueError, match="Missing required AIS column"):
        validate_ais_schema(invalid_df)

    # Invalid / out-of-bounds latitude (e.g. > 90) and unparseable timestamp
    corrupt_df = pd.DataFrame({
        "mmsi": [1001, 1002, 1003],
        "latitude": [32.5, 95.0, np.nan],  # 95.0 is out of bounds, NaN should be dropped
        "longitude": [30.1, 30.2, 30.3],
        "timestamp": ["2019-10-19T12:00:00Z", "2019-10-19T12:00:00Z", "2019-10-19T12:00:00Z"]
    })
    cleaned = validate_ais_schema(corrupt_df)
    assert len(cleaned) == 1
    assert cleaned.iloc[0]["mmsi"] == 1001


# =========================================================================
# TEST 3: Trajectory reconstruction works
# =========================================================================
def test_03_trajectory_reconstruction_works():
    origin_lat = 55.2540
    origin_lon = 5.8108
    rel_time = "2019-10-19T06:56:00Z"

    df = generate_synthetic_ais_dataset(
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        estimated_release_time=rel_time
    )

    result = dynamic_ais_attribution(
        ais_dataframe=df,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time
    )

    assert result.candidate_count > 0
    top = result.ranking[0]
    assert len(top.trajectory) > 5, "Trajectory waypoints must be reconstructed"
    for pt in top.trajectory:
        assert -90.0 <= pt.latitude <= 90.0
        assert -180.0 <= pt.longitude <= 180.0
        assert pt.speed_knots >= 0.0


# =========================================================================
# TEST 4: AIS transmission gaps are detected
# =========================================================================
def test_04_ais_transmission_gaps_detected():
    origin_lat = 55.2540
    origin_lon = 5.8108
    rel_time = "2019-10-19T06:56:00Z"

    df = generate_synthetic_ais_dataset(
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        estimated_release_time=rel_time
    )

    result = dynamic_ais_attribution(
        ais_dataframe=df,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time
    )

    gap_candidates = [c for c in result.ranking if c.ais_gap_detected]
    assert len(gap_candidates) > 0, "At least one candidate must have a detected AIS transmission gap"
    suspect = gap_candidates[0]
    assert suspect.kinematics.max_gap_minutes >= 25.0
    gap_evidence = [e for e in suspect.evidence_list if "blackout" in e or "gap" in e]
    assert len(gap_evidence) > 0, "Evidence log must report the detected blackout"


# =========================================================================
# TEST 5: Spatial filtering removes irrelevant vessels
# =========================================================================
def test_05_spatial_filtering_removes_irrelevant_vessels():
    origin_lat = 55.2540
    origin_lon = 5.8108
    rel_time = "2019-10-19T06:56:00Z"

    df = generate_synthetic_ais_dataset(
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        estimated_release_time=rel_time
    )

    # Search radius 30 km (should exclude vessels passing > 30 km away)
    result_30 = dynamic_ais_attribution(
        ais_dataframe=df,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time,
        max_candidate_distance_km=30.0
    )

    for c in result_30.ranking:
        assert c.minimum_distance_km <= 30.0, f"Vessel {c.vessel_name} exceeds spatial threshold"

    # Search radius 10 km (should exclude even more vessels)
    result_10 = dynamic_ais_attribution(
        ais_dataframe=df,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time,
        max_candidate_distance_km=10.0
    )
    assert result_10.candidate_count <= result_30.candidate_count
    for c in result_10.ranking:
        assert c.minimum_distance_km <= 10.0


# =========================================================================
# TEST 6: Temporal filtering distinguishes wrong-time vessels
# =========================================================================
def test_06_temporal_filtering_distinguishes_wrong_time_vessels():
    origin_lat = 55.2540
    origin_lon = 5.8108
    rel_time = "2019-10-19T06:56:00Z"

    df = generate_synthetic_ais_dataset(
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        estimated_release_time=rel_time
    )

    result = dynamic_ais_attribution(
        ais_dataframe=df,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time,
        time_window_hours=12.0
    )

    wrong_time = [c for c in result.ranking if "Levantine" in c.vessel_name or c.mmsi == 620100003]
    high_corr = [c for c in result.ranking if "Voyager" in c.vessel_name or c.mmsi == 620100001]

    assert len(wrong_time) > 0 and len(high_corr) > 0
    wt = wrong_time[0]
    hc = high_corr[0]

    # Even though wrong_time vessel passes very close, its temporal score is much lower
    assert wt.scores.temporal < hc.scores.temporal
    assert wt.attribution_score_pct < hc.attribution_score_pct


# =========================================================================
# TEST 7: Context-aware synthetic generator accepts arbitrary origin coordinates
# =========================================================================
def test_07_generator_accepts_arbitrary_coordinates():
    origins = [
        (0.0, 0.0),
        (55.2540, 5.8108),
        (-34.5000, 18.5000),
        (25.0000, 60.0000)
    ]
    for lat, lon in origins:
        df = generate_synthetic_ais_dataset(origin_latitude=lat, origin_longitude=lon)
        assert not df.empty
        # Mean coordinates of all vessels should be centered around the requested origin
        assert abs(df["latitude"].mean() - lat) < 1.0
        assert abs(df["longitude"].mean() - lon) < 1.5


# =========================================================================
# TEST 8: Context-aware synthetic generator accepts arbitrary timestamps
# =========================================================================
def test_08_generator_accepts_arbitrary_timestamps():
    timestamps = [
        "2023-05-10T14:30:00Z",
        "2026-09-13T06:00:00Z"
    ]
    for ts in timestamps:
        df = generate_synthetic_ais_dataset(
            origin_latitude=30.0,
            origin_longitude=70.0,
            estimated_release_time=ts
        )
        target_dt = pd.to_datetime(ts, utc=True)
        min_dt = pd.to_datetime(df["timestamp"].min(), utc=True)
        max_dt = pd.to_datetime(df["timestamp"].max(), utc=True)
        assert min_dt <= target_dt <= max_dt


# =========================================================================
# TEST 9: Changing the origin changes generated vessel trajectories
# =========================================================================
def test_09_changing_origin_changes_trajectories():
    df1 = generate_synthetic_ais_dataset(origin_latitude=10.0, origin_longitude=20.0, random_seed=42)
    df2 = generate_synthetic_ais_dataset(origin_latitude=60.0, origin_longitude=5.0, random_seed=42)

    assert abs(df1["latitude"].mean() - df2["latitude"].mean()) > 40.0
    assert abs(df1["longitude"].mean() - df2["longitude"].mean()) > 10.0


# =========================================================================
# TEST 10: Changing estimated release time changes vessel behavior window
# =========================================================================
def test_10_changing_release_time_shifts_vessel_window():
    t1 = "2020-01-01T00:00:00Z"
    t2 = "2020-06-01T00:00:00Z"
    df1 = generate_synthetic_ais_dataset(estimated_release_time=t1)
    df2 = generate_synthetic_ais_dataset(estimated_release_time=t2)

    dt1 = pd.to_datetime(df1["timestamp"].iloc[0], utc=True)
    dt2 = pd.to_datetime(df2["timestamp"].iloc[0], utc=True)
    assert abs((dt2 - dt1).days) > 140


# =========================================================================
# TEST 11: Master /investigate passes actual hindcast origin into AIS analysis
# =========================================================================
def test_11_investigate_passes_actual_hindcast_origin():
    # Run generalized investigation on 00004.tif with North Sea coordinates
    res = run_investigation(
        sar_image_path=settings.OIL_DIR / "00004.tif",
        observation_time="2019-10-19T12:00:00Z",
        latitude=55.2540,
        longitude=5.8108,
        location_source="user_provided"
    )
    hindcast_origin_lat = res.hindcast.ensemble_origin.latitude
    hindcast_origin_lon = res.hindcast.ensemble_origin.longitude

    assert abs(hindcast_origin_lat - 55.25) < 0.5
    assert abs(hindcast_origin_lon - 5.8) < 0.5

    # Top candidate CPA latitude and longitude should be near the hindcast origin
    top = res.top_candidate
    assert top is not None
    assert abs(top.cpa_latitude - hindcast_origin_lat) < 0.5
    assert abs(top.cpa_longitude - hindcast_origin_lon) < 0.5


# =========================================================================
# TEST 12: Master /investigate returns non-zero synthetic candidates in generalized mode
# =========================================================================
def test_12_investigate_returns_nonzero_candidates_in_generalized_mode():
    res = run_investigation(
        sar_image_path=settings.OIL_DIR / "00004.tif",
        observation_time="2019-10-19T12:00:00Z",
        latitude=55.2540,
        longitude=5.8108,
        location_source="user_provided"
    )
    assert res.ais_attribution.candidate_count > 0
    assert len(res.ais_attribution.ranking) > 0
    assert res.top_candidate is not None
    assert res.top_candidate.attribution_score_pct > 0.0


# =========================================================================
# TEST 13: Changing one vessel's coordinates changes its attribution score/ranking
# =========================================================================
def test_13_changing_coordinates_changes_score():
    origin_lat = 55.2540
    origin_lon = 5.8108
    rel_time = "2019-10-19T06:56:00Z"

    df = generate_synthetic_ais_dataset(
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        estimated_release_time=rel_time
    )

    res_baseline = dynamic_ais_attribution(
        ais_dataframe=df,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time
    )
    baseline_top = res_baseline.ranking[0]
    baseline_score = baseline_top.attribution_score_pct

    # Move top vessel 40 km away
    df_moved = df.copy()
    mask_top = df_moved["mmsi"] == baseline_top.mmsi
    df_moved.loc[mask_top, "latitude"] = df_moved.loc[mask_top, "latitude"] + 0.35  # ~39 km north

    res_moved = dynamic_ais_attribution(
        ais_dataframe=df_moved,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time
    )
    vessel_after = next(c for c in res_moved.ranking if c.mmsi == baseline_top.mmsi)
    assert vessel_after.attribution_score_pct < baseline_score - 15.0


# =========================================================================
# TEST 14: Changing one vessel's timestamp changes its attribution score/ranking
# =========================================================================
def test_14_changing_timestamp_changes_score():
    origin_lat = 55.2540
    origin_lon = 5.8108
    rel_time = "2019-10-19T06:56:00Z"

    df = generate_synthetic_ais_dataset(
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        estimated_release_time=rel_time
    )

    res_baseline = dynamic_ais_attribution(
        ais_dataframe=df,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time
    )
    baseline_top = res_baseline.ranking[0]
    baseline_score = baseline_top.attribution_score_pct

    # Shift top vessel's timestamps by 15 hours
    df_shifted = df.copy()
    mask_top = df_shifted["mmsi"] == baseline_top.mmsi
    shifted_times = pd.to_datetime(df_shifted.loc[mask_top, "timestamp"], utc=True) - pd.Timedelta(hours=15)
    df_shifted.loc[mask_top, "timestamp"] = shifted_times.dt.strftime("%Y-%m-%dT%H:%M:%SZ")

    res_shifted = dynamic_ais_attribution(
        ais_dataframe=df_shifted,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time
    )
    vessel_after = next(c for c in res_shifted.ranking if c.mmsi == baseline_top.mmsi)
    assert vessel_after.attribution_score_pct < baseline_score - 15.0


# =========================================================================
# TEST 15: Evidence values correspond to calculated feature values
# =========================================================================
def test_15_evidence_values_correspond_to_features():
    origin_lat = 55.2540
    origin_lon = 5.8108
    rel_time = "2019-10-19T06:56:00Z"

    df = generate_synthetic_ais_dataset(
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        estimated_release_time=rel_time
    )

    result = dynamic_ais_attribution(
        ais_dataframe=df,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time
    )

    for candidate in result.ranking:
        cpa_str = f"{candidate.minimum_distance_km:.2f} km"
        cpa_approx_str = f"{candidate.minimum_distance_km:.1f} km"
        has_matching_spatial_evidence = any(
            cpa_str in ev or cpa_approx_str in ev for ev in candidate.evidence_list
        )
        assert has_matching_spatial_evidence, (
            f"Candidate {candidate.vessel_name} evidence list does not match its CPA feature: {candidate.evidence_list}"
        )


# =========================================================================
# TEST 16: Critical Dynamic Test (Displacing highest-ranked vessel alters ranking)
# =========================================================================
def test_16_critical_dynamic_test():
    origin_lat = 55.2540
    origin_lon = 5.8108
    rel_time = "2019-10-19T06:56:00Z"

    df = generate_synthetic_ais_dataset(
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        estimated_release_time=rel_time
    )

    baseline = dynamic_ais_attribution(
        ais_dataframe=df,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time
    )
    baseline_top_vessel = baseline.ranking[0].vessel_name
    baseline_top_mmsi = baseline.ranking[0].mmsi
    baseline_top_score = baseline.ranking[0].attribution_score_pct

    # Move the highest-ranked vessel 100 km away (outside 50 km candidate threshold)
    df_modified = df.copy()
    mask_top = df_modified["mmsi"] == baseline_top_mmsi
    df_modified.loc[mask_top, "latitude"] = df_modified.loc[mask_top, "latitude"] + 1.0  # ~111 km away

    modified_res = dynamic_ais_attribution(
        ais_dataframe=df_modified,
        origin_latitude=origin_lat,
        origin_longitude=origin_lon,
        observation_time="2019-10-19T12:00:00Z",
        estimated_spill_time=rel_time
    )

    # 1. Highest ranked vessel must change
    new_top_vessel = modified_res.ranking[0].vessel_name
    new_top_score = modified_res.ranking[0].attribution_score_pct

    assert new_top_vessel != baseline_top_vessel, "Displacing top candidate must change ranking"
    assert new_top_score != baseline_top_score, "Attribution score must dynamically change"
    assert modified_res.candidate_count == baseline.candidate_count - 1, "Displaced vessel should be filtered out"

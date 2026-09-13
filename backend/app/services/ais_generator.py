"""Parameterizable synthetic AIS generator with realistic vessel kinematic classes."""
import math
from datetime import datetime, timedelta
from pathlib import Path
from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd


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


def calculate_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate Course Over Ground (bearing in degrees 0-360) from point 1 to point 2."""
    r_lat1 = np.radians(lat1)
    r_lat2 = np.radians(lat2)
    dlon = np.radians(lon2 - lon1)

    x = np.sin(dlon) * np.cos(r_lat2)
    y = np.cos(r_lat1) * np.sin(r_lat2) - np.sin(r_lat1) * np.cos(r_lat2) * np.cos(dlon)

    bearing = np.degrees(np.arctan2(x, y))
    return float((bearing + 360.0) % 360.0)


def generate_synthetic_ais_dataset(
    origin_latitude: float = 32.4755,
    origin_longitude: float = 30.2626,
    estimated_release_time: str = "2019-10-19T06:56:47Z",
    lookback_hours: int = 24,
    lookahead_hours: int = 6,
    interval_minutes: int = 12,
    random_seed: int = 42,
    output_csv_path: Optional[Path] = None
) -> pd.DataFrame:
    """
    Generate realistic synthetic AIS records representing multiple vessels with
    different spatial, temporal, and behavioral relationships to a spill origin.

    Vessel Classes:
    1. HIGH-CORRELATION VESSEL (MT Ocean Voyager, Tanker):
       - Passes ~1.8 km CPA to probable origin
       - CPA occurs within 35 minutes of estimated release window
       - Directionally aligned with corridor (COG ~45°)
       - Drops speed from 14.5 knots to 5.2 knots near origin
       - 36-minute intentional/anomalous AIS gap near the origin
    2. MODERATE-CORRELATION VESSEL (MV Nord Trader, Bulk Carrier):
       - Route passes ~9.5 km CPA from origin
       - Time overlap with outer window (~3.5 hours offset)
       - Normal cruising speed (12.0 knots), continuous AIS
    3. WRONG-TIME VESSEL (MV Levantine, Container Ship):
       - Spatially passes very close (~2.2 km CPA from origin)
       - BUT passes ~13.5 hours BEFORE the release window (spatially near, temporally wrong)
    4. WRONG-TRAJECTORY VESSEL (FV Poseidon, Fishing Vessel):
       - Active during the estimated release window
       - Operates ~28 km away with erratic zigzag trajectory
    5. IRRELEVANT VESSELS (Multiple cargo/tanker/service vessels):
       - Passing 40-75 km away or outside both spatial and temporal windows
    """
    np.random.seed(random_seed)

    release_dt = pd.to_datetime(estimated_release_time)
    if release_dt.tz is None:
        release_dt = release_dt.tz_localize("UTC")
    else:
        release_dt = release_dt.tz_convert("UTC")

    start_dt = release_dt - pd.Timedelta(hours=lookback_hours)
    end_dt = release_dt + pd.Timedelta(hours=lookahead_hours)

    timestamps = pd.date_range(start=start_dt, end=end_dt, freq=f"{interval_minutes}min")

    # Conversion factors for geographic coordinates at this latitude
    # 1 degree latitude ~ 111.0 km
    # 1 degree longitude ~ 111.0 * cos(lat) km
    lat_rad = math.radians(origin_latitude)
    cos_lat = max(math.cos(lat_rad), 0.15)  # Guard against division by zero at poles
    km_to_deg_lat = 1.0 / 111.0
    km_to_deg_lon = 1.0 / (111.0 * cos_lat)

    # 1 knot = 1.852 km/h
    knots_to_kmh = 1.852

    # Vessel kinematic profiles defined with exact physical parameters:
    # d_cpa_km: genuine Closest Point of Approach distance in km
    # normal_side: +1 (starboard of course) or -1 (port of course)
    # time_offset_from_release_hours: hours from estimated release time to CPA
    vessels_spec = [
        {
            "mmsi": 620100001,
            "vessel_name": "MT Ocean Voyager",
            "vessel_type": "Tanker",
            "imo": 9482711,
            "callsign": "5VAB8",
            "draught": 12.8,
            "dest": "PORT SAID",
            "class": "HIGH_CORRELATION",
            # CPA ~1.8 km to origin, 36 min after release time, heading 45°
            "d_cpa_km": 1.8,
            "normal_side": 1,
            "time_offset_from_release_hours": 0.6,  # 36 min after release (grid-aligned)
            "heading_deg": 45.0,
            "cruise_speed_knots": 14.2,
            "speed_profile": "slowdown_at_origin",
            "has_ais_gap": True,
            "gap_start_offset_min": 2,  # Starts immediately after CPA ping
            "gap_duration_min": 36
        },
        {
            "mmsi": 620100002,
            "vessel_name": "MV Nord Trader",
            "vessel_type": "Bulk Carrier",
            "imo": 9355182,
            "callsign": "V3RK4",
            "draught": 9.4,
            "dest": "ALEXANDRIA",
            "class": "MODERATE_CORRELATION",
            # CPA ~9.5 km away, 3.6 hours before release time
            "d_cpa_km": 9.5,
            "normal_side": -1,
            "time_offset_from_release_hours": -3.6,
            "heading_deg": 38.0,
            "cruise_speed_knots": 11.8,
            "speed_profile": "steady_cruise",
            "has_ais_gap": False
        },
        {
            "mmsi": 620100003,
            "vessel_name": "MV Levantine",
            "vessel_type": "Container",
            "imo": 9612090,
            "callsign": "C6YZ2",
            "draught": 11.2,
            "dest": "PIRAEUS",
            "class": "WRONG_TIME",
            # Spatially close (~2.2 km), but passes 13.6 hours before release time!
            "d_cpa_km": 2.2,
            "normal_side": 1,
            "time_offset_from_release_hours": -13.6,
            "heading_deg": 42.0,
            "cruise_speed_knots": 19.5,
            "speed_profile": "high_speed",
            "has_ais_gap": False
        },
        {
            "mmsi": 620100004,
            "vessel_name": "FV Poseidon",
            "vessel_type": "Fishing",
            "imo": 8920144,
            "callsign": "SU3391",
            "draught": 4.1,
            "dest": "FISHING GROUNDS",
            "class": "WRONG_TRAJECTORY",
            # Active during release window, but ~28 km away with erratic heading
            "d_cpa_km": 28.0,
            "normal_side": -1,
            "time_offset_from_release_hours": 0.2,  # 12 min after release
            "heading_deg": 130.0,
            "cruise_speed_knots": 4.5,
            "speed_profile": "trawling_erratic",
            "has_ais_gap": False
        },
        {
            "mmsi": 620100005,
            "vessel_name": "MV Aegean Star",
            "vessel_type": "General Cargo",
            "imo": 9214480,
            "callsign": "SX5520",
            "draught": 7.5,
            "dest": "MERSIN",
            "class": "IRRELEVANT",
            # Far away (~46 km)
            "d_cpa_km": 46.0,
            "normal_side": 1,
            "time_offset_from_release_hours": -5.0,
            "heading_deg": 85.0,
            "cruise_speed_knots": 12.5,
            "speed_profile": "steady_cruise",
            "has_ais_gap": False
        },
        {
            "mmsi": 620100006,
            "vessel_name": "MT Delta Sailor",
            "vessel_type": "Tanker",
            "imo": 9518820,
            "callsign": "9V6612",
            "draught": 14.1,
            "dest": "SIDI KERIR",
            "class": "IRRELEVANT",
            # Far away (~56 km)
            "d_cpa_km": 56.0,
            "normal_side": -1,
            "time_offset_from_release_hours": 4.0,
            "heading_deg": 310.0,
            "cruise_speed_knots": 13.0,
            "speed_profile": "steady_cruise",
            "has_ais_gap": False
        },
        {
            "mmsi": 620100007,
            "vessel_name": "MV Sea Explorer",
            "vessel_type": "Research/Service",
            "imo": 9187344,
            "callsign": "HB4411",
            "draught": 5.5,
            "dest": "OFFSHORE GAS FIELD",
            "class": "IRRELEVANT",
            # Far away (~52 km)
            "d_cpa_km": 52.0,
            "normal_side": 1,
            "time_offset_from_release_hours": -8.0,
            "heading_deg": 60.0,
            "cruise_speed_knots": 7.2,
            "speed_profile": "slow_survey",
            "has_ais_gap": False
        },
        {
            "mmsi": 620100008,
            "vessel_name": "MV Coral Tide",
            "vessel_type": "Container",
            "imo": 9741123,
            "callsign": "VR8890",
            "draught": 13.5,
            "dest": "DAMANHUR",
            "class": "IRRELEVANT",
            # Far away (~62 km)
            "d_cpa_km": 62.0,
            "normal_side": -1,
            "time_offset_from_release_hours": -12.0,
            "heading_deg": 180.0,
            "cruise_speed_knots": 20.0,
            "speed_profile": "high_speed",
            "has_ais_gap": False
        }
    ]

    all_records = []

    for v in vessels_spec:
        mmsi = v["mmsi"]
        v_name = v["vessel_name"]
        v_type = v["vessel_type"]
        imo = v["imo"]
        callsign = v["callsign"]
        draught = v["draught"]
        dest = v["dest"]
        v_class = v["class"]

        heading = float(v["heading_deg"])
        heading_rad = math.radians(heading)

        # Unit motion vector (North, East) in km
        # In maritime navigation: 0 deg = North (cos=1, sin=0), 90 deg = East (cos=0, sin=1)
        u_north = math.cos(heading_rad)
        u_east = math.sin(heading_rad)

        # Vector perpendicular to course pointing from origin to CPA
        # A 90-degree clockwise turn (starboard): normal_angle = heading + 90
        normal_angle_rad = heading_rad + (math.pi / 2.0) * v.get("normal_side", 1)
        d_cpa = float(v["d_cpa_km"])
        cpa_offset_north_km = d_cpa * math.cos(normal_angle_rad)
        cpa_offset_east_km = d_cpa * math.sin(normal_angle_rad)

        # CPA geographic coordinate
        cpa_lat = origin_latitude + cpa_offset_north_km * km_to_deg_lat
        cpa_lon = origin_longitude + cpa_offset_east_km * km_to_deg_lon

        cpa_time = release_dt + pd.Timedelta(hours=v["time_offset_from_release_hours"])

        vessel_points = []

        for ts in timestamps:
            dt_hours = (ts - cpa_time).total_seconds() / 3600.0

            # Simulate gap if configured
            if v.get("has_ais_gap", False):
                gap_start = cpa_time + pd.Timedelta(minutes=v.get("gap_start_offset_min", 0))
                gap_end = gap_start + pd.Timedelta(minutes=v.get("gap_duration_min", 30))
                if gap_start <= ts <= gap_end:
                    continue  # Transponder off / blackout

            base_speed = float(v["cruise_speed_knots"])

            # Displacement along track in km relative to CPA
            speed_kmh = base_speed * knots_to_kmh
            dist_along_track_km = speed_kmh * dt_hours

            # Position in km relative to CPA
            pos_north_km = dist_along_track_km * u_north
            pos_east_km = dist_along_track_km * u_east

            # Convert to lat / lon
            lat = cpa_lat + pos_north_km * km_to_deg_lat
            lon = cpa_lon + pos_east_km * km_to_deg_lon

            # Apply realistic GPS measurement jitter
            if v_class == "WRONG_TRAJECTORY":
                # Erratic fishing drift / zigzag
                lat += np.random.normal(0, 0.003) + 0.005 * math.sin(dt_hours * 3.0)
                lon += np.random.normal(0, 0.003) + 0.005 * math.cos(dt_hours * 3.0)
            else:
                lat += np.random.normal(0, 0.0001)
                lon += np.random.normal(0, 0.0001)

            dist_to_origin = haversine_km(lat, lon, origin_latitude, origin_longitude)

            # Speed modulation based on behavior class
            speed_prof = v.get("speed_profile", "steady_cruise")
            if speed_prof == "slowdown_at_origin":
                if dist_to_origin < 6.0:
                    speed = 5.2 + np.random.uniform(-0.3, 0.4)
                else:
                    speed = base_speed + np.random.uniform(-0.4, 0.4)
            elif speed_prof == "trawling_erratic":
                speed = 4.2 + np.random.uniform(-1.2, 1.5)
            else:
                speed = base_speed + np.random.uniform(-0.3, 0.3)

            vessel_points.append({
                "timestamp": ts,
                "latitude": float(lat),
                "longitude": float(lon),
                "speed": float(max(0.1, speed))
            })

        for idx in range(len(vessel_points)):
            curr = vessel_points[idx]
            if idx < len(vessel_points) - 1:
                next_pt = vessel_points[idx + 1]
                cog = calculate_bearing_deg(curr["latitude"], curr["longitude"], next_pt["latitude"], next_pt["longitude"])
            elif idx > 0:
                prev_pt = vessel_points[idx - 1]
                cog = calculate_bearing_deg(prev_pt["latitude"], prev_pt["longitude"], curr["latitude"], curr["longitude"])
            else:
                cog = heading

            cog_deg = float((cog + 360.0) % 360.0)
            ship_heading = int(round(cog_deg)) % 360

            all_records.append({
                "mmsi": int(mmsi),
                "vessel_name": str(v_name),
                "vessel_type": str(v_type),
                "imo": int(imo),
                "callsign": str(callsign),
                "timestamp": curr["timestamp"].isoformat(),
                "latitude": round(curr["latitude"], 6),
                "longitude": round(curr["longitude"], 6),
                "speed": round(curr["speed"], 2),
                "course": round(cog_deg, 1),
                "heading": ship_heading,
                "navigation_status": "Under way using engine",
                "destination": dest,
                "draught": draught,
                "behavior_class": v_class
            })

    df = pd.DataFrame(all_records)

    if output_csv_path is not None:
        output_csv_path = Path(output_csv_path)
        output_csv_path.parent.mkdir(parents=True, exist_ok=True)
        df.to_csv(output_csv_path, index=False)

    return df

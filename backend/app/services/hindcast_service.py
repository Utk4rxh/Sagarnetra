"""Lagrangian environmental hindcasting and particle ensemble modeling."""
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime, timezone
import numpy as np
import pandas as pd
import xarray as xr

from ..core.config import settings
from ..schemas.detection import Coordinates
from ..schemas.hindcast import (
    ObservationMetadata,
    HindcastMetadata,
    HindcastTrajectoryPoint,
    EnsembleOrigin,
    ProbableOriginRegion,
    EnvironmentalSources,
    HindcastResult
)

logger = logging.getLogger("sih.hindcast")


def meters_to_latitude(meters: float) -> float:
    """Convert distance displacement in meters to delta latitude degrees."""
    return meters / 111320.0


def meters_to_longitude(meters: float, latitude: float) -> float:
    """Convert distance displacement in meters to delta longitude degrees at a given latitude."""
    return meters / (111320.0 * np.cos(np.radians(latitude)))


def find_coordinate(ds: xr.Dataset, candidates: List[str]) -> str:
    """Identify coordinate name from candidate list."""
    for name in candidates:
        if name in ds.coords:
            return name
    raise KeyError(f"None of {candidates} found in dataset coordinates: {list(ds.coords)}")


def normalize_time_coordinate(ds: xr.Dataset, time_name: str) -> xr.Dataset:
    """Normalize dataset time coordinate to UTC pd.DatetimeIndex."""
    raw_times = pd.to_datetime(ds[time_name].values)
    if raw_times.tz is None:
        utc_times = raw_times.tz_localize("UTC")
    else:
        utc_times = raw_times.tz_convert("UTC")
    return ds.assign_coords({time_name: utc_times})


def dynamic_hindcast(
    observation_latitude: float,
    observation_longitude: float,
    observation_time: str,
    wind_file: Optional[Path] = None,
    current_file: Optional[Path] = None,
    backtrack_hours: int = settings.BACKTRACK_HOURS,
    time_step_hours: int = settings.TIME_STEP_HOURS,
    windage_factor: float = settings.WINDAGE_FACTOR,
    particle_count: int = settings.PARTICLE_COUNT,
    initial_uncertainty_km: float = settings.INITIAL_UNCERTAINTY_KM,
    drift_noise_fraction: float = settings.DRIFT_NOISE_FRACTION,
    random_seed: int = 42
) -> HindcastResult:
    """Execute backward Lagrangian trajectory tracking and Monte Carlo origin dispersion."""
    if wind_file is None:
        wind_file = settings.ERA5_WIND_FILE
    if current_file is None:
        current_file = settings.MED_CURRENT_FILE

    if not wind_file.exists():
        raise FileNotFoundError(f"ERA5 wind NetCDF file not found at: {wind_file}")
    if not current_file.exists():
        raise FileNotFoundError(f"Copernicus current NetCDF file not found at: {current_file}")

    # Parse and normalize observation timestamp
    obs_time = pd.to_datetime(observation_time)
    if obs_time.tz is None:
        obs_time = obs_time.tz_localize("UTC")
    else:
        obs_time = obs_time.tz_convert("UTC")

    # Load environmental NetCDF datasets
    wind_ds = xr.open_dataset(wind_file)
    current_ds = xr.open_dataset(current_file)

    try:
        wind_time_name = find_coordinate(wind_ds, ["valid_time", "time"])
        current_time_name = find_coordinate(current_ds, ["time", "valid_time"])

        wind_lat_name = find_coordinate(wind_ds, ["latitude", "lat"])
        wind_lon_name = find_coordinate(wind_ds, ["longitude", "lon"])

        current_lat_name = find_coordinate(current_ds, ["latitude", "lat"])
        current_lon_name = find_coordinate(current_ds, ["longitude", "lon"])

        wind_ds = normalize_time_coordinate(wind_ds, wind_time_name)
        current_ds = normalize_time_coordinate(current_ds, current_time_name)

        # Spatial slice at observation point (nearest neighbor)
        wind_point = wind_ds.sel(
            {
                wind_lat_name: observation_latitude,
                wind_lon_name: observation_longitude
            },
            method="nearest"
        )

        current_point = current_ds.sel(
            {
                current_lat_name: observation_latitude,
                current_lon_name: observation_longitude
            },
            method="nearest"
        )

        def get_environment_at_time(t: pd.Timestamp) -> Tuple[float, float, float, float]:
            wind = wind_point.sel({wind_time_name: t}, method="nearest")
            current = current_point.sel({current_time_name: t}, method="nearest")

            u10 = float(np.asarray(wind["u10"]).squeeze())
            v10 = float(np.asarray(wind["v10"]).squeeze())
            uo = float(np.asarray(current["uo"]).squeeze())
            vo = float(np.asarray(current["vo"]).squeeze())
            return u10, v10, uo, vo

        # --------------------------------------------------------
        # Deterministic backward trajectory
        # --------------------------------------------------------
        det_lat = observation_latitude
        det_lon = observation_longitude
        trajectory_points: List[HindcastTrajectoryPoint] = []

        for step in range(backtrack_hours):
            current_t = obs_time - pd.Timedelta(hours=step)
            u10, v10, uo, vo = get_environment_at_time(current_t)

            drift_u = uo + windage_factor * u10
            drift_v = vo + windage_factor * v10

            det_lat -= meters_to_latitude(drift_v * 3600.0)
            det_lon -= meters_to_longitude(drift_u * 3600.0, det_lat)

            trajectory_points.append(
                HindcastTrajectoryPoint(
                    timestamp=current_t.isoformat(),
                    latitude=float(det_lat),
                    longitude=float(det_lon)
                )
            )

        # --------------------------------------------------------
        # Monte Carlo particle ensemble
        # --------------------------------------------------------
        rng = np.random.default_rng(random_seed)

        particle_lats = np.full(particle_count, observation_latitude, dtype=np.float64)
        particle_lons = np.full(particle_count, observation_longitude, dtype=np.float64)

        uncert_lat = meters_to_latitude(initial_uncertainty_km * 1000.0)
        uncert_lon = meters_to_longitude(initial_uncertainty_km * 1000.0, observation_latitude)

        particle_lats += rng.normal(0, uncert_lat, particle_count)
        particle_lons += rng.normal(0, uncert_lon, particle_count)

        for step in range(backtrack_hours):
            current_t = obs_time - pd.Timedelta(hours=step)
            u10, v10, uo, vo = get_environment_at_time(current_t)

            drift_u = uo + windage_factor * u10
            drift_v = vo + windage_factor * v10

            noise_u = rng.normal(0, abs(drift_u) * drift_noise_fraction, particle_count)
            noise_v = rng.normal(0, abs(drift_v) * drift_noise_fraction, particle_count)

            particle_lats -= meters_to_latitude((drift_v + noise_v) * 3600.0)
            particle_lons -= meters_to_longitude((drift_u + noise_u) * 3600.0, particle_lats)

        # Ensemble statistics (95% confidence intervals)
        ens_lat = float(np.mean(particle_lats))
        ens_lon = float(np.mean(particle_lons))
        lat_low, lat_high = np.percentile(particle_lats, [2.5, 97.5])
        lon_low, lon_high = np.percentile(particle_lons, [2.5, 97.5])

    finally:
        wind_ds.close()
        current_ds.close()

    return HindcastResult(
        observation=ObservationMetadata(
            timestamp=obs_time.isoformat(),
            latitude=observation_latitude,
            longitude=observation_longitude
        ),
        hindcast=HindcastMetadata(
            backtrack_hours=backtrack_hours,
            time_step_hours=time_step_hours,
            windage_factor=windage_factor,
            trajectory_points=len(trajectory_points)
        ),
        deterministic_origin=Coordinates(
            latitude=float(det_lat),
            longitude=float(det_lon)
        ),
        ensemble_origin=EnsembleOrigin(
            latitude=ens_lat,
            longitude=ens_lon,
            particle_count=particle_count,
            confidence_level=0.95
        ),
        probable_origin_region=ProbableOriginRegion(
            min_latitude=float(lat_low),
            max_latitude=float(lat_high),
            min_longitude=float(lon_low),
            max_longitude=float(lon_high)
        ),
        trajectory=trajectory_points,
        environmental_data=EnvironmentalSources()
    )

"""Application configuration and settings."""
import os
from pathlib import Path
from typing import List
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings with environment variable overrides."""
    model_config = SettingsConfigDict(
        env_prefix="SIH_",
        case_sensitive=False,
        extra="ignore"
    )

    API_V1_STR: str = "/api/v1"
    PROJECT_NAME: str = "SIH26143 Oil Spill Investigation API"
    VERSION: str = "1.0.0"
    DESCRIPTION: str = (
        "Automated SAR oil spill segmentation, Lagrangian environmental hindcasting, "
        "and AIS vessel correlation pipeline."
    )

    # Base paths
    PROJECT_ROOT: Path = Path(
        os.getenv("SIH_PROJECT_ROOT", "/Volumes/Utkash SSD/SIH26143")
    )

    # Model configuration
    MODEL_CHECKPOINT_NAME: str = "best_oil_spill_unet.pth"

    @property
    def MODEL_PATH(self) -> Path:
        return self.PROJECT_ROOT / self.MODEL_CHECKPOINT_NAME

    # Data directories and files
    @property
    def OIL_DIR(self) -> Path:
        return self.PROJECT_ROOT / "Oil"

    @property
    def ERA5_WIND_FILE(self) -> Path:
        return self.PROJECT_ROOT / "era5_wind_2019-10-18_19.nc"

    @property
    def MED_CURRENT_FILE(self) -> Path:
        # Prefer the extended Copernicus dataset if available
        extended = self.PROJECT_ROOT / "med_current_2019-10-18_16_19-10-16.nc"
        if extended.exists():
            return extended
        return self.PROJECT_ROOT / "med_current_2019-10-18_19.nc"

    # Reference JSON/GeoJSON files
    @property
    def SPILL_GEOJSON_PATH(self) -> Path:
        return self.PROJECT_ROOT / "spill_detection_result.geojson"

    @property
    def PHASE3_RESULT_PATH(self) -> Path:
        return self.PROJECT_ROOT / "phase3_hindcast_result.json"

    @property
    def PHASE4_RESULT_PATH(self) -> Path:
        return self.PROJECT_ROOT / "phase4_ais_attribution_result.json"

    @property
    def PHASE5_RESULT_PATH(self) -> Path:
        return self.PROJECT_ROOT / "phase5_unified_investigation_result.json"

    @property
    def AIS_DEFAULT_DATA_PATH(self) -> Path:
        return self.PROJECT_ROOT / "backend" / "data" / "synthetic_ais.csv"

    # Temporary directory for file uploads
    @property
    def TEMP_DIR(self) -> Path:
        temp_path = self.PROJECT_ROOT / "backend" / "temp"
        temp_path.mkdir(parents=True, exist_ok=True)
        return temp_path

    # Scientific defaults (strictly preserving tested parameters)
    PATCH_SIZE: int = 256
    STRIDE: int = 128
    SEGMENTATION_THRESHOLD: float = 0.50
    MINIMUM_COMPONENT_AREA: int = 500
    WINDAGE_FACTOR: float = 0.03
    BACKTRACK_HOURS: int = 24
    TIME_STEP_HOURS: int = 1
    PARTICLE_COUNT: int = 500
    INITIAL_UNCERTAINTY_KM: float = 1.0
    DRIFT_NOISE_FRACTION: float = 0.10

    # Configurable AIS multi-factor attribution weights
    AIS_WEIGHT_PROXIMITY: float = 0.30
    AIS_WEIGHT_TEMPORAL: float = 0.25
    AIS_WEIGHT_ALIGNMENT: float = 0.20
    AIS_WEIGHT_BEHAVIOR: float = 0.15
    AIS_WEIGHT_ANOMALY_GAP: float = 0.10
    AIS_MAX_CANDIDATE_DISTANCE_KM: float = 50.0
    AIS_TIME_WINDOW_HOURS: float = 12.0

    # Backward compatibility aliases
    AIS_WEIGHT_DISTANCE: float = 0.30
    AIS_WEIGHT_PERSISTENCE: float = 0.15
    AIS_WEIGHT_APPROACH: float = 0.20

    # CORS configuration
    CORS_ORIGINS: List[str] = [
        "http://localhost:3000",
        "http://localhost:5173",
        "http://127.0.0.1:3000",
        "http://127.0.0.1:5173",
        "*"
    ]


settings = Settings()

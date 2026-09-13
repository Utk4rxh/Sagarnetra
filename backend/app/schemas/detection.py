"""Spill detection and geometry schemas."""
from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field


class Coordinates(BaseModel):
    latitude: float = Field(..., description="Latitude in decimal degrees (WGS84)")
    longitude: float = Field(..., description="Longitude in decimal degrees (WGS84)")


class PixelBoundingBox(BaseModel):
    x: int = Field(..., description="Top-left X pixel coordinate")
    y: int = Field(..., description="Top-left Y pixel coordinate")
    width: int = Field(..., description="Bounding box width in pixels")
    height: int = Field(..., description="Bounding box height in pixels")


class GeographicBounds(BaseModel):
    west: float
    south: float
    east: float
    north: float


class GeoJSONGeometry(BaseModel):
    type: str = "Polygon"
    coordinates: List[List[List[float]]]


class GeoJSONFeature(BaseModel):
    type: str = "Feature"
    properties: Dict[str, Any]
    geometry: GeoJSONGeometry


class SpillDetectionResult(BaseModel):
    spill_detected: bool = Field(..., description="True if a valid oil spill was detected")
    centroid: Optional[Coordinates] = Field(None, description="Geographic centroid of primary spill")
    area_pixels: Optional[int] = Field(None, description="Spill footprint area in pixels")
    area_km2: Optional[float] = Field(None, description="Spill footprint area in square kilometers")
    perimeter_pixels: Optional[float] = Field(None, description="Spill perimeter in pixels")
    aspect_ratio: Optional[float] = Field(None, description="Spill bounding box aspect ratio")
    bounding_box_pixels: Optional[PixelBoundingBox] = Field(None, description="Pixel bounding box")
    geographic_bounds: Optional[GeographicBounds] = Field(None, description="Geographic bounding box")
    probability_threshold: float = Field(0.50, description="Sigmoid threshold used for detection")
    geojson: Optional[GeoJSONFeature] = Field(None, description="Standard GeoJSON Polygon Feature")

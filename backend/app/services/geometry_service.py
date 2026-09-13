"""Spill geometry extraction, connected components, and geographic projection."""
import logging
from typing import Optional, Dict, Any, List, Tuple
import cv2
import numpy as np
import rasterio
from rasterio.transform import xy
from shapely.geometry import Polygon
import geopandas as gpd

from ..core.config import settings
from ..schemas.detection import (
    Coordinates,
    PixelBoundingBox,
    GeographicBounds,
    GeoJSONGeometry,
    GeoJSONFeature,
    SpillDetectionResult
)

logger = logging.getLogger("sih.geometry")


def extract_spill_geometry(
    prediction_mask: np.ndarray,
    transform: rasterio.Affine,
    image_name: str = "sar_image.tif",
    min_area: int = settings.MINIMUM_COMPONENT_AREA,
    threshold: float = settings.SEGMENTATION_THRESHOLD
) -> SpillDetectionResult:
    """Analyze connected components in segmentation mask, extract primary spill, and convert to geographic coordinates."""
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(
        prediction_mask.astype(np.uint8),
        connectivity=8
    )

    valid_components = []
    for i in range(1, num_labels):
        area = stats[i, cv2.CC_STAT_AREA]
        if area >= min_area:
            valid_components.append(i)

    if not valid_components:
        logger.info(f"No spill component >= {min_area} pixels detected.")
        return SpillDetectionResult(
            spill_detected=False,
            probability_threshold=threshold
        )

    # Select largest valid component
    primary_component = max(
        valid_components,
        key=lambda cid: stats[cid, cv2.CC_STAT_AREA]
    )

    primary_area = int(stats[primary_component, cv2.CC_STAT_AREA])
    x = int(stats[primary_component, cv2.CC_STAT_LEFT])
    y = int(stats[primary_component, cv2.CC_STAT_TOP])
    w = int(stats[primary_component, cv2.CC_STAT_WIDTH])
    h = int(stats[primary_component, cv2.CC_STAT_HEIGHT])
    centroid_x = float(centroids[primary_component][0])
    centroid_y = float(centroids[primary_component][1])

    # Convert centroid to geographic coordinates
    geo_lon, geo_lat = xy(
        transform,
        centroid_y,
        centroid_x,
        offset="center"
    )
    spill_longitude = float(geo_lon)
    spill_latitude = float(geo_lat)

    # Convert bounding box to geographic bounds
    left, top = xy(transform, y, x, offset="center")
    right, bottom = xy(transform, y + h - 1, x + w - 1, offset="center")
    geo_west = float(min(left, right))
    geo_east = float(max(left, right))
    geo_south = float(min(top, bottom))
    geo_north = float(max(top, bottom))

    # Contour and Polygon generation
    primary_mask = (labels == primary_component).astype(np.uint8)
    contours, _ = cv2.findContours(
        primary_mask,
        cv2.RETR_EXTERNAL,
        cv2.CHAIN_APPROX_SIMPLE
    )

    perimeter_pixels: Optional[float] = None
    aspect_ratio: Optional[float] = float(w / h) if h > 0 else 0.0
    spill_area_km2: Optional[float] = None
    geojson_feature: Optional[GeoJSONFeature] = None

    if contours:
        contour = max(contours, key=cv2.contourArea)
        perimeter_pixels = float(cv2.arcLength(contour, True))

        polygon_contour = contour.reshape(-1, 2)
        geographic_polygon: List[List[float]] = []

        for px, py in polygon_contour:
            lon, lat = xy(transform, int(py), int(px), offset="center")
            geographic_polygon.append([float(lon), float(lat)])

        if geographic_polygon:
            # Ensure polygon is closed
            if geographic_polygon[0] != geographic_polygon[-1]:
                geographic_polygon.append(geographic_polygon[0])

            try:
                poly = Polygon(geographic_polygon)
                if not poly.is_valid:
                    poly = poly.buffer(0)

                gdf = gpd.GeoDataFrame({"geometry": [poly]}, crs="EPSG:4326")
                projected = gdf.to_crs(gdf.estimate_utm_crs())
                spill_area_km2 = float(projected.geometry.iloc[0].area / 1_000_000.0)
            except Exception as e:
                logger.warning(f"Projected area calculation error: {e}. Using degree approximation.")
                km_per_deg_lat = 111.32
                km_per_deg_lon = 111.32 * np.cos(np.radians(spill_latitude))
                px_w_km = abs(transform.a) * km_per_deg_lon
                px_h_km = abs(transform.e) * km_per_deg_lat
                spill_area_km2 = float(primary_area * px_w_km * px_h_km)

            geojson_feature = GeoJSONFeature(
                type="Feature",
                properties={
                    "image": image_name,
                    "latitude": spill_latitude,
                    "longitude": spill_longitude,
                    "area_km2": spill_area_km2,
                    "area_pixels": primary_area,
                    "perimeter_pixels": perimeter_pixels,
                    "aspect_ratio": aspect_ratio,
                    "prediction_threshold": threshold
                },
                geometry=GeoJSONGeometry(
                    type="Polygon",
                    coordinates=[geographic_polygon]
                )
            )

    return SpillDetectionResult(
        spill_detected=True,
        centroid=Coordinates(
            latitude=spill_latitude,
            longitude=spill_longitude
        ),
        area_pixels=primary_area,
        area_km2=spill_area_km2,
        perimeter_pixels=perimeter_pixels,
        aspect_ratio=aspect_ratio,
        bounding_box_pixels=PixelBoundingBox(
            x=x,
            y=y,
            width=w,
            height=h
        ),
        geographic_bounds=GeographicBounds(
            west=geo_west,
            south=geo_south,
            east=geo_east,
            north=geo_north
        ),
        probability_threshold=threshold,
        geojson=geojson_feature
    )

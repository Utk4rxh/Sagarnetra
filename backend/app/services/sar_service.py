"""SAR image loading, preprocessing, and U-Net patch inference."""
import logging
from pathlib import Path
from typing import Tuple, Dict, Any, Optional
import numpy as np
import rasterio
import torch
import torch.nn as nn

from ..core.config import settings
from ..models.unet import ModelManager

logger = logging.getLogger("sih.sar")


def load_sar_geotiff(image_path: Path) -> Tuple[np.ndarray, rasterio.Affine, rasterio.crs.CRS, Dict[str, Any]]:
    """Load 2-band SAR GeoTIFF and return raw array, affine transform, CRS, and metadata."""
    if not image_path.exists():
        raise FileNotFoundError(f"SAR GeoTIFF not found at: {image_path}")

    with rasterio.open(image_path) as src:
        image = src.read()  # Shape: (bands, height, width)
        transform = src.transform
        crs = src.crs
        bounds = src.bounds
        meta = {
            "driver": src.driver,
            "count": src.count,
            "height": src.height,
            "width": src.width,
            "crs": str(src.crs),
            "bounds": {
                "left": bounds.left,
                "bottom": bounds.bottom,
                "right": bounds.right,
                "top": bounds.top
            }
        }

    if image.shape[0] < 2:
        raise ValueError(
            f"Expected at least 2 bands (VV, VH) for SAR image, found {image.shape[0]} bands."
        )

    # Use first two channels (VV, VH)
    if image.shape[0] > 2:
        image = image[:2]

    return image, transform, crs, meta


def preprocess_sar_image(image: np.ndarray) -> np.ndarray:
    """Exact Phase 2 preprocessing: whole image -> 1st/99th percentile clipping -> [0, 1] normalization."""
    image = image.copy().astype(np.float32)

    for band in range(image.shape[0]):
        # Replace non-finite values before percentile calculation
        image[band] = np.nan_to_num(image[band], nan=0.0, posinf=0.0, neginf=0.0)

        low = np.percentile(image[band], 1)
        high = np.percentile(image[band], 99)

        denom = high - low
        if denom < 1e-6:
            denom = 1e-6

        image[band] = np.clip(
            (image[band] - low) / denom,
            0.0,
            1.0
        )

    return image


def predict_full_image(
    model: nn.Module,
    image: np.ndarray,
    patch_size: int = settings.PATCH_SIZE,
    stride: int = settings.STRIDE,
    threshold: float = settings.SEGMENTATION_THRESHOLD,
    device: Optional[torch.device] = None
) -> Tuple[np.ndarray, np.ndarray]:
    """Exact Phase 2 overlapping patch inference with sigmoid averaging and thresholding."""
    if device is None:
        device = ModelManager.get_device()

    channels, height, width = image.shape

    probability_sum = np.zeros((height, width), dtype=np.float32)
    prediction_count = np.zeros((height, width), dtype=np.float32)

    model.eval()

    with torch.no_grad():
        for y in range(0, height - patch_size + 1, stride):
            for x in range(0, width - patch_size + 1, stride):
                patch = image[:, y:y + patch_size, x:x + patch_size]
                tensor = torch.from_numpy(patch).float().unsqueeze(0).to(device)

                logits = model(tensor)
                probabilities = torch.sigmoid(logits)
                prob_array = probabilities[0, 0].cpu().numpy()

                probability_sum[y:y + patch_size, x:x + patch_size] += prob_array
                prediction_count[y:y + patch_size, x:x + patch_size] += 1.0

    probability_map = probability_sum / np.maximum(prediction_count, 1.0)
    prediction_mask = (probability_map >= threshold).astype(np.uint8)

    return probability_map, prediction_mask


def run_sar_segmentation(
    image_path: Path,
    patch_size: int = settings.PATCH_SIZE,
    stride: int = settings.STRIDE,
    threshold: float = settings.SEGMENTATION_THRESHOLD
) -> Tuple[np.ndarray, np.ndarray, rasterio.Affine, rasterio.crs.CRS, Dict[str, Any]]:
    """Convenience pipeline: load -> preprocess -> predict."""
    raw_sar, transform, crs, meta = load_sar_geotiff(image_path)
    processed_sar = preprocess_sar_image(raw_sar)
    model = ModelManager.get_model()
    device = ModelManager.get_device()

    prob_map, mask = predict_full_image(
        model=model,
        image=processed_sar,
        patch_size=patch_size,
        stride=stride,
        threshold=threshold,
        device=device
    )

    return prob_map, mask, transform, crs, meta

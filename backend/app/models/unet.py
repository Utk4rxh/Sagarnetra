"""Exact Phase 1 U-Net architecture and model loading."""
import logging
from pathlib import Path
from typing import Optional
import torch
import torch.nn as nn

logger = logging.getLogger("sih.model")


def get_device() -> torch.device:
    """Select preferred device (MPS -> CUDA -> CPU)."""
    if torch.backends.mps.is_available():
        try:
            # Test small allocation to ensure MPS is healthy
            _ = torch.zeros(1, device="mps")
            return torch.device("mps")
        except Exception as e:
            logger.warning(f"MPS available but failed initialization: {e}. Falling back to CPU.")
    if torch.cuda.is_available():
        return torch.device("cuda")
    return torch.device("cpu")


class DoubleConv(nn.Module):
    """Standard double convolution block used in Phase 1 U-Net."""

    def __init__(self, in_channels: int, out_channels: int):
        super().__init__()
        self.block = nn.Sequential(
            nn.Conv2d(
                in_channels,
                out_channels,
                kernel_size=3,
                padding=1,
                bias=False
            ),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True),
            nn.Conv2d(
                out_channels,
                out_channels,
                kernel_size=3,
                padding=1,
                bias=False
            ),
            nn.BatchNorm2d(out_channels),
            nn.ReLU(inplace=True)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.block(x)


class UNet(nn.Module):
    """Exact 2-channel U-Net segmentation architecture matching best_oil_spill_unet.pth."""

    def __init__(self, in_channels: int = 2, out_channels: int = 1):
        super().__init__()

        # Encoder
        self.enc1 = DoubleConv(in_channels, 32)
        self.enc2 = DoubleConv(32, 64)
        self.enc3 = DoubleConv(64, 128)

        self.pool = nn.MaxPool2d(2)

        # Bottleneck
        self.bottleneck = DoubleConv(128, 256)

        # Decoder
        self.up3 = nn.ConvTranspose2d(256, 128, 2, stride=2)
        self.dec3 = DoubleConv(256, 128)

        self.up2 = nn.ConvTranspose2d(128, 64, 2, stride=2)
        self.dec2 = DoubleConv(128, 64)

        self.up1 = nn.ConvTranspose2d(64, 32, 2, stride=2)
        self.dec1 = DoubleConv(64, 32)

        # Output projection
        self.output = nn.Conv2d(32, out_channels, kernel_size=1)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        e1 = self.enc1(x)
        e2 = self.enc2(self.pool(e1))
        e3 = self.enc3(self.pool(e2))

        b = self.bottleneck(self.pool(e3))

        d3 = self.up3(b)
        d3 = torch.cat([d3, e3], dim=1)
        d3 = self.dec3(d3)

        d2 = self.up2(d3)
        d2 = torch.cat([d2, e2], dim=1)
        d2 = self.dec2(d2)

        d1 = self.up1(d2)
        d1 = torch.cat([d1, e1], dim=1)
        d1 = self.dec1(d1)

        return self.output(d1)


def load_model(checkpoint_path: Path, device: Optional[torch.device] = None) -> UNet:
    """Load model architecture and weights from checkpoint file."""
    if device is None:
        device = get_device()

    if not checkpoint_path.exists():
        raise FileNotFoundError(f"Model checkpoint not found at: {checkpoint_path}")

    model = UNet(in_channels=2, out_channels=1).to(device)

    checkpoint = torch.load(checkpoint_path, map_location=device)
    if isinstance(checkpoint, dict) and "model_state_dict" in checkpoint:
        state_dict = checkpoint["model_state_dict"]
    else:
        state_dict = checkpoint

    model.load_state_dict(state_dict)
    model.eval()

    # Freeze parameters for inference
    for param in model.parameters():
        param.requires_grad = False

    logger.info(f"Loaded U-Net model from {checkpoint_path} onto {device}")
    return model


class ModelManager:
    """Singleton container for loaded model and device during FastAPI lifecycle."""
    _model: Optional[UNet] = None
    _device: Optional[torch.device] = None

    @classmethod
    def initialize(cls, checkpoint_path: Path):
        cls._device = get_device()
        cls._model = load_model(checkpoint_path, cls._device)

    @classmethod
    def get_model(cls) -> UNet:
        if cls._model is None:
            from ..core.config import settings
            logger.info("Model requested before lifespan init. Lazily initializing...")
            cls.initialize(settings.MODEL_PATH)
        return cls._model

    @classmethod
    def get_device(cls) -> torch.device:
        if cls._device is None:
            cls._device = get_device()
        return cls._device

    @classmethod
    def is_loaded(cls) -> bool:
        return cls._model is not None

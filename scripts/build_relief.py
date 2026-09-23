"""Build EarthView's compact land and seafloor slope texture from GEBCO."""

from pathlib import Path

import numpy as np
import rasterio
from PIL import Image
from rasterio.enums import Resampling
from scipy.ndimage import gaussian_filter


SOURCE = "/vsicurl/https://data.source.coop/ausantarctic/gebco/GEBCO_2025.tif"
OUTPUT = Path(__file__).resolve().parents[1] / "frontend/public/data/gebco/relief-2048.png"
WIDTH = 2048
HEIGHT = 1024
METERS_PER_DEGREE = 111_195


def slopes(elevation: np.ndarray, sigma: float) -> tuple[np.ndarray, np.ndarray]:
    smoothed = gaussian_filter(elevation, sigma=(sigma, 0), mode="reflect")
    smoothed = gaussian_filter(smoothed, sigma=(0, sigma), mode="wrap")
    latitude = np.deg2rad(90 - (np.arange(HEIGHT) + 0.5) * 180 / HEIGHT)
    east_step = (360 / WIDTH) * METERS_PER_DEGREE * np.maximum(np.cos(latitude), 0.12)
    north_step = (180 / HEIGHT) * METERS_PER_DEGREE
    east = (np.roll(smoothed, -1, axis=1) - np.roll(smoothed, 1, axis=1)) / (2 * east_step[:, None])
    north = (np.roll(smoothed, 1, axis=0) - np.roll(smoothed, -1, axis=0)) / (2 * north_step)
    north[0] = north[1]
    north[-1] = north[-2]
    return east, north


def encode(slope: np.ndarray) -> np.ndarray:
    return np.rint(127.5 + 127.5 * np.tanh(slope * 80)).astype(np.uint8)


def main() -> None:
    with rasterio.Env(GDAL_DISABLE_READDIR_ON_OPEN="EMPTY_DIR", CPL_VSIL_CURL_ALLOWED_EXTENSIONS=".tif"):
        with rasterio.open(SOURCE) as source:
            elevation = source.read(1, out_shape=(HEIGHT, WIDTH), resampling=Resampling.bilinear).astype(np.float32)
            if np.any(elevation == source.nodata):
                raise ValueError("GEBCO overview contains missing elevation cells")

    land = slopes(np.maximum(elevation, 0), sigma=1.4)
    ocean = slopes(np.minimum(elevation, 0), sigma=2.4)
    channels = np.stack([encode(land[0]), encode(land[1]), encode(ocean[0]), encode(ocean[1])], axis=-1)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(channels, "RGBA").save(OUTPUT, optimize=True)
    print(f"Saved {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

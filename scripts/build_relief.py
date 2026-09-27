"""Build the bundled 4K KTX2 slope texture from GEBCO_2026 elevation data."""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path
from urllib.parse import quote
from urllib.request import urlopen

import numpy as np
from PIL import Image
from scipy.ndimage import gaussian_filter


SOURCE = (
    "https://dap.ceda.ac.uk/thredds/dodsC/bodc/gebco/global/gebco_2026/"
    "ice_surface_elevation/netcdf/GEBCO_2026.nc.ascii"
)
OUTPUT = Path(__file__).resolve().parents[1] / "frontend/public/data/gebco/relief-4096.ktx2"
WIDTH = 4096
HEIGHT = 2048
SOURCE_STRIDE = 21
SOURCE_ROWS = 2058
SOURCE_COLUMNS = 4115
METERS_PER_DEGREE = 111_195


def read_global_elevation() -> np.ndarray:
    # GEBCO is 86400x43200 at 15 arc-seconds. The OPeNDAP stride limits the
    # transfer to about 8.5 million globally distributed samples.
    constraint = f"elevation[0:{SOURCE_STRIDE}:43197][0:{SOURCE_STRIDE}:86394]"
    url = f"{SOURCE}?{quote(constraint, safe='[]:,')}"
    elevation = np.empty((SOURCE_ROWS, SOURCE_COLUMNS), dtype=np.float32)
    row = 0
    reading_values = False

    with urlopen(url, timeout=180) as response:
        for raw_line in response:
            line = raw_line.decode("ascii").strip()
            if line == f"elevation.elevation[{SOURCE_ROWS}][{SOURCE_COLUMNS}]":
                reading_values = True
                continue
            if not reading_values:
                continue
            if line.startswith("elevation.lat["):
                break
            if not line.startswith(f"[{row}],"):
                continue

            values = np.fromstring(line.split(",", 1)[1], sep=",", dtype=np.int16)
            if values.size != SOURCE_COLUMNS:
                raise ValueError(f"GEBCO row {row} has {values.size} columns")
            elevation[row] = values
            row += 1

    if row != SOURCE_ROWS:
        raise ValueError(f"Expected {SOURCE_ROWS} GEBCO rows, received {row}")

    # The service returns rows south-to-north; image V=1 must be the north pole.
    resized = Image.fromarray(np.flipud(elevation), mode="F").resize(
        (WIDTH, HEIGHT), Image.Resampling.BICUBIC,
    )
    return np.asarray(resized, dtype=np.float32)


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
    elevation = read_global_elevation()
    land = slopes(np.maximum(elevation, 0), sigma=2.0)
    ocean = slopes(np.minimum(elevation, 0), sigma=2.0)
    channels = np.stack(
        [encode(land[0]), encode(land[1]), encode(ocean[0]), encode(ocean[1])],
        axis=-1,
    )
    ktx = os.environ.get("KTX_CLI", "ktx")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="earthview-relief-") as temp_dir:
        source = Path(temp_dir) / "relief.png"
        Image.fromarray(channels, "RGBA").save(source, optimize=True)
        subprocess.run([
            ktx,
            "create",
            "--format", "R8G8B8A8_UNORM",
            "--input-swizzle", "rgba",
            # Three's compressed KTX2 texture path does not apply the
            # KTXorientation metadata. Store the first texel at GL's bottom-left
            # origin so shader UVs (v=0 at the South Pole) sample geographic
            # latitude correctly.
            "--assign-texcoord-origin", "top-left",
            "--convert-texcoord-origin", "bottom-left",
            "--assign-tf", "linear",
            "--encode", "uastc",
            "--uastc-quality", "4",
            "--uastc-rdo",
            "--uastc-rdo-l", "0.5",
            "--generate-mipmap",
            "--zstd", "14",
            str(source),
            str(OUTPUT),
        ], check=True)

    print(f"Saved {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

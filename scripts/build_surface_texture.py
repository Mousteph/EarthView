"""Build the local Natural Earth 1:10m Surface-view KTX2 texture."""

from __future__ import annotations

import os
import subprocess
import tempfile
from pathlib import Path

import numpy as np
import rasterio
from rasterio.enums import Resampling


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/source-assets/natural-earth/HYP_HR.zip"
OUTPUT = ROOT / "frontend/public/data/earth-views/surface/cross-blended-hypso.ktx2"
SOURCE_MEMBER = "HYP_HR/HYP_HR.tif"
WIDTH = 4096
HEIGHT = 2048


def main() -> None:
    if not SOURCE.is_file():
        raise FileNotFoundError(
            f"Place Natural Earth's 1:10m Cross-Blended HYP_HR.zip at {SOURCE}"
        )

    source_uri = f"/vsizip/{SOURCE.as_posix()}/{SOURCE_MEMBER}"
    with rasterio.open(source_uri) as dataset:
        if (dataset.width, dataset.height) != (21_600, 10_800) or dataset.count < 3:
            raise ValueError("Expected the 21,600x10,800 RGB Natural Earth 1:10m raster")
        rgb = dataset.read(
            indexes=(1, 2, 3),
            out_shape=(3, HEIGHT, WIDTH),
            resampling=Resampling.average,
        )

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    ktx = os.environ.get("KTX_CLI", "ktx")
    with tempfile.TemporaryDirectory(prefix="earthview-surface-") as temporary_directory:
        source_png = Path(temporary_directory) / "surface.png"
        with rasterio.open(
            source_png,
            "w",
            driver="PNG",
            width=WIDTH,
            height=HEIGHT,
            count=4,
            dtype="uint8",
        ) as image:
            image.write(rgb.astype(np.uint8), indexes=(1, 2, 3))
            image.write(np.full((HEIGHT, WIDTH), 255, dtype=np.uint8), 4)

        subprocess.run(
            [
                ktx,
                "create",
                "--format", "R8G8B8A8_SRGB",
                "--input-swizzle", "rgba",
                "--assign-texcoord-origin", "top-left",
                "--convert-texcoord-origin", "bottom-left",
                "--encode", "uastc",
                "--uastc-quality", "4",
                "--uastc-rdo",
                "--uastc-rdo-l", "0.5",
                "--generate-mipmap",
                "--zstd", "14",
                str(source_png),
                str(OUTPUT),
            ],
            check=True,
        )

    print(f"Saved {OUTPUT} ({OUTPUT.stat().st_size:,} bytes)")


if __name__ == "__main__":
    main()

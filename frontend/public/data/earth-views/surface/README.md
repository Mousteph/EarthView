# Surface land texture

## Source

- **Product:** Natural Earth 1:10m Cross-Blended Hypsometric Tints, large raster, version 3.2.0.
- **Catalog:** <https://www.naturalearthdata.com/downloads/10m-raster-data/10m-cross-blend-hypso/>.
- **Original asset:** `HYP_HR.zip`, kept outside Git at `data/source-assets/natural-earth/HYP_HR.zip`.
- **Selection:** No-relief variant. It contains no baked hillshade, so GEBCO remains the globe's only relief treatment.
- **Rights:** Natural Earth raster data is public domain. Optional credit is “Made with Natural Earth.”

## Processing

Run `python scripts/build_surface_texture.py` with Python `numpy` and `rasterio`, plus Khronos KTX Software `ktx` (`KTX_CLI` can point to a non-default binary). The script reads the TIFF from the ignored source archive, resamples it to 4,096 × 2,048, and writes a mipmapped UASTC KTX2 texture.

- **Web asset:** `cross-blended-hypso.ktx2`, 2,935,646 bytes.
- **Estimated GPU storage:** about 5.3 MiB with a 4-bits-per-pixel GPU format and mipmaps; some fallback formats may use about 10.7 MiB. These are estimates, not measured device counters.

## Comparison outcome

Cross-Blended Hypsometric Tints was selected over Natural Earth I at the same output size and globe lighting. It makes vegetated lowlands, arid regions, ice, and elevation zones more readable while keeping the restrained palette. The separate GEBCO relief texture provides slope shading.

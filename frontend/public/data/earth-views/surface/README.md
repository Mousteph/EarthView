# Surface land texture

## Source

- **Product:** Natural Earth 1:10m Cross-Blended Hypsometric Tints, large raster, version 3.2.0.
- **Catalog:** <https://www.naturalearthdata.com/downloads/10m-raster-data/10m-cross-blend-hypso/>.
- **Original asset:** `HYP_HR.zip`, kept outside Git at `data/source-assets/natural-earth/HYP_HR.zip`.
- **Raster:** 21,600 × 10,800 RGB, WGS 84 / EPSG:4326.
- **Selection:** The no-relief variant (“Land coloring based on elevation. Add your own relief shading.”). It contains no baked hillshade, so the globe's GEBCO lighting stays the only relief treatment.
- **Rights:** Natural Earth raster data is public domain. No attribution is required; optional credit is “Made with Natural Earth.” See <https://www.naturalearthdata.com/about/terms-of-use/>.

## Processing

Run `python scripts/build_surface_texture.py` with Python `numpy` and `rasterio`, plus Khronos KTX Software `ktx` (`KTX_CLI` can point to a non-default binary). The script reads the TIFF directly from the ignored source archive, area-averages the equirectangular raster to 4,096 × 2,048 RGBA, flips the vertical texture origin for the globe's latitude UVs, and writes this sRGB UASTC KTX2 with Zstd supercompression and all 13 mip levels.

- **Web asset:** `cross-blended-hypso.ktx2`, 2,935,646 bytes.
- **Estimated GPU storage:** about 5.3 MiB when UASTC is transcoded to a 4-bits-per-pixel GPU format, including mipmaps; some fallback formats may use about 10.7 MiB. These are format-based estimates, not measured device counters.

## Comparison outcome

Cross-Blended Hypsometric Tints was selected over Natural Earth I after comparing both at the same 4,096 × 2,048 output size on the same globe with matching lighting, GEBCO relief, vectors, viewport, orientation, and default layer layout. Cross-Blended made vegetated lowlands, arid regions, ice, and elevation zones more readable at global scale while keeping the understated EarthView palette. Natural Earth I read closer to a near-white base at this scale and added less regional color separation. Both used the same shader, geometry, mipmap count, and GPU texture size; the encoded comparison files were 2.8 MiB (Cross-Blended) and 3.1 MiB (Natural Earth I).

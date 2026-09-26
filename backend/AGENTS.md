# Backend Guidance

## Architecture

- Keep FastAPI routes in `app/main.py` thin: call a long-lived data-layer instance and map expected configuration or upstream failures to HTTP responses.
- Put each data source in its own package under `app/data_layer/`. Keep normalized Pydantic models in `models.py` and fetching/coordination in a clearly named `*_data_layer.py` module.
- Keep external payload formats inside the data layer. Normalize records into internal models before returning them from a route.
- Split more complex sources into focused modules only when each has a clear job, as with satellites' `source.py`, `normalizer.py`, and `caches.py`. Keep the data-layer class as their coordinator.
- Construct each active data layer once at application startup. Read required configuration and derive provider URLs during initialization so configuration errors surface at startup.

## Coding Patterns

- Prefer small, explicit classes and methods with names that describe the operation. Use names such as `SatelliteDataLayer`, `CelesTrakClient`, and `normalize_omm`.
- Keep mutable cache, lock, and retry state on the long-lived instance that owns it; avoid adding module-level mutable state or compatibility wrappers around old functions.
- Keep abstractions proportional to the source. Do not introduce a shared framework or extra class for a single simple operation.
- Use Pydantic models for normalized data and explicit `typing` collection annotations such as `List`, `Dict`, `Set`, and `Tuple`.
- Keep configuration, URL construction, provider access, normalization, and route error mapping in their respective layers.

## Adding a Data Layer

1. Add a package under `app/data_layer/<source>/` with `models.py` and a named data-layer module.
2. Normalize the provider response into the package's domain model before returning it; reject invalid feed structure and skip invalid individual records where appropriate.
3. Export the model and data-layer class from the package `__init__.py`, then construct one layer instance in `app/main.py` and add a thin route with explicit error mapping.
4. Update the existing `unittest` coverage for normalization, provider failures, and the endpoint contract when behavior changes. Run tests or add new test cases when the task requests it.

## Project Constraints

- Keep data ingestion independent from visualization code and external API formats.
- The `satellites.py` module is retained temporarily; use the `app.data_layer.satellites` package as the active implementation.
- Put globe appearance, interaction, and Natural Earth source-policy guidance in the root `DESIGN.md`, not here.

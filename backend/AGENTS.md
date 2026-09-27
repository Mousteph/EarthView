# Backend agent guide

Use this guide for FastAPI routes, provider clients, normalized models, and backend caching. The root [AGENTS.md](../AGENTS.md) defines repository-wide boundaries; [README.md](../README.md) has setup commands and data-source details.

## Ownership

- `app/main.py` declares routes, calls long-lived data-layer instances, and maps expected failures to HTTP responses.
- `app/data_layer/<source>/` owns each provider integration. Keep external payload parsing and normalization within that source package.
- `models.py` defines normalized Pydantic response models. Return those models from routes rather than provider records.
- A source data-layer class coordinates its focused clients, normalizers, and caches. Keep mutable cache, lock, and retry state on the owning instance.
- `app/data_layer/satellites.py` is a legacy module; the active implementation is `app/data_layer/satellites/`.

## Add or change a source

1. **Inspect the route, data layer, and tests** for the nearest existing source. Confirm the current API shape and failure behavior. Completion: the target contract and owning package are clear.
2. **Implement at the source boundary.** Keep configuration, URL construction, provider access, normalization, and route error mapping in their respective layers. Reject malformed feed structure; skip invalid individual records only when the source contract allows it. Completion: routes receive normalized models and provider details remain encapsulated.
3. **Wire explicitly.** Export the source model and data-layer class from its package, construct one layer instance for the app, and add a thin route with deliberate status and cache headers. Completion: the endpoint follows neighboring route conventions and preserves unrelated response contracts.
4. **Verify behavior.** Update focused `unittest` coverage when behavior or an endpoint contract changes, then run the backend suite when requested. Completion: relevant tests pass, or unrun checks and their reason are stated.

## Data and configuration rules

- Construct each active layer once at application startup. Read required configuration and derive provider URLs during initialization so configuration errors are visible at startup.
- Use explicit typed collections and small methods with names that describe the operation. Add abstractions only when more than one real operation needs them.
- Keep ingestion independent from frontend visualization and avoid module-level mutable runtime state.
- Preserve endpoint paths and normalized response shapes unless the task explicitly scopes a compatible API change.
- Keep secrets in the ignored local `config.yaml`; use `config.example.yaml` as the template. Do not log or expose keys.
- Source freshness and cache policies are documented in the README; inspect the implementation before changing or restating their values.

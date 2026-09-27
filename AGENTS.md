# EarthView agent guide

EarthView is a Next.js and Three.js globe with a FastAPI data service. The implemented live layers are earthquakes, active fires, and orbital objects (active satellites, debris, and rocket bodies); the globe also uses bundled geography and relief assets.

## Change workflow

1. **Locate ownership.** Inspect the code and nearest existing pattern before editing. For frontend changes, follow [frontend/AGENTS.md](frontend/AGENTS.md); for API or provider changes, follow [backend/AGENTS.md](backend/AGENTS.md). Completion: every changed concern has an identified owning module.
2. **Preserve contracts.** Keep provider formats in backend data layers, normalize before returning API data, validate feed data in its frontend feature, and pass typed props to renderers. Preserve endpoint paths and response shapes unless the task explicitly includes an API change. Completion: each modified boundary has a compatible, typed contract or a documented scoped change.
3. **Protect rendering and product behavior.** Before changing globe appearance, layout, interaction, or geography, read [DESIGN.md](DESIGN.md). Keep static event points batched and preserve satellite worker messaging and scheduling. Completion: the change follows the applicable design and rendering rules.
4. **Verify the requested scope.** Use commands in the relevant guide and report which checks ran and their results. Do not claim browser, GPU, or performance verification from a build or typecheck. Completion: each requested verification is either evidenced or explicitly reported as not run.

## Stable boundaries

- `frontend/features/` owns feature models, feed hooks, map state, filters, selection, and feature UI.
- `frontend/globe/` owns scene composition and Three.js rendering. `frontend/shared/` is for genuinely shared utilities and UI.
- `backend/app/main.py` owns route and HTTP error mapping; `backend/app/data_layer/` owns provider access, normalization, validation, and caches.
- Earthquake and fire feeds share the small array-feed loader. Orbital modes keep their separate refresh, cache, filtering, and worker-backed rendering behavior.
- Selection is valid only while its item exists, its layer or mode is enabled, and it passes the active filter.
- `config.yaml` is local and ignored. Use `config.example.yaml` as its template; never expose credentials in code, logs, or documentation.

## Project references

- [README.md](README.md): setup, commands, implemented feeds, and source attribution.
- [DESIGN.md](DESIGN.md): visual and globe geometry constraints; read before visual or rendering changes.
- [frontend/AGENTS.md](frontend/AGENTS.md): frontend ownership and implementation sequence.
- [backend/AGENTS.md](backend/AGENTS.md): backend ownership and data-layer implementation sequence.

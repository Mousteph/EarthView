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

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).

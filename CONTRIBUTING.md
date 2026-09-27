# Contributing to EarthView

Thanks for helping improve EarthView. This guide covers local setup, changes, and pull requests. The project is licensed under MIT; bundled third-party data and dependencies retain their own terms. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Set up the project

Use Node.js 22 and Python 3.14. Follow the local setup instructions in [README.md](README.md#run-locally). A NASA FIRMS key is optional for development; use the placeholder from `config.example.yaml` for other feeds and never commit a real key.

## Make a change

- Search for the nearest existing feature and follow the ownership guidance in [AGENTS.md](AGENTS.md), [frontend/AGENTS.md](frontend/AGENTS.md), or [backend/AGENTS.md](backend/AGENTS.md).
- Keep provider payloads behind backend normalization and frontend feature validation. Preserve API shapes unless the change explicitly updates the contract.
- For globe, interaction, or visual changes, follow [DESIGN.md](DESIGN.md) and include browser verification details in the pull request.
- Keep changes focused. Do not add unrelated generated data, credentials, or bundled assets without documenting their source and license.

## Verify before opening a pull request

Run applicable checks and include their results:

- Frontend, from `frontend/`: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run build`, and `node --test tests/*.test.mjs`.
- Backend, from `backend/` with its virtual environment active: `python -m unittest discover -s tests`.
- For API and Compose changes, include a local Compose startup/API smoke check when practical.

Pull requests should explain the user-facing change, relevant API or data-contract effects, tests and manual checks, and any follow-up work. Link related issues and include screenshots for visual changes.

## Community expectations

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report security vulnerabilities using the private process in [SECURITY.md](SECURITY.md), not a public issue.

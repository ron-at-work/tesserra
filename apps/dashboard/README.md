# Dashboard application boundary

`apps/dashboard` is the separately built local operations dashboard. It consumes the typed local API boundary only and may not import service, storage, local crypto, host, server, or adapter internals. It shows truthful loading, empty, error, offline, stale, and invalid-evidence states.

Run it from the workspace root with `pnpm dev:dashboard`. Its own build and test commands are defined in this application's package manifest.

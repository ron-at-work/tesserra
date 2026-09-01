# ADR 0001: Node, TypeScript, ESM, and package boundaries

**Status:** Accepted for documentation; proposed pending RFC review and Milestone 1 implementation approval.
**Date:** 2026-09-01

## Context

The reference implementation needs a reproducible local developer runtime, strong boundary enforcement, and publishable components without coupling protocol verification to local operations or web UI.

## Decision

Adopt the Node 24 LTS, pinned pnpm, pinned TypeScript, native ESM, and strict TypeScript baseline described in [repository architecture](../architecture/repository-architecture.md). The future monorepo contains protocol/core/local-crypto/SQLite/service/API-contract/API-client/API-server/SDK/CLI/adapters/host/dashboard/landing units. The exact allowed dependency graph in that document is normative for implementation architecture.

All internal modules use neutral namespaces. The working display name and product configuration are presentation concerns only. The frozen wire namespaces are the Agent Proof artifact family—`agent-proof/v1`, `urn:agent-proof:*`, and `https://agent-proof.invalid/*`—and the distinct structured-agent-ID scheme/display family `agid` / `agid:v1:`. The `.invalid` namespace is documentation-only, not a service or discovery endpoint. Neither family is derived from product naming or used as a package scope.

## Alternatives considered

- **Node 22 or unpinned current Node:** broader immediate familiarity, but does not meet the chosen Node 24 LTS baseline and allows toolchain drift.
- **CommonJS or dual ESM/CommonJS builds:** may support older consumers, but adds resolution ambiguity and build/release surface before a compatibility need exists.
- **One application package:** lowers initial scaffolding effort but permits UI, HTTP, SQL, and private-key concerns to leak into verification.
- **Unconstrained workspace imports:** convenient initially, but makes public API and clean-consumer behavior untestable.

## Consequences

- Toolchain updates are reviewed dependency/security changes; lockfile, Node image, and generated declarations must agree.
- Strict compilation and import-boundary checks may require explicit conversion/validation at every transport and storage edge.
- CommonJS consumers need an explicit future compatibility decision rather than accidental support.
- Protocol and core stay independently testable and can be reused by API server, SDK, CLI, and adapters without clients importing the composition graph.

## Open implementation choices

The [canonical implementation technology-decision register](../architecture/repository-architecture.md#canonical-implementation-technology-decision-register) owns the owner, deadline, and exception treatment for this ADR’s runtime pins, boundary tooling, package scope, and CommonJS-bridge choices. No exception can alter either frozen Agent Proof artifact or `agid` structured-ID wire namespace.

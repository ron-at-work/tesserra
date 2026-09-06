# Architecture decisions

This directory records the implementation architecture selected for TESSERRA Milestone 1. **TESSERRA** is a replaceable display name; it MUST NOT become a wire identifier, domain type prefix, or internal package namespace.

## Status vocabulary

- **Accepted for documentation** — selected as the planning baseline and recorded here. It authorizes no code by itself.
- **Accepted — Milestone 1 approved for implementation** — U-01 through U-12 are Complete; Phase 1 implementation is unlocked under the freeze and amendment rules in the [implementation-unlock checklist](../milestone-1-review-checklist.md).

Every ADR below carries the post-U-12 accepted status. Wire bytes, trust semantics, decision precedence, and declared adapter status remain frozen; changes still require an RFC amendment and renewed review for the affected scope.

## ADR index

| ADR                                                             | Decision                                                                        |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [0001](0001-runtime-language-and-package-boundaries.md)         | Node 24, pnpm, strict TypeScript, ESM, and one-way package boundaries           |
| [0002](0002-protocol-schema-canonicalization-and-core-ports.md) | Schema ownership, canonical wire bytes, deterministic core, and ports           |
| [0003](0003-local-keys-sqlite-and-data-lifecycle.md)            | Encrypted local keys, SQLite, migrations, sensitivity, and retention            |
| [0004](0004-local-api-cli-sdk-and-adapters.md)                  | Loopback typed API, OpenAPI, CLI/SDK, configuration, and adapters               |
| [0005](0005-web-surfaces-testing-and-release.md)                | Separate web surfaces, quality strategy, release, versioning, and compatibility |
| [0006](0006-milestone-one-no-code-unlock-gate.md)               | Documentation-only gate and implementation unlock                               |

## Non-goals

These decisions do not replace or reimplement SPIFFE/SPIRE, OAuth/OIDC, MCP, A2A, PKI, an authorization server, a policy engine, or a generic agent framework. Integrations are future adapters that map external concepts at a boundary while keeping core verification local and deterministic.

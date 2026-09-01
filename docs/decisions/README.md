# Architecture decisions

This directory records the implementation architecture selected for ATTEST Milestone 1. **ATTEST** is a replaceable display name; it MUST NOT become a wire identifier, domain type prefix, or internal package namespace.

## Status vocabulary

- **Accepted for documentation** — selected as the planning baseline and recorded here. It authorizes no code.
- **Proposed pending RFC review** — requires protocol RFC, threat-model, standards-gap, and explicit Milestone 1 approval review before implementation.

Every ADR below has both statuses because this milestone is documentation-only. Where they differ, the individual ADR identifies the item that remains proposed.

## ADR index

| ADR | Decision |
| --- | --- |
| [0001](0001-runtime-language-and-package-boundaries.md) | Node 24, pnpm, strict TypeScript, ESM, and one-way package boundaries |
| [0002](0002-protocol-schema-canonicalization-and-core-ports.md) | Schema ownership, canonical wire bytes, deterministic core, and ports |
| [0003](0003-local-keys-sqlite-and-data-lifecycle.md) | Encrypted local keys, SQLite, migrations, sensitivity, and retention |
| [0004](0004-local-api-cli-sdk-and-adapters.md) | Loopback typed API, OpenAPI, CLI/SDK, configuration, and adapters |
| [0005](0005-web-surfaces-testing-and-release.md) | Separate web surfaces, quality strategy, release, versioning, and compatibility |
| [0006](0006-milestone-one-no-code-unlock-gate.md) | Documentation-only gate and implementation unlock |

## Non-goals

These decisions do not replace or reimplement SPIFFE/SPIRE, OAuth/OIDC, MCP, A2A, PKI, an authorization server, a policy engine, or a generic agent framework. Integrations are future adapters that map external concepts at a boundary while keeping core verification local and deterministic.

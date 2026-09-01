# ATTEST

> Verifiable authority evidence for agent actions.

ATTEST is the configurable display name for the Agent Proof reference implementation. Product presentation does not define protocol identifiers, package namespaces, or domain types. The implementation verifies signed claims against configured local trust policy; it does not prove signer honesty, correct execution, safe code, uncompromised runtimes, global offline freshness, or availability.

## Phase 1 status

Phase 1 identity primitives are implemented in the workspace packages. The current scope includes protocol parsing and canonicalization, deterministic verification, local encrypted-key and SQLite foundations, identity/trust service and API layers, an offline SDK, and the `agentctl` CLI. Phase 2 delegation, signed requests, revocation/rotation, provenance, adapters, and web applications remain separate future phases.

The v1 RFC and its approved evidence remain authoritative:

- [Protocol RFC](docs/rfcs/0001-attest-v1-wire-protocol.md)
- [Threat model](docs/security/threat-model.md)
- [Architecture decisions](docs/architecture/repository-architecture.md)
- [Requirements traceability](docs/requirements-traceability.md)
- [Conformance vectors](tests/conformance/README.md)

## Requirements

- **Node.js 24.11.1** — pinned in [`.node-version`](.node-version). Node 24 is required; Node 22 and earlier are unsupported.
- Corepack, distributed with supported Node releases.

The repository pins pnpm `11.25.0` in `package.json`. Use Corepack and pnpm only; do not install workspace dependencies with npm or Yarn.

## Clean-clone workflow

```sh
git clone https://github.com/ron-at-work/app.git
cd app
corepack enable
node --version # must report v24.11.1
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm build
corepack pnpm test
```

The order matters: build emits the ESM package outputs consumed by integration tests, so CI builds before testing. `pnpm format` applies repository formatting. `pnpm benchmark` deliberately fails until an implemented capability has a measured benchmark with fixture, environment, and methodology metadata.

## Workspace structure

```text
config/      Product presentation configuration and schema.
docs/        Approved RFC, standards, threat-model, and architecture records.
packages/    Phase 1 implementation packages.
tests/       Frozen protocol conformance vectors.
tooling/     Runtime, package-boundary, and quality checks.
```

All `packages/*` workspace projects use native ESM, strict TypeScript, explicit package exports, and declared workspace dependencies. The root quality gate runs formatting and ESLint across packages, requires every package to provide a real TypeScript `typecheck` script, and checks the allowed package dependency graph and source boundaries. Package tests use the pinned Vitest catalog version; packages with no tests must not add a passing placeholder.

## Product configuration

[`config/product.json`](config/product.json) is the single source for display name, product links, and visual tokens. Its schema restricts it to presentation data. It must not define protocol versions, domain identifiers, algorithms, trust, or authorization semantics. The fallback command remains `agentctl` pending naming/legal review.

## Governance, contributions, and security

Milestone 1 approval is recorded in [`docs/milestone-1-review-checklist.md`](docs/milestone-1-review-checklist.md). The review guard verifies the frozen documentation/conformance evidence at the recorded milestone revision without treating approved Phase 1 packages as Milestone 1 violations.

See [CONTRIBUTING.md](CONTRIBUTING.md) for development expectations, [SECURITY.md](SECURITY.md) for private vulnerability reporting, and [LICENSE](LICENSE) for licensing.

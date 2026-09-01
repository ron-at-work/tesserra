# ATTEST

> Verifiable authority evidence for agent actions.

ATTEST is the configurable display name for the Agent Proof reference implementation. It verifies signed claims against configured local trust policy. It does **not** prove a signer is honest, code is safe, execution is correct, a runtime is uncompromised, status is globally fresh offline, or a system is available.

## Status and roadmap

The shipped workspace contains identity/trust primitives, deterministic protocol/core verification, delegation/request/provenance helpers, frozen conformance evidence, adapter packages, and separate dashboard/landing applications. The CLI supports a local delegation/request fixture flow and local provenance graph inspection/export. Rotation and revocation issuance fail closed until lifecycle and distinct status-authority workflows exist; `revoked` only reports locally stored records. Public surfaces are documented by their actual implementation status.

| Phase | Capability                                           | Current repository status                                                                                                                                        |
| ----- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Identity, local trust, offline identity verification | Implemented                                                                                                                                                      |
| 2–5   | Delegation, signed requests, lifecycle, provenance   | Local CLI/API/SDK evidence flows and graph inspection exist; rotation, status-authority revocation issuance, online replay, and remote provenance remain partial |
| 6–8   | MCP, SPIFFE, A2A bindings                            | Adapter packages exist; compatibility claims remain constrained by adapter documentation                                                                         |
| 9     | Local operations dashboard                           | Separate typed local-API client application                                                                                                                      |
| 10    | Public landing and release completion                | Separate static application plus release controls                                                                                                                |

The actual `agentctl` surface is `init`; `identity create`, `inspect`, and `rotate`; `delegate create`, `inspect`, and `verify`; `request sign` and `verify`; `revoke`; `revoked`; `trust add` and `list`; and `provenance inspect` and `export`. The loopback HTTP surface serves identity, trust-snapshot, delegation persistence/read/list, delegation/request verification, revocation read, and event-listing routes. `POST /v1/revocations` fails closed until a distinct status authority is configured; there is no rotation, request-signing, or provenance-graph HTTP route. See the [CLI reference](docs/api/cli.md) and [local API reference](docs/api/local-api.md) for exact behavior.

See the [roadmap](docs/guides/roadmap.md), [architecture navigation](docs/README.md), and [RFC](docs/rfcs/0001-attest-v1-wire-protocol.md) for exact scope.

## Requirements

- **Node.js 24.11.1**, pinned in [`.node-version`](.node-version). Node 22 and earlier are unsupported.
- Corepack, distributed with supported Node releases.

The repository pins pnpm `11.25.0`. Use Corepack and pnpm; do not install workspace dependencies with npm or Yarn.

## Quick start

Follow the complete, runnable walkthrough in [docs/guides/quick-start.md](docs/guides/quick-start.md). The short version establishes isolated local identity/trust state and verifies the checked-in two-hop delegation/request evidence:

```sh
git clone https://github.com/ron-at-work/app.git
cd app
corepack enable
corepack pnpm install --frozen-lockfile

export AGENTCTL_HOME="$(mktemp -d)"
export AGENTCTL_PASSPHRASE='use-a-secret-from-a-file-or-secret-store'
corepack pnpm --filter @agent-proof/cli exec agentctl init
corepack pnpm --filter @agent-proof/cli exec agentctl identity create \
  --agent agid:v1:example.test/quick-start \
  --dev-self-issue --json

corepack pnpm build
corepack pnpm --filter @agent-proof/core test
corepack pnpm benchmark
```

`--dev-self-issue` is explicitly for isolated fixtures and never establishes trust automatically. Production issuance requires configured issuer/trust policy. The benchmark verifies a real positive two-hop request fixture; it does not publish or infer performance claims.

## Workspace structure

```text
config/      Configurable product presentation data and schema.
docs/        RFC, security, architecture, guides, API, adapter, and release documentation.
examples/    Executable, checked examples based on shipped behavior.
packages/    Protocol, core, transport, SDK, CLI, storage, and adapter packages.
apps/        Independently built dashboard and landing surfaces.
tooling/     Runtime, documentation, package-boundary, benchmark, and release checks.
tests/       Frozen protocol conformance vectors.
```

All package projects use native ESM, strict TypeScript, explicit exports, and declared workspace dependencies. Dashboard and landing remain separate surfaces: the dashboard uses a typed local-API boundary and cannot import local crypto, storage, server, host, or adapter internals; the landing is static/public and cannot import workspace package internals.

## Commands

```sh
pnpm lint                 # format, ESLint, package/app boundaries, documentation/examples
pnpm build
pnpm typecheck
pnpm test
pnpm test:clean-clone
pnpm benchmark            # measures real delegated-request verification only
pnpm dev:landing          # starts the separate public landing app
pnpm dev:dashboard        # starts the separate local dashboard app
```

The benchmark prints its fixture, operation count, warmup count, elapsed time, runtime, platform, architecture, and commit identifier. It intentionally produces no invented baseline or capacity claim. See [benchmark reporting](docs/guides/benchmarking.md).

## Product configuration

[`config/product.json`](config/product.json) is the single source for display name, public links, and visual tokens. It must not define protocol versions, domain identifiers, algorithms, trust, or authorization semantics. `agentctl` remains the fallback command until naming/legal review.

## Documentation and support

- [Documentation index](docs/README.md)
- [Quick start](docs/guides/quick-start.md)
- [CLI, local API, and SDK references](docs/api/README.md)
- [Adapter boundaries](docs/adapters/README.md)
- [Release process and supply-chain artifacts](docs/release.md)
- [Contributing](CONTRIBUTING.md), [security reporting](SECURITY.md), [license](LICENSE), and [changelog](CHANGELOG.md)

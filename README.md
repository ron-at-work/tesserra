# TESSERRA

> Verifiable authority evidence for agent actions.

[![CI](https://github.com/ron-at-work/tesserra/actions/workflows/ci.yml/badge.svg)](https://github.com/ron-at-work/tesserra/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js 24](https://img.shields.io/badge/node-24.11.1-5FA04E?logo=nodedotjs&logoColor=white)](.node-version)

TESSERRA is a local-first reference implementation for verifying signed identity, delegation, and request evidence under configured trust policy. It gives a receiving system deterministic answers about the evidence it was given: who signed it, which authority chain it carries, and whether its bindings pass the supplied policy.

**Source status:** the repository is available as source, but it is not a published package distribution or production-ready security service. The release workflow and a `0.1.0` changelog entry describe release preparation; consumers should build from a pinned commit and run the conformance checks below. The display name is configurable and is not a wire identifier or package namespace.

- **Landing app:** [`apps/landing`](apps/landing/README.md) is the public, static project introduction.
- **Docs site:** [`apps/docs`](apps/docs/) is the separately built documentation site; the repository [documentation index](docs/README.md) and [RFC](docs/rfcs/0001-tesserra-v1-wire-protocol.md) remain its source material.
- **Dashboard app:** [`apps/dashboard`](apps/dashboard/README.md) is a separate local operations UI; it is not a hosted service.

## What it does—and does not do

TESSERRA currently supports local identity and trust setup, deterministic offline identity/delegation/request verification, frozen protocol conformance vectors, a typed loopback API boundary, a CLI, SDK helpers, and narrowly scoped MCP, SPIFFE, and A2A adapter helpers.

It does **not** prove a signer is honest, code is safe, execution was correct, or a runtime is uncompromised. It does not provide global offline freshness or availability. It does not replace SPIFFE/SPIRE, OAuth/OIDC, MCP, A2A, PKI, an authorization server, or a policy engine.

## Quick start: verify shipped evidence

Use Node **24.11.1** (the pinned development and CI version), enable Corepack, and run the checked verifier against the included two-hop request evidence:

```sh
git clone https://github.com/ron-at-work/tesserra.git
cd app
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm build
corepack pnpm --filter @agent-proof/core test
```

The final command verifies every frozen conformance case, including a positive signed request with two attenuating delegations. This is deterministic and offline; it does not configure a production issuer or establish trust in a deployed system.

To create isolated fixture identity/trust state, follow the full [quick start guide](docs/guides/quick-start.md). See the [API index](docs/api/README.md) for the CLI, SDK, and loopback API, and [examples](examples/README.md)—especially [delegated request verification](examples/delegated-request/README.md)—for checked evidence walkthroughs. For a measured local repetition of the same positive vector, run `corepack pnpm benchmark`.

## Implementation status

| Area                                        | Status      | Notes                                                                                                                                  |
| ------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Identity, local trust, offline verification | Implemented | CLI, loopback API, SDK verification, encrypted local keys, SQLite foundations, and conformance vectors.                                |
| Delegation and signed requests              | Partial     | Local CLI issuance/inspection and deterministic verification exist; online replay consumption and a complete operator workflow do not. |
| Revocation and rotation                     | Partial     | Schemas and storage foundations exist; the default CLI/API fail closed without a distinct status authority and atomic lifecycle flow.  |
| Provenance                                  | Partial     | Local graph inspection/export exists; remote graph, multi-user redaction, and HTTP graph/export routes do not.                         |
| MCP, SPIFFE/SPIRE, and A2A                  | Partial     | Adapter helpers are bounded integrations, not replacements for their underlying protocols.                                             |
| Landing, dashboard, and docs site           | Partial     | Three separate applications exist: landing is static, dashboard is a local API client, and docs site publishes project documentation.  |
| Package publication and supported release   | Planned     | No packages or production release are claimed by this README.                                                                          |

See the detailed [roadmap](docs/guides/roadmap.md) for phase boundaries and release criteria.

## Interfaces

- **CLI:** [`agentctl`](docs/api/cli.md) initializes local fixture state, creates and inspects identities, creates/verifies local delegation and request evidence, manages local fixture trust, and inspects/exports local provenance. Rotation and revocation issuance return explicit fail-closed errors in the default profile.
- **SDK:** [`@agent-proof/sdk`](docs/api/sdk.md) exposes deterministic offline verifiers, protocol types, display helpers, and the typed local API client.
- **Local API:** the [loopback HTTP API](docs/api/local-api.md) serves identity, trust, verification, and conditional evidence-persistence routes. It is not remotely exposed by default.
- **Adapters:** [MCP, SPIFFE/SPIRE, and A2A boundaries](docs/adapters/README.md) explain supported proof mappings and their limitations.

## Develop

The workspace requires pnpm `11.25.0` and supports Node `>=24 <25`; `.node-version` pins the exact version used by CI and the documented workflow: Node `24.11.1`. **Use pnpm through Corepack:** npm and Yarn cannot install this workspace because its catalog and `workspace:*` dependencies require pnpm workspace resolution.

```sh
corepack pnpm lint
corepack pnpm typecheck
corepack pnpm test
corepack pnpm build
corepack pnpm test:clean-clone
```

Useful local surfaces:

```sh
corepack pnpm dev:landing
corepack pnpm dev:dashboard
corepack pnpm dev:docs
```

Read [CONTRIBUTING.md](CONTRIBUTING.md) before proposing changes, [SECURITY.md](SECURITY.md) to report vulnerabilities privately, and [LICENSE](LICENSE) for the MIT terms. The [release guide](docs/release.md) describes the planned artifact and provenance process without claiming that artifacts have been published.

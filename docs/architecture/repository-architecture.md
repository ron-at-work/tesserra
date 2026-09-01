# Future repository architecture

**Status:** Accepted for documentation; proposed pending RFC review and Milestone 1 implementation approval.

This is the target shape after the documentation-only gate. It is not a workspace scaffold and creates no implementation authorization.

## Runtime and workspace baseline

| Concern         | Decision       | Pin policy                                                                                                                                                    |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime         | Node.js 24 LTS | Pin one exact Node 24 release in the future toolchain and CI image; update only through release review.                                                       |
| Package manager | pnpm           | Pin one exact pnpm release through Corepack/package metadata. Frozen installs are required in CI and release verification.                                    |
| Language        | TypeScript     | Pin one exact stable TypeScript release; `strict` is enabled, including `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and declaration generation. |
| Modules         | Native ESM     | Each publishable package declares ESM-only exports. No implicit CommonJS compatibility layer.                                                                 |
| Internal naming | Neutral        | Internal package scope and domain type names are independent of the working display name.                                                                     |

Exact releases are intentionally unresolved until implementation begins, so the pins can be current, reproducible, and security-reviewed then. “Node 24,” “pnpm,” and “TypeScript” are architecture choices, not mutable-version permissions.

## Package graph

The future packages are:

- `protocol` — versioned schemas, canonicalization contract, wire types, error codes, and vectors.
- `core` — pure deterministic verifier and domain rules.
- `crypto-local` — Ed25519 and encrypted local `KeyProvider` implementation.
- `storage-sqlite` — SQLite persistence, migrations, transactions, and repositories.
- `service` — use cases and application-facing port contracts; it is not an executable host.
- `api-contract` — public HTTP models, endpoint definitions, error envelope, and generated/reviewed OpenAPI inputs; no server runtime.
- `api-client` — typed HTTP client generated from or verified against `api-contract`; no server runtime.
- `api-server` — loopback HTTP parsing, authentication, and route binding; the only HTTP server package.
- `sdk` — public programmatic facade for offline verification and `api-client`; no service implementation.
- `cli` — human-facing local command-line client.
- `adapter-mcp`, `adapter-spiffe`, `adapter-a2a` — optional external-boundary adapters.
- `host-local` — the executable composition host for the local distribution; selects implementations, owns process lifecycle, and starts `api-server`.
- `apps/dashboard` — local operations interface.
- `apps/landing` — separately deployed public static site.
- `apps/docs` — separately built documentation site sourced from approved repository documentation.

### Exact dependency rules

An arrow means “may depend on.” Any undeclared edge is forbidden.

```text
protocol -> (nothing)
core -> protocol
crypto-local -> protocol, core
storage-sqlite -> protocol, core
service -> protocol, core
api-contract -> protocol
api-client -> api-contract, protocol
api-server -> api-contract, service
sdk -> protocol, core, api-contract, api-client
cli -> protocol, sdk, api-contract, api-client
adapter-mcp -> protocol, core, service
adapter-spiffe -> protocol, core, service
adapter-a2a -> protocol, core, service
host-local -> service, crypto-local, storage-sqlite, api-server, adapter-mcp, adapter-spiffe, adapter-a2a
apps/dashboard -> api-contract, api-client
apps/landing -> config/product.json and static, generated public documentation only
apps/docs -> config/product.json and approved static documentation content only
```

Additional rules:

1. `protocol` MUST NOT import Node APIs, database drivers, HTTP libraries, cryptographic providers, adapters, or UI code.
2. `core` MUST NOT access clocks, randomness, files, process environment, network, key material, or databases directly. It receives typed ports and explicit inputs.
3. Only `crypto-local` may implement a local private-key provider. Private-key bytes MUST NOT cross its provider boundary.
4. Only `storage-sqlite` may import the selected SQLite driver or own SQL/migrations.
5. `service` owns use-case orchestration and port interfaces, but no concrete composition. `host-local` is the sole local composition root: it constructs service use cases from local crypto, storage, clock/randomness, configured providers, and selected adapters, then passes only service interfaces to `api-server`.
6. `api-contract` and `api-client` MUST NOT import `service`, `storage-sqlite`, `crypto-local`, `host-local`, adapters, or any server-only module. `api-server` imports no SQLite/key implementation directly.
7. `sdk`, `cli`, and dashboard MAY depend only on the public `api-contract`/`api-client` path and offline `protocol`/`core` APIs explicitly exported by `sdk`; they MUST NOT transitively import service, storage, local crypto, host, or server code.
8. Every adapter invokes the same `core` verifier through service interfaces; no adapter has a second verifier or changes ordered decision precedence.
9. Web apps MUST NOT import `crypto-local`, `storage-sqlite`, `service`, `api-server`, `host-local`, adapters, private protocol artifacts, or server-only runtime modules. Dashboard access is through the typed local-API boundary; landing and docs site consume only presentation configuration and approved static content. Adopting `api-client` is the dashboard target consolidation, not a claim about its current implementation.
10. Enforce these rules with package `exports`, project references, dependency-cruiser/equivalent boundary checks, generated-client import checks, and clean-consumer tests that prove the forbidden modules are absent from client dependency closure.

## Deterministic core and ports

`core` receives raw artifact bytes plus explicit inputs and produces a stable structured decision, including primary and secondary closed error codes, without I/O. Its inputs include an explicit instant, expected context, trust/status snapshots, key resolution result, and replay outcome. Per RFC 0001 §6, **Ordered verification and output**, it first performs PARSE outer syntax/envelope/identity checks, then VERSION supported identity checks and supported-kind schema validation; its only complete verification order is **PARSE → VERSION → CRYPTO → TIME → TRUST → CHAIN → STATUS → BINDING → REPLAY**.

| Port                      | Contract and rule                                                                                                                                                                                                                | Implemented by                                         |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `Clock`                   | Supplies one explicit verification instant; core never reads system time.                                                                                                                                                        | `host-local`/service test harness                      |
| `RandomSource`            | Creates issuance/challenge values only; deterministic verification receives supplied values.                                                                                                                                     | `crypto-local` or host/test harness                    |
| `KeyProvider`             | Signs and resolves public keys while private-key bytes stay opaque.                                                                                                                                                              | `crypto-local`; future external provider               |
| `IdentityProvider`        | Resolves configured, typed identity evidence into an asserted principal/evidence bundle. It cannot issue protocol credentials, expand the RFC 0001 §3 `authority_ceiling`, or collapse the distinct RFC 0001 §3 principal types. | local configuration; future SPIFFE/OIDC adapters       |
| `TrustProvider`           | Loads an authenticated, pinned `TrustSnapshot` and historical snapshot by identity; it never performs ambient discovery or TOFU (RFC 0001 §4).                                                                                   | `storage-sqlite`/local config; future managed provider |
| `StatusProvider`          | Supplies a complete pinned status set plus publisher high-water state for the selected trust snapshot (RFC 0001 §4).                                                                                                             | `storage-sqlite`; future configured provider           |
| `RuntimeEvidenceProvider` | Obtains optional runtime/channel evidence and preserves its source, freshness, and non-equivalence. Evidence is contextual input, never an authorization grant (RFC 0001 §§3–5).                                                 | future SPIFFE/MCP/A2A adapters                         |
| `ReplayStore`             | Atomically consumes the RFC 0001 §5 replay keys after all preceding §6 stages pass.                                                                                                                                              | `storage-sqlite`                                       |
| `EventSink`               | Receives redacted verification events after a decision.                                                                                                                                                                          | `storage-sqlite`                                       |

Adapters implement only their relevant provider port(s) and submit typed results to service. For example, SPIFFE may implement `IdentityProvider` and `RuntimeEvidenceProvider`; it does not become a `TrustProvider` for protocol issuers unless an independently authenticated local trust configuration explicitly selects it. MCP and A2A may provide transport/runtime context but cannot turn their metadata into identity credentials or delegation authority.

The service may orchestrate I/O before/after core evaluation. Per RFC 0001 §§4–5 and §7, offline verification cannot claim fresh revocation or global replay protection; that residual limitation is surfaced in the result.

## Neutral protocol namespaces and credential authority ceiling

The RFC freezes two neutral, product-independent namespace families. **Agent Proof artifact namespace** consists of wire version `agent-proof/v1`, `urn:agent-proof:*` artifact/key identifiers, and `https://agent-proof.invalid/*` documentation/predicate identifiers. The `.invalid` domain is a reserved documentation namespace, not a deployed service, a DNS lookup, or a trust-discovery endpoint. **Structured agent-ID namespace** consists of scheme `agid` and its logging-only `agid:v1:` display form; structured Agent ID values, not rendered strings, are compared. Neither namespace is a package scope, product brand, authorization decision, or ambient discovery mechanism. No product display name may be introduced into a wire field, package namespace, or generated API namespace.

A credential cryptographically binds a locally trusted `human` or `service` issuer, an `agent` subject, a public key, a validity interval, and a nonempty `authority_ceiling` constraints object. That ceiling is the cryptographic root authority grant for the credentialed key: a root delegation and every descendant delegation must be a strict attenuation of its capabilities, resources, tasks, audiences, validity interval, and remaining depth; requests may exercise only resulting effective authority. The ceiling does **not** prove signer honesty, human consent, safe/correct execution, uncompromised runtime, an OAuth grant, or workload attestation. `IdentityProvider` and `RuntimeEvidenceProvider` outputs may supply distinct asserted/contextual evidence but cannot expand this root authority.

## Product configuration and surfaces

`config/product.json` is the single future source for display name, product links, legal/support links, and visual tokens. The fallback command name is `agentctl` until naming/legal checks approve an alternative. It MUST NOT supply protocol versions, domain identifiers, cryptographic algorithm IDs, trust decisions, or authorization semantics.

Dashboard, landing, and docs site are intentionally separate projects, artifacts, deployment policies, and test suites. Dashboard is a loopback local operations client; landing is public static content; docs site presents approved repository documentation. None is a substitute for another, and each builds and deploys independently.

## Canonical implementation technology-decision register

[ADR 0001](../decisions/0001-runtime-language-and-package-boundaries.md#open-implementation-choices) is the canonical register for all unresolved implementation technology choices, owners, deadlines, and exceptions. ADRs 0002–0006 and the supporting architecture documents link to that register rather than maintaining competing tables. Add or change a technology choice there; the affected ADR/architecture document may state its requirement and link to the register, but MUST NOT duplicate its owner/deadline/exception record.

An exception must name the security/compatibility impact, a temporary owner, and a new date, and receive the approvals specified by the canonical register. An unapproved exception blocks the named phase.

| Choice                                                                                                               | Owner phase                                     | Decision deadline                                            | Exception treatment                                                                                                                        |
| -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Exact Node 24, pnpm, and TypeScript versions                                                                         | Phase 1, release/build owner                    | Before Phase 1 workspace scaffold                            | Block scaffold; exception requires a reproducible CI image and frozen-install evidence.                                                    |
| Test runner, linter, package-boundary tool, property framework, browser automation, and benchmark harness            | Phase 1, build/quality owner                    | Before Phase 1 quality gate                                  | Block the gate; no exception waives strict type/boundary enforcement or equivalent conformance, property, browser, and benchmark evidence. |
| Final neutral package scope                                                                                          | Phase 1, release/legal owner                    | Before first package publication, no later than Phase 1 exit | Keep packages unpublished; exception cannot alter the Agent Proof artifact or `agid` structured-ID wire namespace.                         |
| Public SDK CommonJS bridge                                                                                           | Post-Phase 10, SDK/release owner                | Before declaring CommonJS support                            | ESM-only remains supported; a bridge requires clean-consumer and export-compatibility evidence.                                            |
| Machine-readable schema format and validation library                                                                | Phase 1, protocol/API owners                    | Before Phase 1 schema implementation                         | Block protocol implementation; exception must preserve all RFC-required rejections and provide independent validation evidence.            |
| TypeScript parser strategy preserving duplicate-member and raw-UTF-8 checks                                          | Phase 1, protocol owner                         | Before Phase 1 parser implementation                         | Block parser acceptance; no exception may defer duplicate rejection or canonicalization checks.                                            |
| Cross-language reproduction harness/runtime                                                                          | Phase 1, conformance owner                      | Before the Phase 1 gate                                      | Block the gate; a temporary second implementation requires documented independence and reviewer approval.                                  |
| Future binary representation                                                                                         | Post-MVP, protocol owner                        | Before any proposal after Phase 10                           | No MVP exception: canonical JSON remains the sole v1 representation; a binary format requires a new RFC version/amendment.                 |
| SQLite driver and migration framework                                                                                | Phase 1, storage owner                          | Before Phase 1 persistence implementation                    | Block persistence; exception must prove transactions, migration checksums, foreign keys, and concurrent replay uniqueness.                 |
| Retention defaults, privacy/deletion controls, and encrypted backups                                                 | Phase 1, operations/privacy owner               | Before Phase 1 operational-data gate                         | Block operational-data retention beyond mandatory fixtures; exception requires documented deployment policy and security approval.         |
| Key-encryption/KDF parameters, OS-keystore matrix, recovery, and compromise UX                                       | Phase 1, security/key-management owner          | Before production-capable key creation                       | Block key issuance/release; no exception permits plaintext private-key storage.                                                            |
| Historical trust/status archival format                                                                              | Phase 4, storage/security owner                 | Before Phase 4 gate                                          | Block historical-verification claims; exception may explicitly disable, never silently downgrade, historical verification.                 |
| API framework/OpenAPI generation stack and endpoint payload schemas                                                  | Phase 1, API owner                              | Before Phase 1 API implementation                            | Block API implementation; temporary hand-authored contracts require schema parity and clean-client tests.                                  |
| Local endpoint transport and local-user authentication posture                                                       | Phase 1, API/security owner                     | Before API listener startup                                  | Block listener startup outside tests; no exception permits unauthenticated trust reload.                                                   |
| Remote exposure authentication, mTLS/TLS, authorization, and deployment                                              | Post-Phase 5, API/security owner                | Before a remote-exposure proposal                            | Remote exposure remains disabled; no exception changes the loopback default.                                                               |
| Final CLI name, product configuration schema, and adapter diagnostics                                                | Phase 10, product/API owner                     | Before Phase 10 release                                      | Retain `agentctl` and omit nonessential commands; no exception changes wire/package namespaces.                                            |
| Dashboard/landing frameworks, design artifacts, hosting, and browser support                                         | Phases 9–10, UI/release owner                   | Before the affected Phase 9 or 10 implementation             | Block the affected surface; no exception merges the applications or grants dashboard backend imports.                                      |
| Package versioning tooling, signing identity, SBOM/provenance format, artifact registry, and protocol support window | Phase 10, release owner                         | Before first release candidate                               | Block publication; exception may allow an internal unsigned build only, never a public release.                                            |
| Reviewer identities, approval-record location, and automated docs/no-code lint                                       | Milestone 1, project/build-documentation owners | Before requesting Milestone 1 approval                       | Block approval; manual evidence is allowed only with named reviewer sign-off and no source/package/migration/generated-SDK exception.      |

## Implementation-phase map

| Phase | Newly public capability                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------- |
| 1     | identity/trust service, `api-contract`/`api-client`, loopback identity API, `agentctl init`, `agentctl identity create | inspect`, SDK `verifyIdentity` |
| 2     | delegation API/CLI/SDK and chain verification                                                                          |
| 3     | signed request API/CLI/SDK, replay consumption                                                                         |
| 4     | revocation and rotation API/CLI/SDK                                                                                    |
| 5     | verification event/provenance list, graph, export surfaces                                                             |
| 6–8   | MCP, SPIFFE, and A2A adapters after their standards pins are refreshed                                                 |
| 9     | dashboard against real local API                                                                                       |
| 10    | independently built public landing page and release workflow                                                           |

# Future public surfaces by phase

**Status:** Accepted for documentation; proposed pending RFC review and Milestone 1 implementation approval.

The public API is loopback-only by default. It binds to an explicit local endpoint, rejects non-loopback binding unless an operator deliberately enables remote exposure, and documents the exposure authentication, TLS, firewall, origin, and threat-model requirements before enabling it. No implementation should describe a local binding as safe in a hostile local-user environment.

`api-contract` owns public HTTP models, endpoint definitions, and OpenAPI inputs. `api-client` owns generated/reviewed typed client behavior. `api-server` binds the contract to service interfaces inside `host-local`. Dashboard, SDK, and CLI must stay on the public typed API boundary; none may import or transit through service, storage, crypto, host, server, or adapter packages. The dashboard currently owns a small compatible HTTP client while `api-client` remains the consolidation target. Landing, dashboard, and docs site are separate applications: landing is static public content, dashboard is a local operations client, and docs site presents approved documentation; each has an independent build, deployment policy, and test suite.

All HTTP endpoints use generated/reviewed OpenAPI derived from the same API contract types, typed request/response validation, a stable error envelope, pagination for collections, and idempotency for mutation routes where retries can duplicate effect. Event output is redacted according to data architecture.

## Stable transport conventions

- Versioned base path: `/v1` for the future local HTTP API. It is a transport-contract version and is distinct from the frozen protocol wire version `agent-proof/v1` defined in RFC 0001 §§1–3.
- Error envelope: `{ "error": { "code": "...", "message": "...", "details": [...] }, "requestId": "..." }`; `code` maps to the closed protocol/service taxonomy, while messages are non-authoritative diagnostics.
- Collection responses carry bounded pagination tokens, explicit page size limits, and stable ordering.
- State-changing POST routes accept an idempotency key when the operation can be retried; request identity/replay is protocol-specific and is not replaced by the HTTP key.
- OpenAPI documents public transport contracts only. It does not expose provider references, local secrets, raw nonce values, unredacted evidence, or storage controls.

## Current and planned surfaces

Status terms match the [documentation index](../README.md): **Implemented** is backed by current source and repository tests; **Partial** is a bounded surface or evidence whose phase gate is incomplete; **Planned** is not a supported public release.

| Phase                   | Current status | Implemented boundary                                                                                                                                        | Remaining work                                                                  |
| ----------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1 Identity              | Implemented    | Identity/trust CLI, loopback identity API, typed client, offline `verifyIdentity`                                                                           | Production issuer/trust configuration is deployment-owned.                      |
| 2 Delegation            | Partial        | Core/service creation helper, SDK verifier, local CLI issuance/inspection, HTTP verification, conditional local evidence persistence, and conformance cases | Hosted delegation storage and the complete phase gate.                          |
| 3 Signed requests       | Partial        | Core/service creation helper, SDK verifier, local CLI signing/verification, HTTP verification, and SQLite replay primitives                                 | Request submission/operator workflow and the complete online exactly-once gate. |
| 4 Lifecycle             | Partial        | Protocol evidence and storage primitives; default local lifecycle commands fail closed                                                                      | Distinct status authority, atomic rotation, lifecycle workflows, and gate.      |
| 5 Provenance            | Partial        | Artifact schema/core helper, event persistence when configured, and local CLI graph inspection/export                                                       | Remote graph, multi-user redaction, and HTTP graph/export surfaces.             |
| 6 MCP                   | Partial        | Adapter helper package with explicit proof metadata binding                                                                                                 | Version-pinned integration compatibility matrix and production policy.          |
| 7 SPIFFE                | Partial        | Adapter provider mapping package                                                                                                                            | Hermetic SPIRE integration gate and operations diagnostics.                     |
| 8 A2A                   | Partial        | Adapter negotiated-extension helper package                                                                                                                 | Compatibility matrix and deployment integration gate.                           |
| 9 Dashboard             | Partial        | Separate typed local-API client application                                                                                                                 | Full operational/lifecycle/provenance data surfaces.                            |
| 10 Landing/docs/release | Partial        | Separate landing and docs-site applications, docs/example checks, benchmark, and release workflow                                                           | Publication and full release-gate evidence.                                     |

The API contract may declare a future route before the loopback server serves it. The [local API reference](../api/local-api.md) is authoritative for served routes; a declared contract/client method must not be represented as available service behavior.

Trust anchors are not writable through a generic `PUT /v1/trust-anchors`. Trust changes are local configuration changes, not ordinary HTTP resource edits. The only proposed transport action is authenticated loopback reload: it validates a complete locally configured candidate snapshot, verifies identity/policy hash/monotonic sequence, atomically selects it, and emits a redacted audit event. It accepts neither raw trust-anchor material nor discovery URLs from the caller. The local authentication/authorization mechanism remains an explicit Phase 1 security decision.

Exact paths, payloads, command flags, output schemas, authentication/exposure posture, and idempotency requirements remain proposed until the protocol RFC and threat model define them. The table prevents premature claims that future adapters are part of the core protocol.

## CLI and SDK separation

The CLI is a user interface over public SDK/API contracts. It provides stable structured output mode for automation, human-readable output separately, explicit nonzero exit mappings, and never emits secrets. The SDK exposes typed public models, validation results, and offline core-supported verification without requiring SQLite, local crypto, service, host, or a running server. Neither CLI nor SDK imports storage, local-key, host, server, or service implementation internals.

## Implementation technology decisions

Use the [canonical implementation technology-decision register](repository-architecture.md#canonical-implementation-technology-decision-register). It governs the API framework/OpenAPI generation stack, local endpoint and trust-reload authentication posture, remote exposure model, CLI/product configuration naming, and adapter diagnostics. These surfaces retain their stated constraints until the register’s owning phase approves a decision; in particular, no exception permits unauthenticated trust reload or changes the loopback default.

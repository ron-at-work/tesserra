# Future public surfaces by phase

**Status:** Accepted for documentation; proposed pending RFC review and Milestone 1 implementation approval.

The public API is loopback-only by default. It binds to an explicit local endpoint, rejects non-loopback binding unless an operator deliberately enables remote exposure, and documents the exposure authentication, TLS, firewall, origin, and threat-model requirements before enabling it. No implementation should describe a local binding as safe in a hostile local-user environment.

`api-contract` owns public HTTP models, endpoint definitions, and OpenAPI inputs. `api-client` owns generated/reviewed typed client behavior. `api-server` binds the contract to service interfaces inside `host-local`. Dashboard, SDK, and CLI consume only the contract/client boundary; none imports or transits through service, storage, crypto, host, or server packages.

All HTTP endpoints use generated/reviewed OpenAPI derived from the same API contract types, typed request/response validation, a stable error envelope, pagination for collections, and idempotency for mutation routes where retries can duplicate effect. Event output is redacted according to data architecture.

## Stable transport conventions

- Versioned base path: `/v1` for the future local HTTP API. It is a transport-contract version and is distinct from the frozen protocol wire version `agent-proof/v1` defined in RFC 0001 §§1–3.
- Error envelope: `{ "error": { "code": "...", "message": "...", "details": [...] }, "requestId": "..." }`; `code` maps to the closed protocol/service taxonomy, while messages are non-authoritative diagnostics.
- Collection responses carry bounded pagination tokens, explicit page size limits, and stable ordering.
- State-changing POST routes accept an idempotency key when the operation can be retried; request identity/replay is protocol-specific and is not replaced by the HTTP key.
- OpenAPI documents public transport contracts only. It does not expose provider references, local secrets, raw nonce values, unredacted evidence, or storage controls.

## Phase surfaces

| Phase | API routes (future) | CLI commands (future) | SDK boundary |
| --- | --- | --- | --- |
| 1 Identity primitives | `POST /v1/identities`; `GET /v1/identities/{id}`; `GET /v1/trust-anchors`; authenticated local `POST /v1/trust-snapshots:reload` only | `agentctl init`; `agentctl identity create`; `agentctl identity inspect`; `agentctl trust reload` | `verifyIdentity` offline; typed identity/trust client |
| 2 Delegation | `POST /v1/delegations`; `GET /v1/delegations/{id}`; `POST /v1/verifications/delegation` | `agentctl delegation create|inspect|verify` | typed issuance/inspection and chain verification |
| 3 Signed requests | `POST /v1/requests/verify`; request/status lookup only where redaction permits | `agentctl request sign|verify` | signed request helpers and verification client |
| 4 Revocation/rotation | `POST /v1/revocations`; `GET /v1/revocations`; `POST /v1/identities/{id}/rotate`; `GET /v1/keys/{id}` | `agentctl revoke`; `agentctl revoked`; `agentctl identity rotate` | lifecycle/status client |
| 5 Provenance | `GET /v1/verification-events`; `GET /v1/verification-events/{id}`; `GET /v1/provenance`; `GET /v1/provenance/{id}` | `agentctl event inspect`; `agentctl provenance export` | list/filter/graph/export helpers |
| 6 MCP | No new generic core route; adapter-specific negotiated binding only | adapter diagnostic commands if justified | MCP middleware/helper package |
| 7 SPIFFE | No core route; configured provider status/diagnostics only if threat modeled | SPIFFE adapter diagnostics if justified | SPIFFE provider adapter |
| 8 A2A | No core route; negotiated binding only | A2A adapter diagnostics if justified | A2A sender/receiver helpers |
| 9 Dashboard | Consumes above local API through `api-client`; no privileged backchannel | none required | typed API client only |
| 10 Landing | none; static public content | none | none |

Trust anchors are not writable through a generic `PUT /v1/trust-anchors`. Trust changes are local configuration changes, not ordinary HTTP resource edits. The only proposed transport action is authenticated loopback reload: it validates a complete locally configured candidate snapshot, verifies identity/policy hash/monotonic sequence, atomically selects it, and emits a redacted audit event. It accepts neither raw trust-anchor material nor discovery URLs from the caller. The local authentication/authorization mechanism remains an explicit Phase 1 security decision.

Exact paths, payloads, command flags, output schemas, authentication/exposure posture, and idempotency requirements remain proposed until the protocol RFC and threat model define them. The table prevents premature claims that future adapters are part of the core protocol.

## CLI and SDK separation

The CLI is a user interface over public SDK/API contracts. It provides stable structured output mode for automation, human-readable output separately, explicit nonzero exit mappings, and never emits secrets. The SDK exposes typed public models, validation results, and offline core-supported verification without requiring SQLite, local crypto, service, host, or a running server. Neither CLI nor SDK imports storage, local-key, host, server, or service implementation internals.

## Implementation technology decisions

Use the [canonical implementation technology-decision register](repository-architecture.md#canonical-implementation-technology-decision-register). It governs the API framework/OpenAPI generation stack, local endpoint and trust-reload authentication posture, remote exposure model, CLI/product configuration naming, and adapter diagnostics. These surfaces retain their stated constraints until the register’s owning phase approves a decision; in particular, no exception permits unauthenticated trust reload or changes the loopback default.

# ADR 0004: Loopback API, CLI/SDK, configurable naming, and adapters

**Status:** Accepted for documentation; proposed pending RFC review and Milestone 1 implementation approval.
**Date:** 2026-09-01

## Context

Local operations require an inspectable API and usable command line without exposing local state by default. SDK consumers and protocol integrations need stable boundaries that do not couple them to SQLite or private keys.

## Decision

Expose a typed loopback-only API by default. Split its public contract/client from server implementation: `api-contract` owns OpenAPI inputs and public models; `api-client` owns typed HTTP access; `api-server` binds routes only to service interfaces; `host-local` composes concrete storage, key, and provider implementations. Its stable error envelope, pagination, idempotency conventions, redaction rules, constrained trust reload, and future public routes/commands are recorded in [public surfaces](../architecture/public-surfaces.md). Remote exposure is opt-in and blocked until explicit security controls are designed and documented.

`agentctl` is the fallback CLI name pending naming checks. It and the SDK consume only `protocol`, exported offline core APIs, `api-contract`, and `api-client`; they never directly or transitively import service, host, server, storage, or local crypto. `config/product.json` controls display name, links, and visual tokens only; it does not alter domain namespaces, protocol bytes, algorithms, authorization, trust, or command fallback.

MCP, SPIFFE, and A2A are distinct optional adapters. They invoke shared core verification through service ports and preserve external standard ownership: MCP OAuth remains MCP/OAuth; SPIFFE workload identity stays distinct from agent/task/delegation identity; A2A transport/authentication remains A2A. `IdentityProvider`, `TrustProvider`, and `RuntimeEvidenceProvider` make that boundary explicit. Adapters must make unsupported or stripped proof propagation explicit and are not implementation work until their individual phase and standards-pin refresh gate.

## Alternatives considered

- **Network-reachable API by default:** helps remote administration but expands the attack surface before an auth/TLS/authorization design exists.
- **CLI accesses SQLite/key files directly:** avoids a server process but duplicates policy and can expose persistence/provider internals.
- **SDK imports service implementation:** expedites local use but prevents clean consumers and makes API compatibility opaque.
- **Treat adapters as core protocol support:** reduces apparent integration friction while creating standard-replacement and identity-collapse errors.
- **Brand names in package/domain identifiers:** looks consistent but makes rename/legal changes protocol and code changes.

## Consequences

- Local API and dashboard are first-class, testable contracts with explicit offline/error/redaction states.
- Remote operation, cross-origin browser access, authentication, and authorization are deliberately unresolved rather than accidentally enabled.
- Product rebranding can change presentation without changing security semantics or package identities.
- Each adapter brings its own compatibility fixtures, downgrade/stripping tests, and current primary-source review before release.

## Open implementation choices

The [canonical implementation technology-decision register](../architecture/repository-architecture.md#canonical-implementation-technology-decision-register) owns the owner, deadline, and exception treatment for API/OpenAPI, local endpoint authentication, remote exposure, CLI/product configuration, and adapter diagnostics. No exception permits unauthenticated trust reload or changes the loopback default.

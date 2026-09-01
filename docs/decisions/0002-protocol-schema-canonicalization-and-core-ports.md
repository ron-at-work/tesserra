# ADR 0002: Protocol schema source, canonical bytes, deterministic core, and ports

**Status:** Accepted for documentation; proposed pending RFC review and Milestone 1 implementation approval.
**Date:** 2026-09-01

## Context

Independent tools must reproduce bytes, key IDs, signing inputs, signatures, content IDs, and ordered decisions. JavaScript object behavior, permissive JSON parsers, and platform I/O must not alter security outcomes.

## Decision

The versioned protocol RFC is the normative source of wire semantics. Machine-readable schemas and conformance vectors live with `protocol` and are derived from/reviewed against that RFC; generated TypeScript types are convenience artifacts, never an independent authority. The schema representation remains an implementation choice, but it MUST express every RFC-required rejection and be validated by cross-language conformance tests.

The frozen RFC 0001 v1 wire profile uses the neutral project-defined Agent Proof namespace: wire version `agent-proof/v1`, `urn:agent-proof:*` identifiers, and `https://agent-proof.invalid/*` documentation/predicate identifiers. `https://agent-proof.invalid` is reserved documentation namespace, not a deployed service or discovery endpoint. It also uses the distinct `agid` scheme and `agid:v1:` display form for structured agent IDs. Neither namespace is a product name or package scope. The profile uses strict UTF-8 I-JSON parsing, duplicate-member rejection, RFC 8785 JSON Canonicalization Scheme for canonical JSON bytes, Ed25519 with pinned literal algorithm identifier `Ed25519`, deterministic public-key IDs, frozen domain-separated signing inputs, RFC 3339 UTC timestamps, and deterministic content IDs. Unknown protocol versions and critical semantics fail closed; ordinary extensions are explicitly versioned and cannot be silently reinterpreted.

`core` implements exactly one pure verifier pipeline in RFC 0001 §6, **Ordered verification and output**: **PARSE → VERSION → CRYPTO → TIME → TRUST → CHAIN → STATUS → BINDING → REPLAY**. It stops before later stages when a stage fails and uses the RFC’s within-stage code order for primary and secondary decision codes. `PARSE` performs only outer syntax/identity work: BOM-free UTF-8 and one JSON value, trailing-byte, duplicate-name, surrogate, and I-JSON rejection; malformed outer-envelope shape and common-field value types; base64url round-trip; and ID/key-ID derivation. `VERSION` then checks supported version, kind, algorithm, critical semantics, and resource type, **then validates the schema for that supported kind**. The verifier fails closed for unknown trust, status, policy operators, resource types, and security-relevant algorithms.

All nondeterminism and I/O arrive through typed ports. The service takes snapshots and invokes core; adapters and transports never fork the pipeline. The credential `authority_ceiling` is frozen as the cryptographic root authority grant: a locally trusted `human` or `service` issuer signs a bounded, nonempty constraints object for an agent subject and key. Delegations and requests can exercise only authority that is a strict attenuation of this root ceiling. The ceiling does not prove signer honesty, human consent, safe/correct execution, uncompromised runtime, an OAuth grant, or workload attestation; those remain distinct claims and cannot expand the ceiling.

## Alternatives considered

- **TypeScript interfaces as schema source:** fast to write but cannot establish interoperable parsing or non-TypeScript validation.
- **JSON.stringify / application-defined canonicalization:** widely available but ordering and number/string behavior are not a cross-tool security contract.
- **Verifier that reads storage, time, or network directly:** reduces call-site plumbing but prevents repeatability and offline testing.
- **Adapter-specific verification:** appears convenient for integrations but creates inconsistent acceptance criteria and downgrade paths.

## Consequences

- Every frozen protocol change needs RFC amendment, schema/vector updates, canonical intermediary fixtures, independent reproduction, and renewed approval.
- Validation may happen in both transport and protocol layers: early validation improves diagnostics, while core repeats security-critical validation.
- Core tests can be fixture-based, property-based, and deterministic. Network discovery, LLM calls, and cloud services are excluded from core verification.
- RFC 8785 canonicalization does not by itself define all protocol semantics; schema, duplicate rejection, I-JSON restrictions, limits, and signing preimages remain normative RFC responsibilities.

## Open implementation choices

The [canonical implementation technology-decision register](../architecture/repository-architecture.md#canonical-implementation-technology-decision-register) owns the owner, deadline, and exception treatment for schema/validation, parser, independent-reproduction, and future-binary choices. No exception may defer duplicate rejection or canonicalization checks; canonical JSON remains the sole v1 representation.

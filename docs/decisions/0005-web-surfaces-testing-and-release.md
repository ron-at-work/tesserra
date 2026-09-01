# ADR 0005: Separate web surfaces, testing/conformance, benchmarks, release, and compatibility

**Status:** Accepted for documentation; proposed pending RFC review and Milestone 1 implementation approval.
**Date:** 2026-09-01

## Context

The project has two audiences with materially different security and deployment needs: local operators and public readers. It also needs evidence that security-sensitive interoperability and performance claims are real.

## Decision

Keep dashboard and landing as separate applications, artifacts, deployment paths, and test suites. Dashboard is a typed `api-client` user for operations and evidence inspection; it cannot import, directly or transitively, server, service, storage, local-key, or host implementation modules. Landing is a public static documentation/marketing surface with strictly supportable claims. Enforce the quality, conformance, benchmark, release, and compatibility policy in [quality and release architecture](../architecture/quality-and-release-architecture.md).

Use protocol conformance vectors as a release artifact, property tests for monotonic delegation attenuation and adversarial boundaries, and independent canonicalization/crypto reproduction before protocol freeze. Publish benchmark results only when measured under recorded conditions. Generate SBOM, provenance, checksums, and signatures for release artifacts; verify from a clean clone/consumer.

## Alternatives considered

- **One web app with public and local routes:** reduces setup but risks privileged local concepts and marketing content crossing security/deployment boundaries.
- **Unit tests only:** quick feedback but no evidence of wire interoperability, migration safety, replay concurrency, or package-consumer behavior.
- **Benchmark claims without reproducible artifacts:** attractive for messaging but cannot support engineering or security decisions.
- **One version for protocol and all packages:** easy to explain but obscures wire compatibility from ordinary implementation changes.

## Consequences

- UI work cannot bypass the local API or conceal unavailable/invalid evidence.
- Releases take more automation and review, but evidence remains inspectable and consumers can distinguish protocol from package compatibility.
- Added protocol semantics require vectors and compatibility declarations, not only tests in the reference implementation.
- Dashboard and landing can fail/build/deploy independently without masking one another’s requirements.

## Open implementation choices

The [canonical implementation technology-decision register](../architecture/repository-architecture.md#canonical-implementation-technology-decision-register) owns the owner, deadline, and exception treatment for quality/benchmark tooling, web-surface technology, and release choices. No exception merges the applications or grants dashboard backend imports; an exception may allow an internal unsigned build only and never a public release.

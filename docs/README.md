# ATTEST documentation

Milestone 1 is a **documentation-only** gate. Plan approval authorizes these documents and the versioned conformance fixtures under [`tests/conformance/`](../tests/conformance/); it does not authorize protocol or product implementation. Implementation may begin only after the authoritative [Milestone 1 review checklist](milestone-1-review-checklist.md) is complete and a designated user explicitly approves it.

ATTEST is a replaceable working display name. It must not become a domain type, wire identifier, or internal package namespace.

## Navigation

| Area | Document | Status |
| --- | --- | --- |
| Requirements and delivery trace | [Requirements traceability](requirements-traceability.md) | Draft governance ledger |
| Implementation-unlock record | [Milestone 1 review checklist](milestone-1-review-checklist.md) | Authoritative; not approved |
| Repeatable mechanical audit | [Review guide](review/README.md) and [`run-milestone-1-review.sh`](review/run-milestone-1-review.sh) | Dependency-free support check |
| Normative protocol RFC | [RFC 0001: ATTEST Protocol Version 1](rfcs/0001-attest-v1-wire-protocol.md) | Project-defined MVP draft |
| Protocol schemas | [Protocol artifact index](protocol/README.md) and [`protocol/schemas/`](protocol/schemas/) | Documentation artifact |
| Versioned conformance fixtures | [`tests/conformance/README.md`](../tests/conformance/README.md) and [`tests/conformance/v1/`](../tests/conformance/v1/) | Allowed protocol artifact outside `docs/` |
| Threat model | [`security/threat-model.md`](security/threat-model.md) | Milestone evidence |
| Standards source register | [`standards/source-register.md`](standards/source-register.md) | Dated primary-source register |
| Standards capability and boundaries | [`standards/capability-matrix.md`](standards/capability-matrix.md) and [`standards/boundary-and-mapping.md`](standards/boundary-and-mapping.md) | Standards-gap evidence |
| Standards change watch | [`standards/open-questions-and-change-watch.md`](standards/open-questions-and-change-watch.md) | Refresh and unresolved-decision record |
| Repository architecture | [`architecture/repository-architecture.md`](architecture/repository-architecture.md) | Target package boundaries and deterministic-core direction |
| Data architecture | [`architecture/data-architecture.md`](architecture/data-architecture.md) | Local storage, trust/status lifecycle, retention, and key handling |
| Public surfaces | [`architecture/public-surfaces.md`](architecture/public-surfaces.md) | Loopback API, CLI, SDK, and adapter boundaries |
| Quality and release architecture | [`architecture/quality-and-release-architecture.md`](architecture/quality-and-release-architecture.md) | Conformance, testing, benchmark, compatibility, and release gates |
| Milestone-one gate architecture | [`architecture/milestone-one-gate.md`](architecture/milestone-one-gate.md) | Documentation-only boundary and freeze/amendment rule |
| Architecture decisions | [Decision index](decisions/README.md) and [ADRs 0001–0006](decisions/) | Accepted for documentation; implementation still blocked |

## Document status terms

- **Draft:** present but not accepted by the Milestone 1 review.
- **Verified:** reviewed against its stated acceptance evidence; still not implementation authorization.
- **Blocked:** cannot advance until its stated dependency is resolved.
- **Approved:** explicitly accepted in the [checklist approval record](milestone-1-review-checklist.md#approval-record). Only the complete Milestone 1 gate can unlock implementation.

## Review sequence

1. Maintain requirement-to-evidence mappings in the [traceability ledger](requirements-traceability.md) as RFC, security, standards, ADR, schema, and conformance work lands.
2. Run `bash docs/review/run-milestone-1-review.sh [base-ref]` from the repository root. It uses Bash, Git, and standard POSIX utilities only.
3. Resolve every open documentation finding, stale citation, unresolved decision, and unaccepted residual risk.
4. Have an independent reviewer reproduce canonicalization and signature results using [`tests/conformance/v1/`](../tests/conformance/v1/).
5. Record reviewer names, dates, and evidence locations, then obtain the user’s explicit approval in the [checklist](milestone-1-review-checklist.md).

The script is a mechanical aid. A passing run confirms only layout and change-scope checks; it does not replace human review, independent reproduction, or explicit approval.

## Scope boundary

Milestone 1 permits only approved `.md`, `.json`, `.sh`, and `.txt` artifacts under `docs/**` and versioned protocol conformance fixtures with those extensions under `tests/conformance/**`, plus a dependency-light Python verifier only at `tests/conformance/self-check.py` or `tests/conformance/v1/self-check.py`. Conformance fixtures are protocol evidence, not implementation tests or runtime dependencies. All implementation-shaped files elsewhere, and unsupported extensions inside the permitted paths, remain prohibited before approval, including package manifests/locks, source, migrations, generated SDKs, application scaffolding, build configuration, and runtime dependencies.

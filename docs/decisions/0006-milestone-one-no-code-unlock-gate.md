# ADR 0006: Documentation-only Milestone 1 gate

**Status:** Accepted for documentation; proposed pending RFC review and explicit user approval.
**Date:** 2026-09-01

## Context

Security-sensitive protocol and trust behavior cannot safely be inferred while implementation scaffolding creates momentum or locks incidental library choices. The approved plan explicitly separates documentation from implementation.

## Decision

Milestone 1 permits documentation and versioned protocol-vector fixtures only. Its approval gate, evidence checklist, freeze/amendment process, and current status are defined in [Milestone 1 documentation-only unlock gate](../architecture/milestone-one-gate.md). Implementation begins only after all required evidence is current and an explicit “Approved for implementation” sign-off is recorded.

The no-code audit is mandatory and checks both added files and repository configuration. Disallowed pre-approval artifacts include package manifests/lockfiles, source, application scaffolds, database migrations, generated SDKs, runtime dependencies, and generated implementation output.

## Alternatives considered

- **Scaffold now and fill in RFCs later:** may shorten perceived startup time but biases protocol decisions toward libraries and makes documentation review harder to enforce.
- **Approve each implementation package independently without a shared gate:** appears incremental but can freeze incompatible wire/trust behavior before vectors and threat controls align.
- **Treat plan approval as implementation approval:** contradicts the documented governing constraint and removes the required review checkpoint.

## Consequences

- The next work item is documentation evidence and review, not an application skeleton.
- Reviewers can reject or amend protocol/security semantics without code migration cost.
- Once approved, implementation phases remain gated cumulatively; a passed documentation gate does not waive later tests or adapter standards refreshes.

## Open implementation choices

The [canonical implementation technology-decision register](../architecture/repository-architecture.md#canonical-implementation-technology-decision-register) owns the owner, deadline, and exception treatment for Milestone 1 reviewers, approval records, documentation/no-code lint, and permitted fixture metadata. No exception can replace explicit approval or add source, package, migration, or generated SDK artifacts.

# Milestone 1 evidence review guide

This directory contains a dependency-free integrity guard for the approved TESSERRA Milestone 1 documentation and conformance evidence. U-12 is complete and Phase 1 implementation is authorized. The guard therefore validates the immutable evidence snapshot that approval covered; it does **not** inspect later Phase 1 source, package, dependency, tooling, or application changes as if they were Milestone 1 violations.

## Run

From the repository root:

```sh
bash docs/review/run-milestone-1-review.sh ae22dea
```

`ae22dea` is the recorded Milestone 1 evidence commit. It may be replaced only with an immutable review revision that has completed the required traceability, security, independent-reproduction, and approval process. The script archives that exact commit to a temporary directory, so uncommitted changes and later Phase 1 packages cannot alter its result.

The script needs Bash 4+, Git, `tar`, `sort`, `mktemp`, and `python3`; it adds no package or runtime dependency.

## What it checks

1. The recorded milestone commit contains only approved `.md`, `.json`, `.sh`, and `.txt` files under `docs/**` and `tests/conformance/**`, plus the exact approved Python self-check locations.
2. The required RFC, threat model, architecture records, standards evidence, ADRs, schemas, and conformance locations are present in that frozen snapshot.
3. The supplied dependency-light fixture self-check passes, including the credential-purpose, manifest, derivation-coverage, and cryptographic-integrity checks.

The guard preserves evidence integrity; it does not replace the independent review record or decide any future implementation gate. [`../milestone-1-review-checklist.md`](../milestone-1-review-checklist.md) remains the authoritative approval record.

## Fixture self-check discovery

When supplied at `tests/conformance/self-check.sh`, `tests/conformance/v1/self-check.sh`, `tests/conformance/self-check.py`, or `tests/conformance/v1/self-check.py`, the guard runs the snapshot's self-check. Bash checks run with Bash; the two exact Python paths run with `python3`. The verifier validates fixtures only and must reject legacy `credential_purpose: "agent-signing"`, values outside `agent-root-authority` and `agent-key-binding`, and manifest/schema/derivation-coverage or cryptographic-integrity defects.

The dependency-light self-check does not replace a full JSON Schema Draft 2020-12 evaluation. The independent review record captures the validator/version, command, schema roots, input set, exit status, and retained output. It distinguishes deliberately schema-invalid cases from schema-valid cases; see U-10 in the [implementation-unlock checklist](../milestone-1-review-checklist.md).

## Human review record

Reviewers used the checklist to verify citation freshness, normative completeness, independent canonicalization/key-ID/signature reproduction, conformance coverage, threats, unresolved decisions, residual risks, and explicit user approval. The U-12 wording is accepted and remains complete. Future changes to frozen wire bytes, trust semantics, decision precedence, or declared adapter status require the RFC amendment and renewed review process stated in the checklist.

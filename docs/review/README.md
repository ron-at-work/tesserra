# Milestone 1 review guide

This directory contains a no-dependency mechanical audit for the ATTEST documentation-only milestone. It allows only approved `.md`, `.json`, `.sh`, and `.txt` documentation artifacts under `docs/**` and versioned protocol conformance fixtures with those extensions under `tests/conformance/**`. The only Python exception is a dependency-light fixture verifier at exactly `tests/conformance/self-check.py` or `tests/conformance/v1/self-check.py`. It flags all changed files elsewhere and unsupported extensions inside those paths, including likely implementation, dependency, build, migration, generated-SDK, and application-scaffold artifacts. The script does not alter the repository.

## Run

From the repository root:

```sh
bash docs/review/run-milestone-1-review.sh <approved-base-ref>
```

Use the commit immediately preceding Milestone 1 work as `<approved-base-ref>`. If there is no commit yet, omit the argument to audit untracked and working-tree files:

```sh
bash docs/review/run-milestone-1-review.sh
```

The script needs Bash 4+, Git, `sort`, and `mktemp`, which are standard development-environment tools. It adds no package or runtime dependency.

## What it checks

1. Milestone changes are limited to approved `.md`, `.json`, `.sh`, and `.txt` files under `docs/**` and `tests/conformance/**`.
2. The actual RFC, threat model, five architecture documents, standards index/research/source/boundary/scenario/change-watch/matrix evidence, six ADRs and index, protocol schemas, and conformance fixture locations are present.
3. The [traceability ledger](../requirements-traceability.md) and authoritative [implementation-unlock checklist](../milestone-1-review-checklist.md) are present.

A successful run means the mechanical layout, change-scope, and supplied fixture self-check passed. The enhanced `v1/self-check.py` and guard must reject legacy `credential_purpose: "agent-signing"` values and any purpose outside `agent-root-authority` or `agent-key-binding`, plus schema-subset, manifest, derivation-coverage, and cryptographic-integrity defects. It intentionally does **not** decide implementation readiness, and it does not fail merely because human-review records remain open. The milestone remains blocked until the checklist's independent review and explicit approval checks are completed.

## Fixture self-check discovery

When a dependency-light self-check is supplied at `tests/conformance/self-check.sh`, `tests/conformance/v1/self-check.sh`, `tests/conformance/self-check.py`, or `tests/conformance/v1/self-check.py`, the guard runs it before reporting success. Bash checks run with Bash; the two exact Python paths run with `python3`. The supplied verifier must validate fixtures only, require no added dependency, and exit nonzero on legacy `credential_purpose: "agent-signing"` values, any other disallowed credential-purpose value, schema-subset, manifest, derivation-coverage, or cryptographic-integrity defects. The guard separately checks JSON fixture instances and schema property enums, allowing only `agent-root-authority` and `agent-key-binding`. Python remains forbidden everywhere else.

The dependency-light self-check cannot replace full JSON Schema Draft 2020-12 evaluation. The independent-review record must capture a real Draft 2020-12 validator's name/version, command, schema roots, fixture inputs, exit status, and retained output. Record separately the manifest inputs deliberately expected to be schema-invalid: `cases/trust-snapshot-invalid.json`, `cases/unsupported-algorithm.json`, `cases/unsupported-critical.json`, `cases/unsupported-kind.json`, `cases/unsupported-resource-type.json`, `cases/unsupported-version.json`, `cases/untrusted-issuer.json`, and all five `malformed/` inputs. All other manifest inputs must validate against `case-envelope.schema.json`; see U-10 in the [implementation-unlock checklist](../milestone-1-review-checklist.md) for the exact expected invalid condition per file. Independent reproduction remains a separate human review requirement.

## Human checklist

[`../milestone-1-review-checklist.md`](../milestone-1-review-checklist.md) is the authoritative review and approval record. Reviewers must manually verify:

- citation freshness, source maturity labels, and immutable links;
- RFC/ADR normative completeness and exact requirement mapping;
- independent canonicalization/key-ID/signing/signature reproduction from [`../../tests/conformance/v1/`](../../tests/conformance/v1/);
- conformance coverage and expected ordered outcomes;
- threats, untestable assumptions, unresolved decisions, and residual risks;
- explicit user approval after all other checks pass.

A clean script run is supporting evidence only. It cannot substitute for any of these judgments.

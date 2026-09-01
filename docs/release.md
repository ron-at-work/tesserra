# Release status and process

## Current public status

There is **no published package distribution or supported production release** at this time. The repository is available as source. The `0.1.0` changelog entry and GitHub release workflow record release-preparation work; they do not establish that a tag, package, application artifact, attestation, SBOM, or provenance statement has been published.

Until a release is published and documented here, evaluate a pinned source commit and run the repository checks. Do not treat an unreleased branch, a workflow definition, or generated `dist/` output as a supported release artifact.

## Release candidate gate

A candidate starts from a clean, reviewed commit and must pass:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:clean-clone
corepack pnpm benchmark
```

Before publication, confirm changelog and compatibility notes, dependency/license/secret scans, adapter source pins where applicable, and tested examples. A protocol acceptance, canonicalization, or decision-precedence change requires an RFC amendment or a new protocol version; it is not an ordinary package patch.

## Planned release artifacts

The tag-triggered release workflow is intended to build workspace packages and all three applications (landing, dashboard, and docs site), then attach the following to a GitHub release:

- `SHA256SUMS` for selected `dist/` files;
- a CycloneDX SBOM;
- an in-toto/SLSA provenance statement; and
- GitHub artifact attestations for the release assets.

When those artifacts are published, verify the checksum first:

```sh
sha256sum --check SHA256SUMS
```

Then independently verify the selected provenance or attestation against the repository, workflow, commit, and release tag. Supply-chain evidence does not replace protocol verification or local trust policy.

## Versioning

- Protocol wire version (`agent-proof/v1`) is independent of package versions.
- Package versions communicate API and tooling compatibility.
- SQLite migration versions are independent from both.
- Landing, dashboard, and docs site build and deploy independently and keep separate dependency boundaries.

## Publishing runbook

1. Add a versioned section to [CHANGELOG.md](../CHANGELOG.md).
2. Run and preserve the candidate-gate output above.
3. Create and push an annotated `v*` tag from the reviewed commit.
4. Review the generated release assets, checksums, SBOM, provenance statement, and artifact attestations before publishing the GitHub release.
5. Publish packages only through approved registry credentials and provenance settings; do not move reviewed tags.
6. Record supported protocol versions, migrations, breaking API changes, and adapter compatibility in the release notes.

Private keys, passphrases, raw nonces, and unredacted evidence must never be release assets.

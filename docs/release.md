# Release and supply-chain process

This document governs release setup for publishable packages and application artifacts. It does not claim a package or application has been published.

## Preconditions

A release candidate must start from a clean, reviewed commit and pass the repository gate:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm lint
corepack pnpm build
corepack pnpm typecheck
corepack pnpm test
corepack pnpm test:clean-clone
corepack pnpm benchmark
```

Before publishing, confirm protocol/package/database compatibility notes, changelog entries, dependency/license/secret scans, adapter source pins where applicable, and tested examples. A protocol acceptance/canonicalization/decision-precedence change requires an RFC amendment or new protocol version; it is not an ordinary package patch.

## Artifacts

The release workflow builds every workspace package and both applications before typechecking, then publishes package and application `dist/` directories with a `SHA256SUMS` file, a CycloneDX SBOM, and an in-toto/SLSA provenance statement. Their checksums are signed using GitHub artifact attestation in the trusted CI context. Verify checksums before consuming downloaded artifacts:

```sh
sha256sum --check SHA256SUMS
```

Consumers must independently verify the selected artifact attestation/provenance against the repository, workflow, commit, and release tag. Treat an artifact signature as supply-chain evidence; it does not replace protocol verification or local trust policy.

## Versioning

- Protocol wire version (`agent-proof/v1`) is independent of package versions.
- Package versions communicate API/tooling compatibility.
- SQLite migration versions are independent from both.
- Dashboard and landing build/deploy independently and retain their separate dependency boundaries.

## Release runbook

1. Draft the release with a versioned section in [CHANGELOG.md](../CHANGELOG.md).
2. Run the preconditions above on the candidate commit and preserve outputs.
3. Create and push an annotated `v*` tag. The GitHub release workflow is tag-triggered and uses minimal write/attestation permissions.
4. Review release assets, checksum file, SBOM, provenance statement, and CI artifact attestations before publishing the GitHub release.
5. Record any supported protocol versions, migrations, API breaking changes, and adapter compatibility in the release notes.
6. Publish packages only through the organization’s approved registry credentials and provenance settings; do not move unreviewed tags.

Private keys, passphrases, raw nonces, and unredacted evidence are never release assets.

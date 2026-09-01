# ADR 0003: Encrypted local keys, SQLite persistence, and lifecycle

**Status:** Accepted for documentation; proposed pending RFC review and Milestone 1 implementation approval.
**Date:** 2026-09-01

## Context

The local reference implementation needs durable identity, trust, delegation, status, replay, and audit state without exposing private keys or turning SQLite into an implicit security boundary.

## Decision

Use SQLite through `storage-sqlite` as the default local store, with immutable checked migration records, foreign keys, transactional authority/status updates, and atomic replay uniqueness. Use `crypto-local` as the default encrypted local `KeyProvider`; SQLite holds opaque provider references and public key metadata only. The normative table-level classification, retention expectations, trust snapshot identity/policy-hash/sequence controls, publisher high-water/predecessor controls, key history, and migration controls are in [data architecture](../architecture/data-architecture.md).

Canonical signed artifacts are preserved exactly with a digest; derived views never replace their canonical evidence. Trust and revocation snapshots include provenance/hash/sequence sufficient for policy-defined historical verification. Event records are redacted evidence, not a secret-bearing request dump.

## Alternatives considered

- **Filesystem JSON state:** easy to inspect but inadequate for concurrent replay consumption, migration history, and transactional status changes.
- **Private key blobs in SQLite:** simplifies lookup but makes backups, SQL diagnostics, and database compromise private-key disclosure paths.
- **Remote managed database/KMS as the baseline:** may aid enterprise deployment, but violates the local/offline reference baseline and adds cloud trust dependencies.
- **No persistence for replay/events:** simpler but cannot enforce online one-time use or provide evidence/provenance.

## Consequences

- The local filesystem, process account, backup destination, and unlock material remain explicit threat-model boundaries.
- SQLite tampering is mitigated by filesystem controls, migration integrity, signed artifacts, and trust/status validation, not assumed impossible.
- Secure deletion, backup retention, recovery, and OS keystore behavior are deployment-specific and must be documented before release.
- A future storage/provider implementation can satisfy the same ports, but cannot alter core verifier semantics or accept status rollback/forks.

## Open implementation choices

The [canonical implementation technology-decision register](../architecture/repository-architecture.md#canonical-implementation-technology-decision-register) owns the owner, deadline, and exception treatment for storage, retention, backups, key encryption/KDF, keystore/recovery, and archival choices. No exception permits plaintext private-key storage or silent downgrade of historical verification.

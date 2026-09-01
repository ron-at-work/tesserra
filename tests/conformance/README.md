# Agent Proof v1 conformance fixtures

These are documentation/conformance artifacts only. `v1/cases/` contains
complete deterministic verification inputs; `manifest.json` indexes expected
primary/secondary codes and threat-family coverage. `metadata/derivations.json`
contains every artifact's RFC 8785 semantic bytes, SHA-256 digest, exact signing
preimage, signature, public JWK/key ID, and reproducible public test-key seed
derivation. `malformed/` must be parsed as raw bytes before normal JSON loading.

Fixtures use a fixed nonce and deterministic test-only keys solely to reproduce
bytes. They MUST NOT be copied into production nonce/key generation.

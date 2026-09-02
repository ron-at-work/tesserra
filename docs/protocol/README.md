# Agent Proof Protocol artifacts

TESSERRA is a display name only. The neutral signed/wire namespace is
`https://agent-proof.invalid`; all v1 values use `agent-proof/v1` and
`urn:agent-proof:*`. This is a reserved documentation namespace, not a network
endpoint or trust-discovery mechanism.

The normative contract is [RFC 0001](../rfcs/0001-tesserra-v1-wire-protocol.md).
`schemas/` are project-defined Draft 2020-12 documentation schemas. Schema
shape does not replace strict raw parsing, RFC 8785, deterministic derivation,
Ed25519 verification, local trust, or ordered verification from the RFC.

External standards: RFC 3339, 4648, 7493, 8032, 8037, 8785, and 9562. Future
SPIFFE/SPIRE, OAuth/OIDC, MCP, A2A, provenance/transparency mappings are
non-equivalent adapters, outside v1 conformance.

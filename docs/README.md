# ATTEST documentation

ATTEST is a configurable display name, not a protocol identifier, package namespace, or domain type. The repository is source-available but has no published package distribution or supported production release. Start with the interfaces and status pages below; the RFC and conformance materials define the protocol evidence.

## Start here

- [Docs site source](../apps/docs/), a separately built documentation application (`corepack pnpm dev:docs`)
- [Quick start: verify local identity/trust and delegated-request evidence](guides/quick-start.md)
- [API and SDK index](api/README.md): [CLI](api/cli.md), [local API](api/local-api.md), and [SDK](api/sdk.md)
- [Examples index](../examples/README.md), including [delegated request verification](../examples/delegated-request/README.md)
- [Adapter boundaries](adapters/README.md)
- [Roadmap and current implementation status](guides/roadmap.md)
- [Release status and process](release.md)
- [Security policy](../SECURITY.md) and [contributing guide](../CONTRIBUTING.md)

## Protocol and architecture

| Area                           | Document                                                                                                                                                 | Status                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| Normative protocol             | [RFC 0001: Protocol Version 1](rfcs/0001-attest-v1-wire-protocol.md)                                                                                     | Project-defined MVP RFC               |
| Protocol schemas               | [Protocol artifact index](protocol/README.md)                                                                                                            | Versioned protocol material           |
| Conformance fixtures           | [`tests/conformance/v1/`](../tests/conformance/v1/)                                                                                                      | Deterministic verification evidence   |
| Threat model                   | [Threat model](security/threat-model.md)                                                                                                                 | Security analysis and residual limits |
| Standards boundaries           | [Capability matrix](standards/capability-matrix.md) and [boundary mapping](standards/boundary-and-mapping.md)                                            | Dated standards-gap analysis          |
| Source pins and change watch   | [Source register](standards/source-register.md) and [change watch](standards/open-questions-and-change-watch.md)                                         | Refresh before adapter work           |
| Repository and public surfaces | [Repository](architecture/repository-architecture.md), [data](architecture/data-architecture.md), and [public surfaces](architecture/public-surfaces.md) | Architecture decisions and boundaries |
| Quality and release            | [Quality and release architecture](architecture/quality-and-release-architecture.md)                                                                     | Gate and compatibility policy         |
| Decisions                      | [Decision index](decisions/README.md)                                                                                                                    | Accepted decisions                    |
| Requirements trace             | [Traceability ledger](requirements-traceability.md)                                                                                                      | Delivery evidence                     |

## Reading status accurately

- **Implemented:** current source and repository tests back the named capability.
- **Partial:** a bounded implementation or evidence exists, but the phase gate or complete public workflow does not.
- **Planned:** an intended capability with no supported public release; do not depend on it.
- **Draft:** requires the review or acceptance named in its document.

## Documentation checks

Run `corepack pnpm check:docs` to validate local Markdown links, navigation pages, and checked example commands. `corepack pnpm lint` includes this check. See [benchmarking](guides/benchmarking.md) for the measured-only benchmark policy.

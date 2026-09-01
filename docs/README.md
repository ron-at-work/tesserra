# ATTEST documentation

ATTEST is a replaceable display name. Presentation configuration must not become a protocol identifier, package namespace, or domain type. The protocol RFC, security model, and conformance fixtures define what is normative; guides and public-surface references describe shipped behavior and clearly label planned interfaces.

## Start here

- [Quick start: local identity/trust and delegated-request verification](guides/quick-start.md)
- [Delegation and signed-request lifecycle](guides/delegation-and-requests.md)
- [CLI, local API, and SDK reference](api/README.md)
- [Adapter boundaries](adapters/README.md)
- [Roadmap and repository status](guides/roadmap.md)
- [Release and supply-chain process](release.md)

## Architecture and protocol

| Area                            | Document                                                                                                                                                 | Status                                      |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Normative protocol              | [RFC 0001: Protocol Version 1](rfcs/0001-attest-v1-wire-protocol.md)                                                                                     | Project-defined MVP RFC                     |
| Protocol schemas                | [Protocol artifact index](protocol/README.md)                                                                                                            | Protocol artifact                           |
| Conformance fixtures            | [`tests/conformance/v1/`](../tests/conformance/v1/)                                                                                                      | Versioned deterministic evidence            |
| Threat model                    | [Threat model](security/threat-model.md)                                                                                                                 | Security evidence                           |
| Standards boundaries            | [Capability matrix](standards/capability-matrix.md) and [boundary mapping](standards/boundary-and-mapping.md)                                            | Dated standards-gap evidence                |
| Source pins/change watch        | [Source register](standards/source-register.md) and [change watch](standards/open-questions-and-change-watch.md)                                         | Must refresh before adapter work            |
| Repository/data/public surfaces | [Repository](architecture/repository-architecture.md), [data](architecture/data-architecture.md), and [public surfaces](architecture/public-surfaces.md) | Architecture decisions and phase boundaries |
| Quality and release             | [Quality and release architecture](architecture/quality-and-release-architecture.md)                                                                     | Gate and compatibility policy               |
| Decisions                       | [Decision index](decisions/README.md)                                                                                                                    | Accepted decisions                          |
| Requirements trace              | [Traceability ledger](requirements-traceability.md)                                                                                                      | Delivery evidence                           |

## Status terms

- **Implemented:** backed by current package code and repository tests.
- **Evidence present:** RFC/schema/conformance support exists, but the named public surface is not released.
- **Planned/future:** phase boundary only; do not depend on it.
- **Draft:** requires review/acceptance stated in its document.

## Documentation checks

Run `pnpm check:docs` to validate local Markdown links, required navigation pages, and the checked example commands. `pnpm lint` includes that check. See [benchmarking](guides/benchmarking.md) for the measured-only benchmark policy.

# TESSERRA standards-gap research

**Research snapshot:** 2026-09-01 UTC  
**Scope:** Milestone 1 documentation only. This directory describes interoperability and boundary decisions; it introduces no executable implementation, protocol wire contract, or claim of standards endorsement.

## Contents

| Document                                                              | Purpose                                                                                                        |
| --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| [Research method](research-method.md)                                 | Evidence rules, status taxonomy, date discipline, and limitations.                                             |
| [Source register](source-register.md)                                 | Dated, version-pinned primary sources and the claims for which each is used or explicitly not used.            |
| [Capability matrix](capability-matrix.md)                             | Capability-by-capability comparison and **Reuse / Map-profile / Avoid reimplementation / Define** disposition. |
| [Boundary and mapping](boundary-and-mapping.md)                       | Protocol-neutral concepts, non-equivalence rules, and MCP/SPIFFE/A2A adapter boundaries.                       |
| [Scenarios](scenarios.md)                                             | Concrete boundary scenarios and expected evidence ownership.                                                   |
| [Open questions and change watch](open-questions-and-change-watch.md) | Decisions deliberately deferred, draft status, and refresh triggers.                                           |

## Status vocabulary

This directory uses these terms precisely:

- **Standard / BCP / Recommendation:** a published specification with that maturity in its issuing body. It is not an endorsement by TESSERRA.
- **Internet-Draft:** an IETF work-in-progress. It is **not** an IETF standard and may expire, be replaced, or change incompatibly.
- **Project specification / product documentation:** first-party material published by a project or vendor. It is not a standard unless the source itself has a formal standards status.
- **TESSERRA proposal:** a project-specific idea required to fill a documented gap. It has no external standards status.

The [source register](source-register.md) is authoritative for a source's exact revision/status and avoids treating a mutable `latest` page as a pin.

## Principal-type guardrail

Every mapping and scenario keeps these five things separate:

1. **Human/service authority** — the person or non-agent service principal that is authorized by local policy or an authorization server.
2. **Logical agent** — a stable, protocol-level agent identity or role. It may be represented by a project identifier, DID/VC, or a future TESSERRA identity record; it is not automatically a workload.
3. **Workload/runtime** — the executing process or environment. A SPIFFE ID/SVID can authenticate it, but does not prove task authority or logical-agent ownership by itself.
4. **OAuth client** — the client identifier registered with an authorization server. It identifies a client in that OAuth deployment; it is not a universal agent identifier.
5. **Model identity** — the model/version/provider configuration used for an invocation. It is execution/provenance metadata, not an authority-bearing principal unless a policy explicitly says otherwise.

No equality, substitution, or automatic derivation is implied between these types. A binding assertion must state its issuer, evidence, validity period, and relying-party policy.

## Bottom line

TESSERRA should compose existing workload authentication, OAuth/OIDC authorization, and agent-to-agent transport rather than replace them. The narrow project-defined gap is portable, deterministic verification of an explicit chain tying local-policy authority, a logical agent, a bounded task/action/resource context, runtime-evidence, and provenance references. That gap is frozen in the project RFC, not an external standard; changes require its amendment and remain subject to the Milestone 1 approval gate.

# Research method and evidence policy

**Snapshot and final status check:** 2026-09-01 UTC. All web sources were retrieved on that date unless a source row says otherwise. Active IETF draft status was rechecked on the same date. This method follows the Milestone 1 requirement to resolve mutable pages to an exact release, revision, or dated snapshot where an immutable source exists.

## Questions investigated

1. Which published specifications already own workload identity, authorization, token binding, task transport, provenance, revocation, and transparency?
2. Which agent-oriented materials are standards, drafts, project specifications, or product documentation?
3. What remains that cannot safely be inferred from those materials: typed principal separation, cross-system delegation attenuation, task-bound evidence, deterministic evidence verification, and provenance linkage?
4. Where must an TESSERRA integration stop to avoid reimplementing SPIFFE/SPIRE, OAuth/OIDC, MCP, A2A, PKI, or an authorization server?

## Source selection and verification

1. Started from normative publishers: RFC Editor/IETF Datatracker, W3C, official protocol/project repositories, official product documentation, and official release records.
2. Used search results only to locate candidate primary sources. No secondary publication supports a normative claim in this directory.
3. For repository-hosted specifications, recorded a release tag when available and a full Git commit as the immutable retrieval target. For RFCs and dated W3C Recommendations, the publication identifier/date is immutable. For vendor documentation with no versioned URL, recorded the first-party canonical URL, retrieval date, and a web-header revision signal when available.
4. Compared each capability against the owning source's stated scope. Absence from a source is not proof of impossibility; it is recorded only as a design gap for this project.
5. Rechecked Internet-Draft titles, intended status, revision number, expiry, and date from the archived text. Drafts are labelled **Internet-Draft**, including ones with an intended status of Standards Track.

## Evidence and citation conventions

Citations use source IDs such as **[O-12]**. The source register supplies title, owner, exact version/revision, maturity, dates, canonical and immutable URLs, relevant sections, use, and non-use. A source reference in a table identifies the evidence basis for that row, not an assertion that the owner endorses TESSERRA.

“Must,” “should,” and similar terms describe a cited source only when the source is normative. TESSERRA design language in this directory is deliberately marked **proposed** and will need a protocol RFC before it becomes normative for the project.

## Maturity criteria for additional candidates

Agent-oriented candidates were included only when they met at least two of: (a) a first-party specification/schema or protocol text; (b) a published release or dated revision; (c) a defined identity/delegation mechanism rather than marketing claims; (d) an identifiable operator/governance body; and (e) relevance to the five principal types. The selected additional candidates are A2A (released project protocol), W3C DID/VC (published Recommendations used by AGNTCY), and SLSA/in-toto (published provenance formats). They are comparison inputs, not required integrations.

## Known limitations

- A documentation snapshot cannot establish deployed interoperability, implementation conformance, security fitness, or endorsement.
- The MCP 2026-07-28 release is pinned. Its authorization specification is a protocol-project specification that profiles OAuth; OAuth 2.1 itself remains an Internet-Draft at this snapshot.
- Vendor pages and project `main` branches may change after retrieval. The register uses immutable commits/releases where the project provides them, and the change watch names all mutable sources needing a refresh before implementation.
- Privacy, human consent, policy semantics, and resource-owner authorization remain deployment and local-policy questions even where a standard carries tokens or claims.

## Reproducible review procedure

Before an adapter or protocol decision: (1) resolve each project link to a release/tag/commit; (2) confirm IETF state at Datatracker and retrieve the exact draft text; (3) compare required claims against the capability matrix; (4) update the source register and change-watch log; (5) record any changed disposition in a decision/RFC amendment. Do not infer a logical agent, human authority, or model identity solely from a client ID, token subject, runtime credential, or transport connection.

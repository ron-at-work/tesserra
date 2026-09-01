# Reuse, mapping, and adapter boundary

## Position

ATTEST is a project-defined evidence-verification layer, not a replacement for identity, PKI, OAuth/OIDC, MCP, A2A, SPIFFE/SPIRE, authorization servers, policy engines, or provenance standards. The following boundary is intentional:

| Function | Owner | ATTEST action |
| --- | --- | --- |
| Authenticate workload/process and rotate workload credentials | SPIFFE/SPIRE or equivalent platform | Consume verified runtime-evidence through an adapter. |
| Authenticate end user and authorize resource access | OAuth/OIDC authorization server and resource server | Consume issuer-scoped token/claim facts; do not issue grants or decide consent. |
| Discover and call MCP tools | MCP client/server and their OAuth profile | Preserve MCP authorization requirements; optionally attach separate proof only through a future explicit binding. |
| Discover/call peer agents and maintain task lifecycle | A2A peers | Preserve A2A schemas/security declarations; negotiate an optional evidence extension rather than changing task semantics. |
| Model agent/task provenance | PROV / in-toto / DSSE (and optionally SCITT) | Export or map verified facts to these structures; do not regard them as authorization. |
| Verify a bounded chain of project evidence | ATTEST project-defined RFC under local policy | Parse, verify signatures and source references, check typed bindings/attenuation/status/replay, and return a deterministic result. |

## Protocol-neutral concepts proposed for ATTEST

These concepts are intentionally abstract. Names, bytes, algorithms, and field formats are frozen by RFC 0001; this standards analysis records why they remain project-defined rather than external-standard claims.

| Concept | Required typed content | What it is not |
| --- | --- | --- |
| Authority reference | Kind (`human` or `service`), issuer/local-policy namespace, immutable subject reference, evidence reference | A claim that a human and agent are the same principal. |
| Logical-agent reference | Stable agent namespace/identifier, issuer or self-certifying key reference, validity | A SPIFFE ID, OAuth client ID, A2A endpoint, or model label by default. |
| Runtime evidence reference | Attester/issuer, workload identifier, credential/key reference, verification time, trust-domain context | Proof of delegation, user consent, or a logical-agent identity. |
| OAuth-client reference | Authorization-server issuer, client ID, registration/deployment context | A portable identity or a resource owner. |
| Model provenance reference | Provider/model/version/config or artifact digest, collection method, observation time | A signing key or authority-bearing identity. |
| Delegation link | Parent ID, delegator and delegate typed references, exact allowed actions/resources/task/audiences/validity/depth, signer/trust reference | OAuth token issuance, impersonation, or unrestricted agency. |
| Task context | Immutable task definition or digest, input/output references, target resource/audience, transport-specific task IDs as annotations | A mutable display name or URL accepted as authorization evidence. |
| Verification record | Inputs, source verification observations, pinned local trust/policy/status snapshot identifiers and hash, ordered result codes | A statement that an external source endorses the decision. |
| Credential constraint / root ceiling | Trusted issuer/key and exact maximum authority dimensions: subject type, actions, resources, task, audience, validity, remaining depth | Authority inferred from a signature, SPIFFE ID, OAuth client, Agent Card, model label, or network location. |
| Request/task-context digest | RFC 8785 canonical semantic payload/context and domain-separated digest; transport task/message ID only as an optional annotation | A mutable task ID, URL, display name, or ordinary transport correlation ID accepted as signed authority context. |

The frozen wire namespace is neutral and project-defined: `agent-proof/v1` is the artifact/version namespace; `urn:agent-proof:*` identifies project artifacts and keys; and `https://agent-proof.invalid/*` is the project schema/predicate namespace. `agid:v1` is reserved only for structured logical-agent IDs. The working display name is not a wire identifier. The project-defined envelope strictly parses I-JSON, canonicalizes with RFC 8785, pins literal `Ed25519`, uses public OKP JWK shape, and domain-separates its signing/hash inputs [CRYPTO-05–CRYPTO-13]. It is not JWS, DSSE, or an assertion of a new external standard.

A relation between concepts is always an explicit assertion: `authority delegated to logical agent`, `logical agent executed in runtime`, `OAuth client was used by runtime`, or `model configuration was observed for activity`. Each must identify the claim issuer, evidence, validity, and local policy. No relation is inferred from matching strings, shared keys, endpoint control, or co-location.

## MCP adapter boundary

Pinned baseline: MCP `2026-07-28` [M-01–M-02]. MCP servers are OAuth resource servers in that specification: Protected Resource Metadata enables authorization-server discovery; clients use resource indicators; the profile requires appropriate PKCE, issuer, and audience/resource validation. These remain MCP/OAuth responsibilities.

A future adapter may:

1. validate MCP/OAuth normally first;
2. derive a canonical, typed resource/audience and tool/action context from the already parsed MCP request;
3. carry an **additional**, versioned ATTEST proof only in a documented MCP extension/binding mechanism;
4. bind the proof to the exact request/task/content digest and expected resource; and
5. fail clearly when the peer cannot negotiate, preserve, or verify the proof.

It must not:

- replace MCP OAuth tokens with ATTEST evidence;
- treat a client ID, token `sub`, `act`, or MCP connection as a logical agent without an explicit binding;
- silently accept stripped/unknown proof fields as verified provenance; or
- use authorization-server metadata as an ATTEST trust-anchor discovery mechanism.

## SPIFFE/SPIRE adapter boundary

Pinned baseline: SPIFFE revision `dc4e9d9…6060`, SPIRE `v1.15.3` [S-01–S-06]. A future adapter obtains X.509-SVIDs or JWT-SVIDs and bundles using the Workload API, validates them under SPIFFE rules, and creates a `runtime-evidence` reference containing the SPIFFE ID, issuer/trust domain, credential/key reference, audience (for JWT-SVID), and verification time.

The adapter must retain the distinction:

- **SPIFFE ID:** authenticated workload identity;
- **logical agent:** a separately bound agent role/identity;
- **authority:** a human/service policy subject;
- **OAuth client:** OAuth registration context; and
- **model:** provenance metadata.

SPIFFE federation is not authorization/delegation federation. SVID rotation or workload re-attestation affects runtime-evidence freshness; it neither revokes nor creates an ATTEST authority chain by itself.

## A2A adapter boundary

Pinned baseline: A2A `v1.0.1` and its `a2a.proto` [A-01–A-02]. Agent Cards advertise endpoints, capabilities, and supported security schemes. Their optional signatures are card-integrity/publisher evidence under the A2A verification profile—not live task authorization. A2A task IDs, messages, artifacts, and state are transport/task objects, not automatically immutable authorization context.

A future adapter may negotiate a separate extension containing an ATTEST evidence reference/proof and bind it to the A2A task/message/artifact digest plus intended audience/resource. It must preserve A2A's own authentication scheme and task lifecycle. It must explicitly report unsupported negotiation, stripping, or verification failure instead of treating an ordinary A2A success as an ATTEST-verified action.

## Provenance and transparency boundary

Use PROV's Entity–Activity–Agent graph vocabulary for conceptual mappings [P-01–P-02]. The frozen RFC selects a **project-defined provenance artifact/predicate** with in-toto-like statement/subject separation; it does not adopt DSSE or claim in-toto conformance [P-03–P-04]. Any future export may profile in-toto/DSSE separately, preserving its exact signing construction. The project predicate records typed authority, logical-agent, runtime, task, action, input/output digest, and verifier outcome references. It must preserve source identity and validity rather than flattening them into an untyped “agent.”

SCITT RFC 9943 describes an architecture for transparent supply chains [P-06]. It is relevant only if a future deployment needs independently observable publication of evidence. A log receipt/registration is not authorization, does not validate a claim's truth, and is not required for local deterministic verification.

## Explicitly avoided reimplementation

ATTEST core will not implement: SVID issuance/attestation, X.509/JWT trust bundle distribution, OAuth authorization endpoints/grants/token exchange/introspection/revocation, OIDC authentication, generic policy language, MCP transport/authentication, A2A protocol/task service, DID method resolution, VC ecosystem verification profiles, SCITT logs, or a general provenance database. Adapters may depend on and verify outputs from these systems under pinned, local policy.

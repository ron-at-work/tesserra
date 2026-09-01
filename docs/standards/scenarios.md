# Boundary scenarios

These scenarios are design tests for the proposed boundaries. They do not prescribe a wire format or claim that any cited protocol natively supplies ATTEST semantics.

## 1. Local interactive agent invokes an MCP tool

**Actors:** a human authority, a local logical agent, a local runtime, an OAuth client, an MCP server/resource, and an optional model configuration.

1. The runtime proves its workload identity using a locally verified SVID or platform mechanism [S-02–S-06].
2. The user authenticates and authorizes the OAuth client under the authorization server's policy. The MCP client/server perform the MCP OAuth profile, including resource and issuer handling [M-01, O-04, O-09, O-12].
3. Local policy creates or recognizes a bounded authority-to-logical-agent delegation assertion. Any evidence of user authorization remains an OAuth/OIDC reference; ATTEST does not mint a token.
4. The frozen ATTEST verifier binds the intended tool/action, canonical resource, task-context digest, audience, expiry, logical-agent reference, and runtime-evidence reference.
5. If an optional MCP binding is negotiated, the proof is additional to—not a replacement for—the OAuth access token.

**Decision boundary:** a valid SVID does not establish user consent; a valid OAuth token does not establish which model/routine acted; a matching `client_id` does not establish a logical agent. If the proof is absent or stripped, the MCP request can follow MCP/OAuth policy but must not be reported as ATTEST-verified.

## 2. Service authority delegates through two agents to an A2A peer

**Actors:** a service authority, orchestrator logical agent, specialist logical agent, two runtimes, an A2A task/resource, and optional OAuth sender constraints.

1. The service authority's local policy creates a first delegation with exact action, resource, audience, task digest, expiry, and maximum depth.
2. The orchestrator delegates only a strict subset to the specialist. The verifier rejects additional actions/resources, a new audience/task, later expiry, or excess depth.
3. A2A carries the task with its own task state and selected security scheme [A-01–A-02]. A separate, negotiated evidence binding references the immutable A2A task/message/artifact digest.
4. The receiving peer independently verifies external transport/authentication and the frozen project-defined delegation chain under its local trust policy.

**Decision boundary:** A2A task forwarding is not delegation. An Agent Card or peer TLS identity does not authorize multi-hop authority. Draft attenuation formats may inform future review, but [D-02] and [D-05] are Internet-Drafts, not adopted standards.

## 3. Runtime rotates during a long-running task

1. A SPIRE-managed workload obtains a new SVID during normal rotation [S-06].
2. The logical-agent binding and task delegation retain their own validity/status rules.
3. New request evidence records the new runtime-evidence reference; prior evidence remains historically verifiable only against archived trust/status policy.

**Decision boundary:** rotation is not a new logical agent and does not extend delegation validity. A verifier must not mark an old runtime proof current merely because a replacement SVID is valid now.

## 4. OAuth token exchange / Entra OBO feeds an agent operation

1. An authorization server performs token exchange [O-07], or an Entra deployment performs its documented OBO flow [G-06–G-07].
2. The adapter retains issuer, token subject, actor (`act` when present), client, resource/audience, scope, sender-constraint, and verification time as issuer-scoped facts.
3. A frozen ATTEST binding can reference those facts only after local policy states how they bind to a logical agent and task.

**Decision boundary:** token exchange/OBO may be an authorization mechanism, but it does not provide a portable, generic multi-hop task attenuation model. `sub` remains the AS's subject; it is not renamed to the logical agent. Entra documentation is product documentation, not a cross-vendor protocol specification.

## 5. Provenance export after a verified action

1. The verifier records deterministic decision inputs and result: typed principals, runtime reference, task/context digest, action/resource/audience, delegation references, status/policy snapshot, and outcome.
2. Export maps activity/entity/agent relationships to PROV concepts [P-01–P-02]. It may export the frozen project-defined predicate using a separately approved in-toto/DSSE profile; that export preserves the selected format's bytes and remains distinct from the Agent Proof core envelope [P-03–P-04].
3. Inputs and outputs are digests or controlled references; mutable URLs/display names are annotations, not signed authorization material.

**Decision boundary:** signed provenance says a key signed a claim; it is not retroactive permission. A model/version assertion remains provenance metadata. A SCITT registration, if added later, contributes transparency evidence but not claim truth or authority [P-06].

## 6. Compromised agent key or malicious tool server

1. An attacker with a delegate key can create correctly signed requests within the key's usable scope until status/policy rejects it.
2. The verifier applies key/delegation status freshness, expiry, exact task/resource/audience checks, nonce/request replay rules, and local trust policy.
3. A malicious but correctly authenticated tool can still return harmful or false output; provenance captures the verified interaction/result assertion without calling it trustworthy content.

**Decision boundary:** signature validity is not honesty, safe execution, correct results, uncompromised runtime, or availability. These are residual risks to be addressed in the threat model and operational policy.

## 7. Cross-domain workload federation without authority federation

1. Runtime A and B validate federated SPIFFE bundles under explicitly configured federation rules [S-05].
2. A receiver optionally accepts runtime-evidence from the remote trust domain only when its local policy allows it.
3. It separately evaluates the proposed authority/delegation chain under its own roots/status snapshot.

**Decision boundary:** federation creates a path to validate workload identity; it does not import human/service authority, resource authorization, or delegation rights.

# A2A adapter

**Pinned baseline:** A2A `v1.0.1` and its `a2a.proto`; see A-01 and A-02 in the [source register](../standards/source-register.md#source-register).

`@agent-proof/adapter-a2a` is an extension/binding helper, not an A2A server, client, Agent Card processor, or task implementation. A sender advertises `https://agent-proof.invalid/extensions/a2a/v1` at extension version 1 and sends the project-defined `agent-proof-a2a/v1` proof carrier only when the peer explicitly negotiates that declaration. The proof is carried separately from HTTP, OAuth, mTLS, and other A2A security schemes.

A receiver recomputes digest bindings for the exact parsed A2A message and task context and calls shared `verifyArtifacts`. It reports `missing`, `stripped`, `malformed`, `oversized`, or `denied` rather than interpreting ordinary A2A task success as verified evidence. Unknown or unsupported peers get the explicit `supportsA2aProof(...) === false` negotiation outcome.

The adapter does not treat Agent Cards, task IDs, endpoints, or card signatures as live authorization evidence, and it does not change A2A task lifecycle semantics.

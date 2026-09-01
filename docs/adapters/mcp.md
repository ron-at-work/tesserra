# MCP adapter

**Pinned baseline:** MCP core and authorization release `2026-07-28`; official Node SDK `@modelcontextprotocol/sdk` `1.30.0` (tested for `tools/call` `_meta` preservation). See [source register](../standards/source-register.md#source-register) entries M-01 and M-02.

`@agent-proof/adapter-mcp` defines the project metadata key `io.agent-proof/proof`, whose value is a base64url-encoded canonical `agent-proof-mcp/v1` carrier. It is **project-defined metadata**, not an MCP standard field and not a claim of support by other MCP implementations. The client helper adds it to parsed `tools/call` request metadata; the receiver helper recomputes canonical tool-arguments and tool-context digests then calls `verifyArtifacts`.

The receiver returns distinct `missing`, `stripped`, `malformed`, `oversized`, and `denied` outcomes. Local application policy must decide whether an MCP call lacking verified evidence is rejected; these outcomes never replace the MCP protocol result. The binding has a 65,536-byte default limit.

## Required integration order

1. Complete normal MCP/OAuth authorization, including its resource, issuer, and audience obligations.
2. Derive exact action/resource/task/audience values from the parsed call and configured local mapping.
3. Require and verify the optional project proof if the endpoint’s local policy requires it.

The adapter never replaces OAuth access tokens, discovers Agent Proof trust from MCP/OAuth metadata, equates a token/client/connection with a logical agent, or declares unsupported transports and clients provenance-capable.

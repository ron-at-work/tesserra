# MCP proof propagation sketch

```ts
import { withMcpProof, verifyMcpToolCall } from '@agent-proof/adapter-mcp';

const call = withMcpProof({ _meta: {} }, carrier); // sender: only a project-defined metadata binding
const outcome = verifyMcpToolCall(call, parsedToolContext, verifierOptions); // receiver: after MCP/OAuth
if (outcome.status !== 'verified') throw new Error(`Agent Proof unavailable: ${outcome.status}`);
```

The carrier comes from locally assembled Agent Proof artifacts. This sketch does not replace MCP OAuth, advertise support to arbitrary MCP peers, or authorize a call merely because MCP accepted it.

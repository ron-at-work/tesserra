# A2A two-agent negotiation sketch

```ts
if (!supportsA2aProof(receiverNegotiation)) {
  return { outcome: 'proof-extension-unsupported' };
}
const outgoing = withA2aProof(message, carrier);
const outcome = verifyA2aMessage(outgoing, parsedTaskContext, verifierOptions);
```

Both peers retain A2A authentication and task semantics. A missing, stripped, or denied extension must not be recorded as verified provenance.

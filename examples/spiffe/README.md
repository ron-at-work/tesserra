# SPIFFE workload mapping sketch

```ts
const identity = await createSpiffeIdentityProvider(workloadApi, [
  'example.org'
]).workloadIdentity();
// identity.principal is { type: 'workload', id: 'spiffe://example.org/...' }
const runtimeEvidence = runtimeEvidenceFor(identity);
```

The Workload API client owns SVID and bundle validation. `runtimeEvidence` is an observation, not a logical-agent identity, task authorization, or delegation.

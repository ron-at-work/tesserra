# Delegation and signed requests

## Authority model

A delegation is a signed, parent-linked grant. A child can only reduce authority along capability, resource, task, audience, validity, and remaining-depth dimensions. Omission grants no authority. A signed request binds a signer, action, resource, task, audience, payload digest, task-context digest, nonce, request ID, and expiry to that authority chain.

The verifier rejects expansion, wrong parents, cycles, duplicate IDs, ambiguous references, untrusted roots, invalid signatures, expired evidence, revocation/status failures, and context or replay failures according to the RFC’s ordered decision rules.

## Implemented local workflow

The CLI can create and inspect a locally signed delegation, sign a locally stored request, and verify the complete local root/delegation/request evidence:

```sh
agentctl delegate create --identity "$PARENT_ID" \
  --delegate agid:v1:example.test/delegate --capability files.read --json
agentctl request sign --identity "$DELEGATE_ID" --delegation "$DELEGATION_ID" \
  --action files.read --json
agentctl request verify --id "$REQUEST_ID" --json
```

This is a local fixture/operator flow. It uses the local encrypted key provider and SQLite artifacts; it is not a remote authorization service. `delegate verify` is intentionally not an authorization success surface by itself because the core verifier decides authority in request context. `request verify` uses offline replay mode and does not atomically consume a nonce.

The repository also ships `positive-two-hop.json` and related conformance cases. Run the complete deterministic corpus with:

```sh
corepack pnpm build
corepack pnpm --filter @agent-proof/core test
```

## API and SDK scope

The loopback API can persist supplied, already-signed delegations, list/read them, and verify supplied delegation/request evidence against its current local trust snapshot. The API does not sign a delegation or request for a caller. The SDK exposes deterministic `verifyDelegation` and `verifyRequest`; callers supply complete artifacts, trust snapshot, and expected context.

See [the local API reference](../api/local-api.md) for routes and concrete-host requirements.

## Lifecycle, status, and provenance limits

- `agentctl identity rotate` fails with `LIFECYCLE_UNAVAILABLE`; the required atomic key-binding and key-status history workflow is not available.
- `agentctl revoke` fails with `STATUS_AUTHORITY_REQUIRED` in the local fixture profile. It does not mint a signed revocation or elevate an issuer to a status authority.
- `agentctl revoked --target` reports locally stored signed revocation records only. It is not an online status check and cannot prove global freshness or propagation.
- `agentctl provenance inspect` and `provenance export` operate on the local SQLite graph. There is no HTTP provenance graph/export route, no remote graph, and no claim that graph presence authorizes an action.

## Operational guidance

- Treat a valid signature as evidence under policy, not proof of truthful execution.
- Pin a trust snapshot; do not use trust-on-first-use for production.
- Send explicit expected action, resource, task, audience, signer, payload digest, and task-context digest to verification.
- Use online replay consumption when replay resistance is required. Offline inspection has documented freshness/replay limits.
- Retain canonical evidence and relevant policy/status snapshot hashes for later provenance reconstruction.

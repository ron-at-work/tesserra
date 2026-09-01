# SDK

`@agent-proof/sdk` is a public TypeScript boundary that exports deterministic offline identity/delegation/request verification, agent-ID display helpers, protocol types, and `LocalApiClient`. It must not require SQLite, local crypto, service, host, or server implementation packages.

## Offline verification

```ts
import { verifyIdentity, verifyRequest } from '@agent-proof/sdk';

const identityResult = verifyIdentity({ credential, trustSnapshot });
const requestResult = verifyRequest({
  artifacts,
  trustSnapshot,
  context,
  replayMode: 'offline'
});
```

`verifyDelegation` checks that supplied artifacts contain a delegation, then delegates to request-context verification. `verifyRequest` and `verifyDelegation` require complete artifacts, a pinned trust snapshot, and expected context. `now` may be a whole-second RFC 3339 UTC string or `Date`; it defaults to the current instant. A successful result means evidence passed deterministic checks under that supplied policy, not that the signer or execution is trustworthy in every respect.

## Typed local API client

```ts
import { LocalApiClient } from '@agent-proof/sdk';

const client = new LocalApiClient({ baseUrl: 'http://127.0.0.1:4318' });
const page = await client.listAgents();
```

The client exposes current identity/trust methods and declared delegation/revocation/event transport models. Only the routes identified as served in [the local API reference](local-api.md) are available from the current loopback host. The SDK does not make CLI issuance, hosted delegation storage, lifecycle management, provenance graph/export, or remote exposure available.

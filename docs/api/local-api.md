# Local HTTP API

The local API is versioned at `/v1` and loopback-only by default. It returns a stable error envelope:

```json
{
  "error": { "code": "...", "message": "diagnostic", "details": [] },
  "requestId": "..."
}
```

Messages are diagnostic; clients must branch on `code`. The API does not expose private key material, provider references, raw nonces, or unredacted evidence.

## Served routes

| Method and path                     | Operation                                                    | Status                                              |
| ----------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- |
| `POST /v1/identities`               | Create an identity                                           | Implemented                                         |
| `GET /v1/identities/{id}`           | Read an identity                                             | Implemented                                         |
| `POST /v1/verifications/identity`   | Verify an identity                                           | Implemented                                         |
| `GET /v1/agents`                    | List identities                                              | Implemented                                         |
| `GET /v1/trust-anchors`             | Read current pinned trust snapshot                           | Implemented                                         |
| `POST /v1/trust-snapshots:reload`   | Reload configured trust snapshot                             | Implemented; local authorization required           |
| `POST /v1/verifications/delegation` | Verify supplied delegation evidence                          | Implemented                                         |
| `POST /v1/verifications/request`    | Verify supplied request evidence                             | Implemented                                         |
| `POST /v1/delegations`              | Persist a signed, complete, valid delegation chain           | Implemented when evidence persistence is configured |
| `GET /v1/delegations`               | List persisted delegations, ordered by immutable artifact ID | Implemented when evidence persistence is configured |
| `GET /v1/delegations/{id}`          | Read a persisted delegation                                  | Implemented when evidence persistence is configured |
| `GET /v1/revocations/{id}`          | Read a persisted revocation                                  | Implemented when evidence persistence is configured |
| `GET /v1/events`                    | List persisted verification events                           | Implemented when evidence persistence is configured |

`POST /v1/delegations` accepts the delegation plus a complete authority chain in `artifacts`. The server validates each schema and canonical ID, then calls core `verifyDelegationChain`; unsigned, incomplete, expired, tampered, or untrusted evidence is rejected before persistence. Pagination uses a strict artifact-ID cursor and accepts limits from 1 through 100.

## Status authority boundary

`POST /v1/revocations` is currently served only as an explicit failure: it returns `STATUS_AUTHORITY_REQUIRED`. The local profile has no separately configured status publisher and must not treat delegation authorization or an identity issuer as revocation authority. It therefore does not persist submitted revocations or mutate the provenance graph. `GET /v1/revocations/{id}` can read records provisioned by a configured host implementation.

The dependency-free OpenAPI input is exported from `@agent-proof/api-contract/openapi`. `@agent-proof/api-client` is the typed client boundary.

## Unserved lifecycle and provenance surfaces

There is no identity rotation route, no request-signing route, and no `/v1/provenance` graph or export route. The abstract server can be constructed without an evidence store; its delegation, revocation, and event routes then fail closed instead of claiming persistence. `createConcreteLocalHost` provides the SQLite evidence store used by the local host.

## Exposure

The API is designed for local operation. Enabling remote exposure requires explicit authentication, TLS, firewall/origin controls, and threat-model review. Loopback binding does not protect against a hostile local user.

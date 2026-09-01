# ATTEST — Agent Proof Protocol v1

**Status:** project-defined MVP specification (normative)  
**Neutral wire namespace:** `https://agent-proof.invalid` (reserved documentation namespace, not a service)  
**Wire version:** `agent-proof/v1` — **review baseline:** 2026-09-01

ATTEST is a replaceable display name and MUST NOT occur in signed/wire values.
This profile is not an Internet standard and does not replace SPIFFE/SPIRE,
OAuth/OIDC, MCP, A2A, PKI, an authorization server, or a policy engine.

## 1. Dependencies, scope, and labels

Capitalized requirements use RFC 2119/8174. External dependencies are RFC 8259
(JSON), RFC 7493 (I-JSON), RFC 8785 (JCS), RFC 4648 §5 (base64url), FIPS
180-4 (SHA-256), RFC 8032 §5.1 (Ed25519), RFC 8037 (OKP JWK), RFC 3339
(timestamps), and RFC 9562 (UUIDv7). `request_id` and task are canonical
lower-case UUIDv7 values. Formats under `agent-proof/v1`, `urn:agent-proof:*`,
or `https://agent-proof.invalid/*` are project-defined MVP formats. SPIFFE,
OAuth, MCP, A2A, W3C PROV, in-toto/DSSE, SLSA, and SCITT are future,
non-equivalent adapter boundaries.

## 2. Bytes, parsing, and proof

Before semantic processing, a receiver MUST decode one BOM-free UTF-8 JSON
value, reject trailing non-whitespace, malformed UTF-8, duplicate names,
unpaired surrogates, non-I-JSON numeric values, and malformed outer envelope.
An outer envelope is only the common fields `version`, `kind`, `id`,
`issued_at`, and `proof` plus JSON value types. It deliberately does not impose
the supported values of version/kind/alg/resource type.

`B64U` is RFC 4648 §5 without padding. It MUST have no `=`, whitespace, or
non-alphabet bytes and decode/re-encode identically. JWK x/nonce are 32 bytes;
signatures 64 bytes. `JCS(x)` is RFC 8785 UTF-8; ordinary JSON serialization or
Unicode/URI normalization is forbidden.

Frozen preimages use exact ASCII prefix, NUL, and JCS. The following
normative preimage forms are fenced deliberately: a Markdown table cannot safely
represent the literal `||` token without treating it as a column separator. Do
not reflow or format these expressions; the protocol values are the code text.

```text
key ID:      AGENT-PROOF-KEY-ID-V1\0 || JCS(jwk)
artifact ID: AGENT-PROOF-ARTIFACT-ID-V1\0 || JCS(content)
policy hash: AGENT-PROOF-POLICY-HASH-V1\0 || JCS(snapshot without policy_hash)
status hash: AGENT-PROOF-STATUS-SNAPSHOT-V1\0 || JCS(status_members)
proof:       AGENT-PROOF-SIGN-V1\0 || kind || \0 || JCS(semantic)
```

| Value       | Rendered identifier                                 |
| ----------- | --------------------------------------------------- |
| key ID      | `urn:agent-proof:kid:v1:sha256:` + B64U(SHA-256)    |
| artifact ID | `urn:agent-proof:v1:sha256:` + B64U(SHA-256)        |
| policy hash | `urn:agent-proof:policy:v1:sha256:` + B64U(SHA-256) |
| status hash | `urn:agent-proof:status:v1:sha256:` + B64U(SHA-256) |
| proof       | Ed25519 signature                                   |

`content` removes `id` and `proof`; `semantic` removes `proof`. No unused
request preimage exists. Public JWK is exact OKP/Ed25519/x (RFC 8037).
`proof.alg` MUST be `Ed25519` and verification MUST be RFC 8032 Ed25519 over
the exact proof preimage. No generic EdDSA, `none`, algorithm negotiation,
remote JWK/certificate URL, or discovery is permitted.

## 3. Identity, constraints, and canonical selectors

Every artifact is `agent-proof/v1`; unknown semantics fail closed. Agent IDs
are structured `agid` v1 authority/path objects. Principal types (`human`,
`service`, `agent`, `workload`, `oauth_client`, `model`) remain distinct.
Times are exact UTC seconds and use one verifier time:
`not_before - max_clock_skew_seconds <= now <= expires_at + skew`, with
`not_before <= issued_at <= expires_at`; skew is 0–300 seconds.

A URI resource is absolute `https`, lower-case host, no userinfo/port/query/
fragment/percent encoding, and root or slash-separated unreserved segments.
The literal URI is canonical: no decoding, dot removal, case folding, or prefix
matching. Actions/audiences and resource/task matching are exact. Constraint
arrays are nonempty; omission grants no authority. Globs, regex, wildcards,
deny rules, and policy languages are deferred.

A credential is issuer-signed binding of agent subject/JWK/key and bounded
`authority_ceiling` constraints. `agent-root-authority` is root authority;
`agent-key-binding` credentials bind delegation/request signing keys only and
MUST NOT be selected as a root. This keeps root authority distinct from later
agent key binding. A
delegation is a signed typed local `parent_ref`; both referenced ID and kind
must match. A request `delegation_ref.kind` MUST be `delegation`, never
`credential`. Every child is a subset of parent and root ceiling and has strictly
lower remaining depth. Its proof key must be the credentialed stated
delegator/signing principal; credential proof key must be an issuer role key.

## 4. Trust, roots, status, rotation, and provenance

TrustSnapshot is authenticated local policy, never TOFU. It has typed issuer
roles, distinct status-publisher roles (a `key_id` MUST NOT occur in both role
sets), typed roots,
limits, replay/archival policy, and high-water entries. A root authorizes only
when credential issuer, credential subject, and purpose exactly equal a root
entry; otherwise `MIXED_TRUST_ROOT`. Unknown issuer/key respectively yield
`UNTRUSTED_ISSUER`/`UNTRUSTED_KEY`.

Status membership has two ordered groups. **Group 1** is exactly all supplied
`key_status` and `revocation` semantic objects selected for the decision, sorted
by `(publisher.id, target_key_id or target_id, sequence, kind)`. **Group 2** is
exactly all supplied `key_rotation` semantic objects, sorted by
`(publisher.id, old_key_id, sequence, kind)`. `status_members` is Group 1
followed by Group 2, JCS encoded, then status-hashed as section 2. `status_fresh` is true only after STATUS succeeds
with every required scoped record present, JCS status hash computed, `as_of <=
now <= valid_until`, and high-water met. Otherwise it is false.

Status sequence/high-water scope is `(publisher, target_key_id)`; revocation
uses target key when its target type is key. Each stream increments by one and
links `previous_digest` to SHA-256 semantic JCS predecessor. High-water stores
publisher, target key, sequence, digest. Missing/gap/fork/stale =>
`STATUS_UNAVAILABLE`/`STATUS_STALE`; lower high-water => `STATUS_ROLLBACK`.
At time now, revocation outranks status, then compromised/revoked > retired >
active. Rotation records MUST include the issuer/recovery `publisher` principal. They
form a second deterministic sort group after key-status/revocation entries,
sorted by `(publisher.id, old_key_id, sequence, kind)`; they do not join a
target-key status stream. Rotation is issuer/recovery-signed, names old/new key and time window,
and policy must select exactly one active signer. Archived verification requires an explicit `archived_snapshot` case input with
`verification_mode:"historical"`, archived policy/status hashes, and the
`HISTORICAL_SNAPSHOT` warning. The archived input includes `policy_content`
(the archived snapshot excluding `policy_hash`) and ordered `status_members`.
Its policy hash is `SHA-256("AGENT-PROOF-POLICY-HASH-V1\0" ||
JCS(policy_content))` under the policy URN; its status hash is
`SHA-256("AGENT-PROOF-STATUS-SNAPSHOT-V1\0" || JCS(status_members))` under
the status URN. The historical fixture ships both inputs, so both hashes are
independently reproducible.

A provenance artifact is defined by its schema now: authority/request typed
refs, immutable subject digest, project predicate, input/output digests, and
predecessor refs. It is evidence, never authority. Predecessors are acyclic and
invalid/missing evidence remains invalid; no in-toto/PROV compliance is claimed.

### Amendment 2026-09-01 — delegation-only verification API

`verifyDelegationChain` is a deterministic local API for authority evidence that
has not yet been put into a request. It accepts exactly one root-authority
credential, zero or more agent-key-binding credentials, one parent-linked
leaf delegation chain, and signed key-status/revocation/rotation evidence with
a TrustSnapshot. It executes **PARSE → VERSION → CRYPTO → TIME → TRUST →
CHAIN → STATUS**, returns the same closed `VerificationResult` taxonomy, and
ends there: it MUST NOT require or synthesize a request, expected request
context, BINDING, or REPLAY. A successful result has `status_fresh=true` and
`replay_checked=false`. The root credential anchors the chain; key-binding
credentials only authorize stated delegation proof keys. A chain API input is
invalid if it has no leaf or more than one leaf. It rejects malformed or
unknown evidence, signature tampering, missing/wrong parent linkage, expansion,
expired evidence, unavailable/stale/rolled-back key status, and effective
revocation using the ordinary closed codes and deterministic stage precedence.

## 5. Requests, binding, and replay

A request signs delegation, UUIDv7 request ID, nonce, action/resource/task/
audience and mandatory payload/task-context SHA-256 digests. VerificationContext
MUST contain expected payload and task-context digests; each request field MUST
exist and equal its expected context value or `INVALID_DIGEST_LINKAGE` results
at CRYPTO, before TIME/TRUST/BINDING.

Online side effects atomically consume **two separate uniqueness keys**:
`(audience, signer_key_id, request_id)` and `(audience, signer_key_id, nonce)`;
either duplicate is `REPLAY_DETECTED`. Retain both through expiry plus skew.
Online-required offline input is `OFFLINE_REPLAY_UNAVAILABLE`. In explicit
offline-inspection-only policy, the verifier MUST still execute STATUS against
all supplied signed `key_status` and `revocation` records and MUST reject a
non-active key or an effective revocation. It skips only online freshness and
high-water checks. It then MUST execute BINDING; wrong signer, audience,
action, resource, task, or digest MUST fail normally. After successful binding,
`status_fresh=false`, `replay_checked=false`, and warnings include
`OFFLINE_STATUS_NOT_FRESH` and `OFFLINE_REPLAY_NOT_CHECKED`; it MUST NOT
authorize a side effect.

## 6. Ordered verification and output

Use this exact order: **PARSE** outer bytes/envelope, duplicate detection, base64
round-trip, and ID/key-ID derivation; **VERSION** supported version, kind,
algorithm, critical semantics, resource type, then supported-kind schema;
**CRYPTO** typed local references, signer/key binding, proofs, digests;
**TIME** first `INVALID_TIME_INTERVAL`, then `NOT_YET_VALID`, then `EXPIRED`; **TRUST** snapshot/roles/root; **CHAIN** depth and
attenuation; **STATUS**; **BINDING** signer/audience/action/resource/task/
digests; **REPLAY**.

This makes VERSION checks reachable. `CLOCK_SKEW_EXCEEDED` is not a v1 code:
the interval rule deterministically yields `NOT_YET_VALID` or `EXPIRED`.
Content-addressed parent cycles and duplicate-ID ambiguous parents are
structurally unconstructible in a valid signed finite set; `CHAIN_PARENT_AMBIGUOUS`
is likewise structurally unconstructible because content IDs are unique; implementations MUST
still detect them defensively, but v1 does not fake impossible vectors.

Closed codes are those in `verification.schema.json`. A result’s primary is the
first failed stage/check; secondary values are only ordered additional failures
in that same stage. `evidence_ids` is the existing ordered root credential
through the **failing evidence inclusive**. VERSION failure always includes its
syntactically present failing artifact, even when its kind is unsupported. For a failure before a particular
artifact can be accepted, it ends at the last existing accepted ancestor; it is
empty only when no artifact identity is available.
Warnings are closed-schema values. `NOT_ALL_STAGES_EXECUTED` appears if and
only if a failure stops the pipeline before REPLAY; replay-stage failures have
no such warning. Result includes distinct policy/status URN hashes and no secrets.

## 7. Conformance and limitations

The manifest maps every fixture to V-* threat families. It includes complete
artifacts for core parsing/version/crypto/time/trust/chain/status/binding/replay
codes, positive two-hop, revocation, status rollback, and raw malformed inputs.
The dependency-light `self-check.py` independently reproduces canonical bytes,
IDs, hashes, and signatures. A valid signature proves only configured-key
control, not honesty, safe execution, uncompromised runtime, global offline
freshness/replay, or availability.

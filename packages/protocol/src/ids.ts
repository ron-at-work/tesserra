import { createHash } from 'node:crypto';
import { encodeBase64Url } from './base64url.js';
import { canonicalBytes, omit } from './canonical.js';
import type { ArtifactBase, JsonObject, PublicJwk } from './types.js';
const bytes = (prefix: string, value: JsonObject): Uint8Array =>
  Buffer.concat([
    Buffer.from(prefix, 'ascii'),
    Buffer.from([0]),
    Buffer.from(canonicalBytes(value))
  ]);
const hash = (prefix: string, value: JsonObject): string =>
  encodeBase64Url(createHash('sha256').update(bytes(prefix, value)).digest());
export const keyIdFor = (jwk: PublicJwk): string =>
  `urn:agent-proof:kid:v1:sha256:${hash('AGENT-PROOF-KEY-ID-V1', jwk as unknown as JsonObject)}`;
export const artifactIdFor = (artifact: ArtifactBase): string =>
  `urn:agent-proof:v1:sha256:${hash('AGENT-PROOF-ARTIFACT-ID-V1', omit(artifact as JsonObject, ['id', 'proof']))}`;
export const policyHashFor = (snapshot: JsonObject): string =>
  `urn:agent-proof:policy:v1:sha256:${hash('AGENT-PROOF-POLICY-HASH-V1', omit(snapshot, ['policy_hash']))}`;
export const statusHashFor = (members: readonly JsonObject[]): string =>
  `urn:agent-proof:status:v1:sha256:${encodeBase64Url(
    createHash('sha256')
      .update(
        Buffer.concat([
          Buffer.from('AGENT-PROOF-STATUS-SNAPSHOT-V1\0', 'ascii'),
          Buffer.from(canonicalBytes(members as unknown as JsonObject))
        ])
      )
      .digest()
  )}`;
export const signingInputFor = (artifact: ArtifactBase): Uint8Array =>
  Buffer.concat([
    Buffer.from('AGENT-PROOF-SIGN-V1\0', 'ascii'),
    Buffer.from(artifact.kind, 'ascii'),
    Buffer.from([0]),
    Buffer.from(canonicalBytes(omit(artifact as JsonObject, ['proof'])))
  ]);
/** SHA-256 content digest used by signed payload and task-context bindings. */
export const sha256DigestFor = (value: Uint8Array): string =>
  `sha256:${encodeBase64Url(createHash('sha256').update(value).digest())}`;
export const semanticDigestFor = (artifact: ArtifactBase): string =>
  sha256DigestFor(canonicalBytes(omit(artifact as JsonObject, ['proof'])));

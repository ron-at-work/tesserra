import { decodeBase64Url } from './base64url.js';
import { SUPPORTED_KINDS, type ArtifactBase, type JsonObject, type JsonValue } from './types.js';

const timestamp = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;
const uuidV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const action = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/;
const audience = /^[a-z0-9][a-z0-9.-]{0,252}$/;
const artifactId = /^urn:agent-proof:v1:sha256:[A-Za-z0-9_-]{43}$/;
const keyId = /^urn:agent-proof:kid:v1:sha256:[A-Za-z0-9_-]{43}$/;
const digest = /^sha256:[A-Za-z0-9_-]{43}$/;
const object = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const has = (value: JsonObject, key: string): boolean => Object.hasOwn(value, key);
const string = (value: JsonValue | undefined): value is string => typeof value === 'string';
const integer = (value: JsonValue | undefined): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
const fields = (
  value: JsonObject,
  required: readonly string[],
  allowed: readonly string[]
): boolean =>
  required.every((field) => has(value, field)) &&
  Object.keys(value).every((field) => allowed.includes(field));

export function asObject(value: JsonValue | undefined): JsonObject | undefined {
  return object(value) ? value : undefined;
}
export function isTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !timestamp.test(value)) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().replace('.000Z', 'Z') === value;
}
export function validateOuterEnvelope(value: unknown): value is ArtifactBase {
  if (
    !object(value) ||
    !has(value, 'version') ||
    !has(value, 'kind') ||
    !has(value, 'id') ||
    !has(value, 'issued_at') ||
    !has(value, 'proof')
  )
    return false;
  const proof = object(value.proof) ? value.proof : undefined;
  return (
    string(value.version) &&
    string(value.kind) &&
    string(value.id) &&
    isTimestamp(value.issued_at) &&
    proof !== undefined &&
    string(proof.alg) &&
    string(proof.kid) &&
    string(proof.sig)
  );
}
export function validateArtifact(value: unknown): value is ArtifactBase {
  if (!validateOuterEnvelope(value)) return false;
  const artifact = value as JsonObject;
  const proof = object(artifact.proof) ? artifact.proof : undefined;
  if (
    !proof ||
    !SUPPORTED_KINDS.includes(artifact.kind as (typeof SUPPORTED_KINDS)[number]) ||
    artifact.version !== 'agent-proof/v1' ||
    proof.alg !== 'Ed25519'
  )
    return false;
  if (
    !artifactId.test(artifact.id as string) ||
    !keyId.test(proof.kid as string) ||
    !validProof(proof)
  )
    return false;
  const common = ['version', 'kind', 'id', 'issued_at', 'proof'];
  switch (artifact.kind) {
    case 'credential':
      return (
        fields(
          artifact,
          [
            ...common,
            'issuer',
            'subject',
            'public_jwk',
            'key_id',
            'not_before',
            'expires_at',
            'credential_purpose',
            'authority_ceiling'
          ],
          [
            ...common,
            'issuer',
            'subject',
            'public_jwk',
            'key_id',
            'not_before',
            'expires_at',
            'credential_purpose',
            'authority_ceiling'
          ]
        ) &&
        validPrincipal(artifact.issuer) &&
        validPrincipal(artifact.subject) &&
        validJwk(artifact.public_jwk) &&
        keyId.test(artifact.key_id as string) &&
        isTimestamp(artifact.not_before) &&
        isTimestamp(artifact.expires_at) &&
        (artifact.credential_purpose === 'agent-root-authority' ||
          artifact.credential_purpose === 'agent-key-binding') &&
        validConstraints(artifact.authority_ceiling)
      );
    case 'delegation':
      return (
        fields(
          artifact,
          [...common, 'delegator', 'delegate', 'parent_ref', 'constraints'],
          [...common, 'delegator', 'delegate', 'parent_ref', 'constraints']
        ) &&
        validPrincipal(artifact.delegator) &&
        validPrincipal(artifact.delegate) &&
        validRef(artifact.parent_ref) &&
        validConstraints(artifact.constraints)
      );
    case 'request':
      return (
        fields(
          artifact,
          [
            ...common,
            'signer',
            'delegation_ref',
            'request_id',
            'nonce',
            'not_before',
            'expires_at',
            'action',
            'resource',
            'task',
            'audience',
            'payload_digest',
            'task_context_digest'
          ],
          [
            ...common,
            'signer',
            'delegation_ref',
            'request_id',
            'nonce',
            'not_before',
            'expires_at',
            'action',
            'resource',
            'task',
            'audience',
            'payload_digest',
            'task_context_digest'
          ]
        ) &&
        validPrincipal(artifact.signer) &&
        validRef(artifact.delegation_ref) &&
        asObject(artifact.delegation_ref)?.kind === 'delegation' &&
        uuidV7.test(artifact.request_id as string) &&
        validB64(artifact.nonce, 32) &&
        isTimestamp(artifact.not_before) &&
        isTimestamp(artifact.expires_at) &&
        action.test(artifact.action as string) &&
        validResource(artifact.resource) &&
        uuidV7.test(artifact.task as string) &&
        audience.test(artifact.audience as string) &&
        digest.test(artifact.payload_digest as string) &&
        digest.test(artifact.task_context_digest as string)
      );
    case 'key_status':
      return (
        fields(
          artifact,
          [
            ...common,
            'publisher',
            'effective_at',
            'as_of',
            'valid_until',
            'sequence',
            'previous_digest',
            'target_key_id',
            'state'
          ],
          [
            ...common,
            'publisher',
            'effective_at',
            'as_of',
            'valid_until',
            'sequence',
            'previous_digest',
            'target_key_id',
            'state'
          ]
        ) &&
        validPrincipal(artifact.publisher) &&
        isTimestamp(artifact.effective_at) &&
        isTimestamp(artifact.as_of) &&
        isTimestamp(artifact.valid_until) &&
        integer(artifact.sequence) &&
        artifact.sequence >= 1 &&
        (artifact.previous_digest === null || digest.test(artifact.previous_digest as string)) &&
        keyId.test(artifact.target_key_id as string) &&
        ['active', 'retired', 'compromised', 'revoked'].includes(artifact.state as string)
      );
    case 'revocation':
      return (
        fields(
          artifact,
          [
            ...common,
            'publisher',
            'effective_at',
            'as_of',
            'valid_until',
            'sequence',
            'previous_digest',
            'target_type',
            'target_id',
            'reason'
          ],
          [
            ...common,
            'publisher',
            'effective_at',
            'as_of',
            'valid_until',
            'sequence',
            'previous_digest',
            'target_type',
            'target_id',
            'reason'
          ]
        ) &&
        validPrincipal(artifact.publisher) &&
        isTimestamp(artifact.effective_at) &&
        isTimestamp(artifact.as_of) &&
        isTimestamp(artifact.valid_until) &&
        integer(artifact.sequence) &&
        artifact.sequence >= 1 &&
        (artifact.previous_digest === null || digest.test(artifact.previous_digest as string)) &&
        ['credential', 'key', 'delegation'].includes(artifact.target_type as string) &&
        string(artifact.target_id) &&
        string(artifact.reason)
      );
    case 'key_rotation':
      return (
        fields(
          artifact,
          [
            ...common,
            'old_key_id',
            'new_key_id',
            'activation_time',
            'retirement_time',
            'sequence',
            'previous_digest',
            'publisher'
          ],
          [
            ...common,
            'old_key_id',
            'new_key_id',
            'activation_time',
            'retirement_time',
            'sequence',
            'previous_digest',
            'publisher'
          ]
        ) &&
        keyId.test(artifact.old_key_id as string) &&
        keyId.test(artifact.new_key_id as string) &&
        isTimestamp(artifact.activation_time) &&
        isTimestamp(artifact.retirement_time) &&
        integer(artifact.sequence) &&
        artifact.sequence >= 1 &&
        (artifact.previous_digest === null || digest.test(artifact.previous_digest as string)) &&
        validPrincipal(artifact.publisher)
      );
    case 'provenance':
      return (
        fields(
          artifact,
          [
            ...common,
            'authority_refs',
            'request_ref',
            'predicate_type',
            'subject',
            'predicate',
            'predecessor_refs'
          ],
          [
            ...common,
            'authority_refs',
            'request_ref',
            'predicate_type',
            'subject',
            'predicate',
            'predecessor_refs'
          ]
        ) &&
        validReferences(artifact.authority_refs, ['credential', 'delegation'], true) &&
        validRef(artifact.request_ref) &&
        asObject(artifact.request_ref)?.kind === 'request' &&
        artifact.predicate_type === 'https://agent-proof.invalid/spec/v1/provenance' &&
        validProvenanceSubject(artifact.subject) &&
        validProvenancePredicate(artifact.predicate) &&
        validReferences(artifact.predecessor_refs, ['provenance'])
      );
    default:
      return false;
  }
}
export function validJwk(value: JsonValue | undefined): boolean {
  return (
    object(value) &&
    fields(value, ['kty', 'crv', 'x'], ['kty', 'crv', 'x']) &&
    value.kty === 'OKP' &&
    value.crv === 'Ed25519' &&
    validB64(value.x, 32)
  );
}
export function validProof(value: JsonValue | undefined): boolean {
  return (
    object(value) &&
    fields(value, ['alg', 'kid', 'sig'], ['alg', 'kid', 'sig']) &&
    string(value.alg) &&
    keyId.test(value.kid as string) &&
    validB64(value.sig, 64)
  );
}
export function validPrincipal(value: JsonValue | undefined): boolean {
  if (
    !object(value) ||
    !fields(value, ['type', 'id'], ['type', 'id']) ||
    !['human', 'service', 'agent', 'workload', 'oauth_client', 'model'].includes(
      value.type as string
    )
  )
    return false;
  return value.type === 'agent'
    ? validAgentId(value.id)
    : string(value.id) && /^[A-Za-z0-9][A-Za-z0-9._:@/-]{2,254}$/.test(value.id);
}
export function validAgentId(value: JsonValue | undefined): boolean {
  return (
    object(value) &&
    fields(
      value,
      ['scheme', 'version', 'authority', 'path'],
      ['scheme', 'version', 'authority', 'path']
    ) &&
    value.scheme === 'agid' &&
    value.version === 1 &&
    string(value.authority) &&
    /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(
      value.authority
    ) &&
    Array.isArray(value.path) &&
    value.path.length > 0 &&
    value.path.every(
      (segment) => string(segment) && /^[a-z0-9](?:[a-z0-9._-]{0,62})$/.test(segment)
    )
  );
}
export function validRef(value: JsonValue | undefined): boolean {
  return (
    object(value) &&
    fields(value, ['id', 'kind'], ['id', 'kind']) &&
    artifactId.test(value.id as string) &&
    SUPPORTED_KINDS.includes(value.kind as (typeof SUPPORTED_KINDS)[number])
  );
}
export function validResource(value: JsonValue | undefined): boolean {
  return (
    object(value) &&
    fields(value, ['type', 'value'], ['type', 'value']) &&
    string(value.type) &&
    string(value.value) &&
    value.value.length >= 1 &&
    value.value.length <= 1024
  );
}
function validReferences(
  value: JsonValue | undefined,
  kinds: readonly string[],
  nonempty = false
): boolean {
  return (
    Array.isArray(value) &&
    (!nonempty || value.length > 0) &&
    value.every((reference) => {
      const objectValue = asObject(reference);
      return (
        objectValue !== undefined &&
        validRef(objectValue) &&
        kinds.includes(String(objectValue.kind))
      );
    })
  );
}
function validProvenanceSubject(value: JsonValue | undefined): boolean {
  const subject = asObject(value);
  return (
    subject !== undefined &&
    fields(subject, ['name', 'digest'], ['name', 'digest']) &&
    string(subject.name) &&
    subject.name.length > 0 &&
    digest.test(subject.digest as string)
  );
}
function validDigestArray(value: JsonValue | undefined): boolean {
  return Array.isArray(value) && value.every((item) => string(item) && digest.test(item));
}
function validProvenancePredicate(value: JsonValue | undefined): boolean {
  const predicate = asObject(value);
  return (
    predicate !== undefined &&
    fields(
      predicate,
      ['task', 'action', 'resource', 'audience', 'input_digests', 'output_digests', 'result'],
      ['task', 'action', 'resource', 'audience', 'input_digests', 'output_digests', 'result']
    ) &&
    uuidV7.test(predicate.task as string) &&
    action.test(predicate.action as string) &&
    validResource(predicate.resource) &&
    audience.test(predicate.audience as string) &&
    validDigestArray(predicate.input_digests) &&
    validDigestArray(predicate.output_digests) &&
    string(predicate.result)
  );
}
export function validConstraints(value: JsonValue | undefined): boolean {
  if (
    !object(value) ||
    !fields(
      value,
      [
        'capabilities',
        'resources',
        'tasks',
        'audiences',
        'not_before',
        'expires_at',
        'remaining_depth'
      ],
      [
        'capabilities',
        'resources',
        'tasks',
        'audiences',
        'not_before',
        'expires_at',
        'remaining_depth'
      ]
    )
  )
    return false;
  const capabilities = Array.isArray(value.capabilities) ? value.capabilities : undefined;
  const resources = Array.isArray(value.resources) ? value.resources : undefined;
  const tasks = Array.isArray(value.tasks) ? value.tasks : undefined;
  const audiences = Array.isArray(value.audiences) ? value.audiences : undefined;
  return (
    capabilities !== undefined &&
    capabilities.length > 0 &&
    capabilities.every((item) => string(item) && action.test(item)) &&
    resources !== undefined &&
    resources.length > 0 &&
    resources.every(validResource) &&
    tasks !== undefined &&
    tasks.length > 0 &&
    tasks.every((item) => string(item) && uuidV7.test(item)) &&
    audiences !== undefined &&
    audiences.length > 0 &&
    audiences.every((item) => string(item) && audience.test(item)) &&
    isTimestamp(value.not_before) &&
    isTimestamp(value.expires_at) &&
    integer(value.remaining_depth) &&
    value.remaining_depth >= 0 &&
    value.remaining_depth <= 8
  );
}
function validB64(value: JsonValue | undefined, length: number): boolean {
  try {
    return string(value) && (decodeBase64Url(value, length), true);
  } catch {
    return false;
  }
}

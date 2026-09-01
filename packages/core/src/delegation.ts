import { createPublicKey, verify as verifySignature } from 'node:crypto';
import {
  artifactIdFor,
  canonicalize,
  decodeBase64Url,
  keyIdFor,
  policyHashFor,
  semanticDigestFor,
  signingInputFor,
  statusHashFor,
  validJwk,
  validPrincipal,
  validateArtifact,
  validateOuterEnvelope,
  type ArtifactBase,
  type DecisionCode,
  type JsonObject,
  type JsonValue,
  type Principal,
  type PublicJwk,
  type VerificationResult,
  type WarningCode
} from '@agent-proof/protocol';

const protocol = 'agent-proof/v1' as const;
const stopped: readonly WarningCode[] = ['NOT_ALL_STAGES_EXECUTED'];
const object = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const array = (value: unknown): readonly JsonValue[] | undefined =>
  Array.isArray(value) ? value : undefined;
const string = (value: unknown): value is string => typeof value === 'string';
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
const at = (value: unknown): number | undefined =>
  string(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined;
const utcSeconds = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');
const equal = (left: unknown, right: unknown): boolean => {
  try {
    return canonicalize(left as JsonValue) === canonicalize(right as JsonValue);
  } catch {
    return false;
  }
};
const constraints = (artifact: ArtifactBase): JsonObject | undefined =>
  object(artifact.constraints)
    ? artifact.constraints
    : object(artifact.authority_ceiling)
      ? artifact.authority_ceiling
      : undefined;
const evidence = (
  root: ArtifactBase | undefined,
  chain: readonly ArtifactBase[]
): readonly string[] => [
  ...(root === undefined ? [] : [root.id]),
  ...chain.filter((artifact) => artifact.id !== root?.id).map((artifact) => artifact.id)
];

export interface DelegationChainVerificationInput {
  readonly rootCredential: ArtifactBase;
  /** Credentialed delegation keys; the root credential may appear here as well. */
  readonly keyBindingCredentials: readonly ArtifactBase[];
  /** Parent-linked delegations in arbitrary order. */
  readonly delegations: readonly ArtifactBase[];
  readonly statusEvidence: readonly ArtifactBase[];
  readonly trustSnapshot: JsonObject;
  readonly now: Date;
  /** Explicit local inspection profile: accepts absent status evidence, never fresh status. */
  readonly offlineInspection?: boolean;
}

function decision(
  input: DelegationChainVerificationInput,
  code: DecisionCode,
  policyHash: string,
  statusSnapshotHash: string,
  ids: readonly string[] = [],
  statusFresh = false
): VerificationResult {
  return {
    code,
    valid: code === 'VALID',
    decision_version: protocol,
    verifier_now: utcSeconds(input.now),
    policy_hash: policyHash,
    status_snapshot_hash: statusSnapshotHash,
    evidence_ids: ids,
    secondary_codes: [],
    status_fresh: statusFresh,
    replay_checked: false,
    warnings: code === 'VALID' ? [] : stopped
  };
}
function policyHash(snapshot: JsonObject): string {
  try {
    return policyHashFor(snapshot);
  } catch {
    return policyHashFor({ invalid_policy_snapshot: true });
  }
}
function statusHash(artifacts: readonly ArtifactBase[]): string {
  const semantic = (artifact: ArtifactBase): JsonObject =>
    Object.fromEntries(Object.entries(artifact).filter(([key]) => key !== 'proof')) as JsonObject;
  const publisher = (value: JsonObject): string =>
    object(value.publisher) && string(value.publisher.id) ? value.publisher.id : '';
  const target = (value: JsonObject): string =>
    string(value.target_key_id)
      ? value.target_key_id
      : string(value.target_id)
        ? value.target_id
        : '';
  const statuses = artifacts
    .filter((artifact) => artifact.kind === 'key_status' || artifact.kind === 'revocation')
    .map(semantic)
    .sort((left, right) =>
      `${publisher(left)}\0${target(left)}\0${String(left.sequence).padStart(16, '0')}\0${left.kind}`.localeCompare(
        `${publisher(right)}\0${target(right)}\0${String(right.sequence).padStart(16, '0')}\0${right.kind}`
      )
    );
  const rotations = artifacts
    .filter((artifact) => artifact.kind === 'key_rotation')
    .map(semantic)
    .sort((left, right) =>
      `${publisher(left)}\0${left.old_key_id ?? ''}\0${String(left.sequence).padStart(16, '0')}\0${left.kind}`.localeCompare(
        `${publisher(right)}\0${right.old_key_id ?? ''}\0${String(right.sequence).padStart(16, '0')}\0${right.kind}`
      )
    );
  return statusHashFor([...statuses, ...rotations]);
}
function trustKey(
  snapshot: JsonObject,
  keyId: string,
  role: 'issuer_authorities' | 'status_publishers'
): JsonObject | undefined {
  return array(snapshot[role])
    ?.map((entry) => (object(entry) ? entry : undefined))
    .find((entry) => entry !== undefined && entry.key_id === keyId);
}
function validTrust(snapshot: JsonObject, hash: string): boolean {
  const issuers = array(snapshot.issuer_authorities);
  const publishers = array(snapshot.status_publishers);
  const issuerKeys = new Set(
    (issuers ?? [])
      .map((entry) => (object(entry) && string(entry.key_id) ? entry.key_id : undefined))
      .filter((key): key is string => key !== undefined)
  );
  return (
    snapshot.policy_hash === hash &&
    integer(snapshot.sequence) &&
    snapshot.sequence >= 1 &&
    integer(snapshot.max_clock_skew_seconds) &&
    snapshot.max_clock_skew_seconds >= 0 &&
    snapshot.max_clock_skew_seconds <= 300 &&
    integer(snapshot.max_chain_depth) &&
    snapshot.max_chain_depth >= 0 &&
    snapshot.max_chain_depth <= 8 &&
    array(snapshot.roots) !== undefined &&
    issuers !== undefined &&
    publishers !== undefined &&
    array(snapshot.status_high_water) !== undefined &&
    publishers.every(
      (entry) => !object(entry) || !string(entry.key_id) || !issuerKeys.has(entry.key_id)
    )
  );
}
function signatureValid(artifact: ArtifactBase, publicJwk: PublicJwk): boolean {
  try {
    return verifySignature(
      null,
      signingInputFor(artifact),
      createPublicKey({ key: publicJwk, format: 'jwk' }),
      decodeBase64Url(artifact.proof.sig, 64)
    );
  } catch {
    return false;
  }
}
function intervalValid(artifact: ArtifactBase): boolean {
  const local = constraints(artifact);
  const issued = at(artifact.issued_at);
  if (issued === undefined) return false;
  if (string(artifact.not_before) || string(artifact.expires_at)) {
    const start = at(artifact.not_before);
    const end = at(artifact.expires_at);
    if (start === undefined || end === undefined || start > issued || issued > end) return false;
  }
  if (local === undefined) return true;
  const start = at(local.not_before);
  const end = at(local.expires_at);
  return start !== undefined && end !== undefined && start <= end;
}
function statusFor(records: readonly ArtifactBase[], keyId: string): ArtifactBase | undefined {
  return records
    .filter((record) => record.kind === 'key_status' && record.target_key_id === keyId)
    .sort((left, right) => Number(right.sequence) - Number(left.sequence))[0];
}
function statusChainValid(records: readonly ArtifactBase[], selected: ArtifactBase): boolean {
  const stream = records
    .filter(
      (record) =>
        record.kind === 'key_status' &&
        record.target_key_id === selected.target_key_id &&
        equal(record.publisher, selected.publisher)
    )
    .sort((left, right) => Number(left.sequence) - Number(right.sequence));
  if (stream[0]?.sequence !== 1 || stream[0]?.previous_digest !== null) return false;
  for (let index = 1; index < stream.length; index += 1) {
    const previous = stream[index - 1]!;
    const current = stream[index]!;
    if (
      Number(current.sequence) !== Number(previous.sequence) + 1 ||
      current.previous_digest !== semanticDigestFor(previous)
    )
      return false;
  }
  return stream.at(-1)?.id === selected.id;
}
function revoked(
  record: ArtifactBase,
  chain: readonly ArtifactBase[],
  keyIds: ReadonlySet<string>,
  now: number
): boolean {
  if (record.kind !== 'revocation' || (at(record.effective_at) ?? Infinity) > now) return false;
  if (record.target_type === 'key') return keyIds.has(String(record.target_id));
  return chain.some((artifact) => artifact.id === record.target_id);
}

/**
 * Verifies authority delegation without manufacturing a request artifact.
 * It deliberately ends at STATUS: request binding and replay are not delegation semantics.
 */
export function verifyDelegationChain(input: DelegationChainVerificationInput): VerificationResult {
  const all = [
    input.rootCredential,
    ...input.keyBindingCredentials,
    ...input.delegations,
    ...input.statusEvidence
  ];
  const hash = policyHash(input.trustSnapshot);
  const statusSnapshotHash = statusHash(input.statusEvidence);
  const stop = (code: DecisionCode, chain: readonly ArtifactBase[] = []): VerificationResult =>
    decision(input, code, hash, statusSnapshotHash, evidence(input.rootCredential, chain));

  // PARSE
  for (const artifact of all) {
    if (!validateOuterEnvelope(artifact)) return stop('SCHEMA_INVALID');
    if (artifact.id !== artifactIdFor(artifact)) return stop('ID_MISMATCH');
    const embedded = validJwk(artifact.public_jwk as JsonValue)
      ? (artifact.public_jwk as PublicJwk)
      : undefined;
    if (embedded !== undefined && artifact.key_id !== keyIdFor(embedded))
      return stop('KEY_ID_MISMATCH');
  }
  // VERSION
  for (const artifact of all) {
    if (artifact.version !== protocol) return stop('UNSUPPORTED_VERSION');
    if (
      !['credential', 'delegation', 'key_status', 'revocation', 'key_rotation'].includes(
        artifact.kind
      )
    )
      return stop('UNSUPPORTED_KIND');
    if (artifact.proof.alg !== 'Ed25519') return stop('UNSUPPORTED_ALGORITHM');
    if (artifact.critical !== undefined) return stop('UNSUPPORTED_CRITICAL_SEMANTICS');
    if (!validateArtifact(artifact)) return stop('SCHEMA_INVALID');
  }
  if (!validTrust(input.trustSnapshot, hash)) return stop('TRUST_SNAPSHOT_INVALID');
  if (
    input.rootCredential.kind !== 'credential' ||
    input.rootCredential.credential_purpose !== 'agent-root-authority'
  )
    return stop('MIXED_TRUST_ROOT');
  if (input.keyBindingCredentials.some((credential) => credential.kind !== 'credential'))
    return stop('SCHEMA_INVALID');

  const credentials = [input.rootCredential, ...input.keyBindingCredentials];
  const credentialByKey = new Map(
    credentials.map((credential) => [String(credential.key_id), credential])
  );
  const byId = new Map<string, ArtifactBase>();
  for (const artifact of [input.rootCredential, ...input.delegations]) {
    if (byId.has(artifact.id)) return stop('CHAIN_PARENT_AMBIGUOUS');
    byId.set(artifact.id, artifact);
  }

  // CRYPTO
  for (const artifact of all) {
    const pinned =
      artifact.kind === 'credential' || artifact.kind === 'key_rotation'
        ? trustKey(input.trustSnapshot, artifact.proof.kid, 'issuer_authorities')
        : artifact.kind === 'key_status' || artifact.kind === 'revocation'
          ? trustKey(input.trustSnapshot, artifact.proof.kid, 'status_publishers')
          : undefined;
    const signerCredential =
      pinned === undefined ? credentialByKey.get(artifact.proof.kid) : undefined;
    const signerJwk = validJwk(pinned?.public_jwk as JsonValue)
      ? (pinned?.public_jwk as PublicJwk)
      : validJwk(signerCredential?.public_jwk as JsonValue)
        ? (signerCredential?.public_jwk as PublicJwk)
        : undefined;
    if (signerJwk === undefined) {
      if (artifact.kind === 'credential') {
        const known = array(input.trustSnapshot.issuer_authorities)?.some(
          (entry) => object(entry) && equal(entry.principal, artifact.issuer)
        );
        return stop(known ? 'UNTRUSTED_KEY' : 'UNTRUSTED_ISSUER');
      }
      return stop('MISSING_REFERENCE');
    }
    if (!signatureValid(artifact, signerJwk)) return stop('INVALID_SIGNATURE');
    if (
      artifact.kind === 'delegation' &&
      (!signerCredential || !equal(signerCredential.subject, artifact.delegator))
    )
      return stop('SIGNER_MISMATCH');
    if (
      (artifact.kind === 'key_status' || artifact.kind === 'revocation') &&
      (!pinned || !equal(pinned.principal, artifact.publisher))
    )
      return stop('UNTRUSTED_KEY');
  }

  // TIME
  const now = input.now.getTime();
  const skew = Number(input.trustSnapshot.max_clock_skew_seconds) * 1000;
  for (const artifact of all) {
    if (!intervalValid(artifact)) return stop('INVALID_TIME_INTERVAL');
    const local = constraints(artifact);
    const starts = [at(artifact.not_before), at(local?.not_before)].filter(
      (value): value is number => value !== undefined
    );
    const ends = [at(artifact.expires_at), at(local?.expires_at)].filter(
      (value): value is number => value !== undefined
    );
    if (starts.some((value) => now < value - skew)) return stop('NOT_YET_VALID');
    if (ends.some((value) => now > value + skew)) return stop('EXPIRED');
  }

  // TRUST
  const issuer = trustKey(
    input.trustSnapshot,
    input.rootCredential.proof.kid,
    'issuer_authorities'
  );
  const trustedRoot = array(input.trustSnapshot.roots)?.some(
    (entry) =>
      object(entry) &&
      equal(entry.issuer, input.rootCredential.issuer) &&
      equal(entry.root_subject, input.rootCredential.subject) &&
      entry.credential_purpose === 'agent-root-authority'
  );
  if (!issuer || !equal(issuer.principal, input.rootCredential.issuer))
    return stop('UNTRUSTED_ISSUER');
  if (!trustedRoot) return stop('MIXED_TRUST_ROOT');

  // CHAIN — reject unlinked parent references before leaf selection.
  for (const delegation of input.delegations) {
    const reference = object(delegation.parent_ref) ? delegation.parent_ref : undefined;
    if (!string(reference?.id) || !byId.has(reference.id))
      return stop('CHAIN_PARENT_MISSING', [delegation]);
    if (byId.get(reference.id)?.kind !== reference.kind)
      return stop('CHAIN_PARENT_MISSING', [delegation]);
  }
  // Resolve one leaf through typed parents to the supplied root.
  const parents = new Set(
    input.delegations
      .map((delegation) => (object(delegation.parent_ref) ? delegation.parent_ref.id : undefined))
      .filter((id): id is string => string(id))
  );
  const leaves = input.delegations.filter((delegation) => !parents.has(delegation.id));
  if (leaves.length !== 1) return stop('CHAIN_PARENT_AMBIGUOUS');
  const chain: ArtifactBase[] = [];
  let current = leaves[0]!;
  while (true) {
    chain.unshift(current);
    const reference = object(current.parent_ref) ? current.parent_ref : undefined;
    const parent = string(reference?.id) ? byId.get(reference.id) : undefined;
    if (!parent) return stop('CHAIN_PARENT_MISSING', chain);
    if (parent.kind !== reference?.kind) return stop('CHAIN_PARENT_MISSING', chain);
    if (parent.id === input.rootCredential.id) {
      if (!equal(current.delegator, parent.subject)) return stop('CHAIN_PARENT_MISSING', chain);
      break;
    }
    if (parent.kind !== 'delegation' || !equal(current.delegator, parent.delegate))
      return stop('CHAIN_PARENT_MISSING', chain);
    if (chain.some((artifact) => artifact.id === parent.id))
      return stop('CHAIN_BOUNDS_EXCEEDED', chain);
    current = parent;
  }
  if (chain.length > Number(input.trustSnapshot.max_chain_depth))
    return stop('CHAIN_BOUNDS_EXCEEDED', chain);
  const ordered = [input.rootCredential, ...chain];
  for (let index = 1; index < ordered.length; index += 1) {
    const child = constraints(ordered[index]!);
    const parent = constraints(ordered[index - 1]!);
    if (
      child === undefined ||
      parent === undefined ||
      Number(child.remaining_depth) >= Number(parent.remaining_depth) ||
      at(child.not_before)! < at(parent.not_before)! ||
      at(child.expires_at)! > at(parent.expires_at)!
    )
      return stop('ATTENUATION_VIOLATION', chain);
    for (const field of ['capabilities', 'resources', 'tasks', 'audiences'] as const)
      if (
        (array(child[field]) ?? []).some(
          (value) => !(array(parent[field]) ?? []).some((item) => equal(item, value))
        )
      )
        return stop('ATTENUATION_VIOLATION', chain);
  }

  // STATUS
  const keyIds = new Set(
    [...ordered, ...input.keyBindingCredentials].flatMap((artifact) =>
      [artifact.proof.kid, string(artifact.key_id) ? artifact.key_id : undefined].filter(
        (key): key is string => key !== undefined
      )
    )
  );
  for (const keyId of keyIds) {
    const selected = statusFor(input.statusEvidence, keyId);
    if (input.offlineInspection && !selected) continue;
    if (!selected || !statusChainValid(input.statusEvidence, selected))
      return stop('STATUS_UNAVAILABLE', chain);
    if (selected.state !== 'active') return stop('KEY_NOT_USABLE', chain);
    if (!input.offlineInspection) {
      const water = array(input.trustSnapshot.status_high_water)
        ?.map((entry) => (object(entry) ? entry : undefined))
        .find(
          (entry) =>
            entry !== undefined &&
            entry.target_key_id === keyId &&
            equal(entry.publisher, selected.publisher)
        );
      if (
        !water ||
        water.sequence !== selected.sequence ||
        water.semantic_digest !== semanticDigestFor(selected)
      )
        return stop('STATUS_ROLLBACK', chain);
      if ((at(selected.as_of) ?? Infinity) > now || (at(selected.valid_until) ?? -Infinity) < now)
        return stop('STATUS_STALE', chain);
    }
  }
  if (input.statusEvidence.some((record) => revoked(record, ordered, keyIds, now)))
    return stop('REVOKED', chain);
  const result = decision(
    input,
    'VALID',
    hash,
    statusSnapshotHash,
    evidence(input.rootCredential, chain),
    !input.offlineInspection
  );
  return input.offlineInspection ? { ...result, warnings: ['OFFLINE_STATUS_NOT_FRESH'] } : result;
}

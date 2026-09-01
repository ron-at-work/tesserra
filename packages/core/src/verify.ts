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
import type { VerificationInput } from './ports.js';

const protocol = 'agent-proof/v1' as const;
const stopWarning: readonly WarningCode[] = ['NOT_ALL_STAGES_EXECUTED'];
const object = (value: unknown): value is JsonObject =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const array = (value: unknown): readonly JsonValue[] | undefined =>
  Array.isArray(value) ? value : undefined;
const string = (value: unknown): value is string => typeof value === 'string';
const integer = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value);
const at = (value: unknown): number | undefined =>
  string(value) && Number.isFinite(Date.parse(value)) ? Date.parse(value) : undefined;
const objectWithout = (value: ArtifactBase, excluded: readonly string[]): JsonObject =>
  Object.fromEntries(
    Object.entries(value).filter(([key]) => !excluded.includes(key))
  ) as JsonObject;
const semantic = (value: ArtifactBase): JsonObject => objectWithout(value, ['proof']);
const canonicalEqual = (left: unknown, right: unknown): boolean => {
  try {
    return canonicalize(left as JsonValue) === canonicalize(right as JsonValue);
  } catch {
    return false;
  }
};
const principalEqual = (left: unknown, right: unknown): boolean => canonicalEqual(left, right);
const artifactRef = (artifact: ArtifactBase): JsonObject | undefined =>
  object(artifact.kind === 'request' ? artifact.delegation_ref : artifact.parent_ref)
    ? ((artifact.kind === 'request' ? artifact.delegation_ref : artifact.parent_ref) as JsonObject)
    : undefined;

interface OutputOptions {
  readonly statusFresh?: boolean;
  readonly replayChecked?: boolean;
  readonly warnings?: readonly WarningCode[];
}
function output(
  input: VerificationInput,
  code: DecisionCode,
  evidenceIds: readonly string[],
  policyHash: string,
  statusSnapshotHash: string,
  options: OutputOptions = {}
): VerificationResult {
  const valid = code === 'VALID';
  return {
    code,
    valid,
    decision_version: protocol,
    verifier_now: utcSeconds(input.now),
    policy_hash: policyHash,
    status_snapshot_hash: statusSnapshotHash,
    evidence_ids: evidenceIds,
    secondary_codes: [],
    status_fresh: options.statusFresh ?? false,
    replay_checked: options.replayChecked ?? false,
    warnings:
      options.warnings ??
      (valid || code === 'REPLAY_DETECTED' || code === 'OFFLINE_REPLAY_UNAVAILABLE'
        ? []
        : stopWarning)
  };
}
function policyHash(snapshot: JsonObject): string {
  return policyHashFor(snapshot);
}
function utcSeconds(date: Date): string {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
function publisherId(record: JsonObject): string {
  const publisher = object(record.publisher) ? record.publisher : undefined;
  return string(publisher?.id) ? publisher.id : '';
}
function targetId(record: JsonObject): string {
  return string(record.target_key_id)
    ? record.target_key_id
    : string(record.target_id)
      ? record.target_id
      : '';
}
function sortText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
function orderedStatusMembers(artifacts: readonly ArtifactBase[]): readonly JsonObject[] {
  const groupOne = artifacts
    .filter((artifact) => artifact.kind === 'key_status' || artifact.kind === 'revocation')
    .map(semantic)
    .sort((left, right) =>
      sortText(
        `${publisherId(left)}\0${targetId(left)}\0${String(left.sequence).padStart(16, '0')}\0${left.kind}`,
        `${publisherId(right)}\0${targetId(right)}\0${String(right.sequence).padStart(16, '0')}\0${right.kind}`
      )
    );
  const groupTwo = artifacts
    .filter((artifact) => artifact.kind === 'key_rotation')
    .map(semantic)
    .sort((left, right) =>
      sortText(
        `${publisherId(left)}\0${left.old_key_id ?? ''}\0${String(left.sequence).padStart(16, '0')}\0${left.kind}`,
        `${publisherId(right)}\0${right.old_key_id ?? ''}\0${String(right.sequence).padStart(16, '0')}\0${right.kind}`
      )
    );
  return [...groupOne, ...groupTwo];
}
function statusHash(artifacts: readonly ArtifactBase[]): string {
  return statusHashFor(orderedStatusMembers(artifacts));
}
function rolesAreDisjoint(snapshot: JsonObject): boolean {
  const issuers = array(snapshot.issuer_authorities) ?? [];
  const publishers = array(snapshot.status_publishers) ?? [];
  const issuerKeys = new Set(
    issuers
      .map((entry) => (object(entry) && string(entry.key_id) ? entry.key_id : undefined))
      .filter((key): key is string => key !== undefined)
  );
  return publishers.every(
    (entry) => !object(entry) || !string(entry.key_id) || !issuerKeys.has(entry.key_id)
  );
}
function validTrustSnapshot(snapshot: JsonObject, calculatedPolicyHash: string): boolean {
  return (
    snapshot.policy_hash === calculatedPolicyHash &&
    integer(snapshot.sequence) &&
    snapshot.sequence >= 1 &&
    string(snapshot.snapshot_id) &&
    string(snapshot.issued_at) &&
    string(snapshot.expires_at) &&
    at(snapshot.issued_at) !== undefined &&
    at(snapshot.expires_at) !== undefined &&
    at(snapshot.issued_at)! <= at(snapshot.expires_at)! &&
    integer(snapshot.max_clock_skew_seconds) &&
    snapshot.max_clock_skew_seconds >= 0 &&
    snapshot.max_clock_skew_seconds <= 300 &&
    integer(snapshot.max_chain_depth) &&
    snapshot.max_chain_depth >= 0 &&
    snapshot.max_chain_depth <= 8 &&
    (snapshot.replay_policy === 'online-required' ||
      snapshot.replay_policy === 'offline-inspection-only') &&
    array(snapshot.issuer_authorities) !== undefined &&
    array(snapshot.status_publishers) !== undefined &&
    rolesAreDisjoint(snapshot) &&
    array(snapshot.roots) !== undefined &&
    array(snapshot.status_high_water) !== undefined
  );
}
function trustKey(
  snapshot: JsonObject,
  keyId: string,
  role: 'issuer_authorities' | 'status_publishers'
): JsonObject | undefined {
  return array(snapshot[role])
    ?.map((candidate) => (object(candidate) ? candidate : undefined))
    .find((candidate) => candidate !== undefined && candidate.key_id === keyId);
}
function jwk(value: unknown): PublicJwk | undefined {
  return validJwk(value as JsonValue) ? (value as PublicJwk) : undefined;
}
function principal(value: unknown): Principal | undefined {
  return validPrincipal(value as JsonValue) ? (value as Principal) : undefined;
}
function publicKey(value: PublicJwk) {
  return createPublicKey({ key: { kty: value.kty, crv: value.crv, x: value.x }, format: 'jwk' });
}
function signatureValid(artifact: ArtifactBase, value: PublicJwk): boolean {
  try {
    return verifySignature(
      null,
      signingInputFor(artifact),
      publicKey(value),
      decodeBase64Url(artifact.proof.sig, 64)
    );
  } catch {
    return false;
  }
}
function canonicalUri(resource: JsonObject): boolean {
  if (resource.type !== 'uri' || !string(resource.value)) return true;
  try {
    const parsed = new URL(resource.value);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === parsed.hostname.toLowerCase() &&
      parsed.port === '' &&
      parsed.username === '' &&
      parsed.password === '' &&
      parsed.search === '' &&
      parsed.hash === '' &&
      !resource.value.includes('%') &&
      !resource.value.split('/').some((segment) => segment === '.' || segment === '..') &&
      /^[A-Za-z0-9._~/-]*$/.test(parsed.pathname)
    );
  } catch {
    return false;
  }
}
function contains(values: unknown, expected: unknown): boolean {
  return (array(values) ?? []).some((value) => canonicalEqual(value, expected));
}
function constraints(value: ArtifactBase): JsonObject | undefined {
  return object(value.constraints)
    ? value.constraints
    : object(value.authority_ceiling)
      ? value.authority_ceiling
      : undefined;
}
function intervalValid(value: ArtifactBase): boolean {
  const local = constraints(value);
  if (string(value.not_before) || string(value.expires_at)) {
    const notBefore = at(value.not_before);
    const issuedAt = at(value.issued_at);
    const expiresAt = at(value.expires_at);
    if (
      notBefore === undefined ||
      issuedAt === undefined ||
      expiresAt === undefined ||
      notBefore > issuedAt ||
      issuedAt > expiresAt
    )
      return false;
  }
  if (!local) return true;
  const notBefore = at(local.not_before);
  const expiresAt = at(local.expires_at);
  return notBefore !== undefined && expiresAt !== undefined && notBefore <= expiresAt;
}
function statusFor(records: readonly ArtifactBase[], keyId: string): ArtifactBase | undefined {
  return records
    .filter((record) => record.kind === 'key_status' && record.target_key_id === keyId)
    .sort((left, right) => Number(right.sequence) - Number(left.sequence))[0];
}
function highWater(
  snapshot: JsonObject,
  publisher: unknown,
  targetKeyId: string
): JsonObject | undefined {
  return array(snapshot.status_high_water)
    ?.map((candidate) => (object(candidate) ? candidate : undefined))
    .find(
      (candidate) =>
        candidate !== undefined &&
        candidate.target_key_id === targetKeyId &&
        principalEqual(candidate.publisher, publisher)
    );
}
function statusChainValid(records: readonly ArtifactBase[], selected: ArtifactBase): boolean {
  const same = records
    .filter(
      (record) =>
        record.kind === 'key_status' &&
        record.target_key_id === selected.target_key_id &&
        principalEqual(record.publisher, selected.publisher)
    )
    .sort((left, right) => Number(left.sequence) - Number(right.sequence));
  if (same.length === 0 || same[0]!.sequence !== 1 || same[0]!.previous_digest !== null)
    return false;
  for (let index = 1; index < same.length; index += 1) {
    const previous = same[index - 1]!;
    const current = same[index]!;
    if (
      Number(current.sequence) !== Number(previous.sequence) + 1 ||
      current.previous_digest !== semanticDigestFor(previous)
    )
      return false;
  }
  return same.at(-1)?.id === selected.id;
}
function revokes(
  record: ArtifactBase,
  artifact: ArtifactBase,
  keyIds: ReadonlySet<string>,
  now: number
): boolean {
  if (record.kind !== 'revocation' || (at(record.effective_at) ?? Infinity) > now) return false;
  if (record.target_type === 'key') return keyIds.has(String(record.target_id));
  return record.target_id === artifact.id;
}

/** RFC 0001 verifier: PARSE → VERSION → CRYPTO → TIME → TRUST → CHAIN → STATUS → BINDING → REPLAY. */
export function verifyArtifacts(input: VerificationInput): VerificationResult {
  let calculatedPolicyHash: string;
  try {
    calculatedPolicyHash = policyHash(input.trustSnapshot);
  } catch {
    // The result shape requires a policy URN even when hostile input cannot be
    // canonicalized. This is a deterministic sentinel, never a trusted policy hash.
    calculatedPolicyHash = policyHashFor({ invalid_policy_snapshot: true });
  }
  const calculatedStatusHash = statusHash(input.artifacts);
  const evidence: string[] = [];
  const stop = (
    code: DecisionCode,
    ids: readonly string[] = evidence,
    options: OutputOptions = {}
  ): VerificationResult =>
    output(input, code, ids, calculatedPolicyHash, calculatedStatusHash, options);

  const preflightRoot = input.artifacts.find(
    (artifact) =>
      artifact.kind === 'credential' && artifact.credential_purpose === 'agent-root-authority'
  );
  const preflightRequest = input.artifacts.find((artifact) => artifact.kind === 'request');
  const preflightChainEvidence = (): readonly string[] => [
    ...(preflightRoot === undefined ? [] : [preflightRoot.id]),
    ...input.artifacts
      .filter((artifact) => artifact.kind === 'delegation')
      .map((artifact) => artifact.id),
    ...(preflightRequest === undefined
      ? input.artifacts
          .filter(
            (artifact) =>
              !['credential', 'delegation', 'key_status', 'revocation', 'key_rotation'].includes(
                artifact.kind
              )
          )
          .map((artifact) => artifact.id)
      : [preflightRequest.id])
  ];

  // PARSE — objects enter only after protocol raw parsing; retain defensive envelope and identity checks.
  for (const artifact of input.artifacts) {
    if (!validateOuterEnvelope(artifact)) return stop('SCHEMA_INVALID');
    if (artifact.id !== artifactIdFor(artifact))
      return stop('ID_MISMATCH', preflightChainEvidence());
    const embeddedJwk = jwk(artifact.public_jwk);
    if (embeddedJwk && artifact.key_id !== keyIdFor(embeddedJwk))
      return stop('KEY_ID_MISMATCH', preflightChainEvidence());
    const resource = object(artifact.resource) ? artifact.resource : undefined;
    const local = constraints(artifact);
    if (
      (resource && !canonicalUri(resource)) ||
      (local &&
        (array(local.resources) ?? [])
          .map((item) => (object(item) ? item : undefined))
          .some((item) => item && !canonicalUri(item)))
    )
      return stop('NON_CANONICAL', preflightChainEvidence());
  }
  // VERSION — must run before supported-kind schema validation.
  for (const artifact of input.artifacts) {
    if (artifact.version !== protocol) return stop('UNSUPPORTED_VERSION', preflightChainEvidence());
    if (
      ![
        'credential',
        'delegation',
        'request',
        'provenance',
        'key_status',
        'revocation',
        'key_rotation'
      ].includes(artifact.kind)
    )
      return stop('UNSUPPORTED_KIND', preflightChainEvidence());
    if (artifact.proof.alg !== 'Ed25519')
      return stop('UNSUPPORTED_ALGORITHM', preflightChainEvidence());
    if (artifact.critical !== undefined)
      return stop('UNSUPPORTED_CRITICAL_SEMANTICS', preflightChainEvidence());
    const resource = object(artifact.resource) ? artifact.resource : undefined;
    const local = constraints(artifact);
    if (
      (resource && !['uri', 'opaque'].includes(String(resource.type))) ||
      (local &&
        (array(local.resources) ?? [])
          .map((item) => (object(item) ? item : undefined))
          .some((item) => item && !['uri', 'opaque'].includes(String(item.type))))
    )
      return stop('UNSUPPORTED_RESOURCE_TYPE', preflightChainEvidence());
    if (!validateArtifact(artifact)) return stop('SCHEMA_INVALID', preflightChainEvidence());
    evidence.push(artifact.id);
  }
  if (!validTrustSnapshot(input.trustSnapshot, calculatedPolicyHash))
    return stop('TRUST_SNAPSHOT_INVALID', preflightChainEvidence());
  const artifacts = new Map<string, ArtifactBase>();
  for (const artifact of input.artifacts) {
    if (artifacts.has(artifact.id)) return stop('CHAIN_PARENT_AMBIGUOUS');
    artifacts.set(artifact.id, artifact);
  }
  const credentials = input.artifacts.filter((artifact) => artifact.kind === 'credential');
  const keyCredentials = new Map(
    credentials.map((credential) => [String(credential.key_id), credential])
  );
  const requestArtifact = input.artifacts.find((artifact) => artifact.kind === 'request');
  const rootCandidate = credentials.find(
    (credential) => credential.credential_purpose === 'agent-root-authority'
  );
  const requestEvidence = (): readonly string[] => {
    if (!requestArtifact || !rootCandidate) return evidence;
    const resolved: ArtifactBase[] = [requestArtifact];
    let current = requestArtifact;
    while (current.kind === 'request' || current.kind === 'delegation') {
      const reference = artifactRef(current);
      const parent = string(reference?.id) ? artifacts.get(reference.id) : undefined;
      if (!parent || resolved.some((artifact) => artifact.id === parent.id)) break;
      resolved.push(parent);
      current = parent;
    }
    return [
      rootCandidate.id,
      ...resolved
        .slice()
        .reverse()
        .filter((artifact) => artifact.id !== rootCandidate.id)
        .map((artifact) => artifact.id)
    ];
  };

  // CRYPTO — resolve only pinned keys, verify signatures, and bind signer principals to their credential keys.
  for (const artifact of input.artifacts) {
    const keyId = artifact.proof.kid;
    const pinned =
      artifact.kind === 'credential' || artifact.kind === 'key_rotation'
        ? trustKey(input.trustSnapshot, keyId, 'issuer_authorities')
        : artifact.kind === 'key_status' || artifact.kind === 'revocation'
          ? trustKey(input.trustSnapshot, keyId, 'status_publishers')
          : undefined;
    const signerCredential = !pinned ? keyCredentials.get(keyId) : undefined;
    const verificationJwk = jwk(pinned?.public_jwk) ?? jwk(signerCredential?.public_jwk);
    if (!verificationJwk) {
      if (artifact.kind === 'credential') {
        const issuerKnown = array(input.trustSnapshot.issuer_authorities)?.some(
          (candidate) => object(candidate) && principalEqual(candidate.principal, artifact.issuer)
        );
        return stop(issuerKnown ? 'UNTRUSTED_KEY' : 'UNTRUSTED_ISSUER', requestEvidence());
      }
      return stop('MISSING_REFERENCE', requestEvidence());
    }
    if (!signatureValid(artifact, verificationJwk))
      return stop('INVALID_SIGNATURE', requestEvidence());
    if (
      artifact.kind === 'delegation' &&
      (!signerCredential || !principalEqual(signerCredential.subject, artifact.delegator))
    )
      return stop('SIGNER_MISMATCH', requestEvidence());
    if (
      artifact.kind === 'request' &&
      (!signerCredential || !principalEqual(signerCredential.subject, artifact.signer))
    )
      return stop('SIGNER_MISMATCH', requestEvidence());
    if (
      (artifact.kind === 'key_status' || artifact.kind === 'revocation') &&
      (!pinned || !principalEqual(pinned.principal, artifact.publisher))
    )
      return stop('UNTRUSTED_KEY', requestEvidence());
    if (
      artifact.kind === 'key_rotation' &&
      (!pinned || !principalEqual(pinned.principal, artifact.publisher))
    )
      return stop('UNTRUSTED_KEY', requestEvidence());
  }
  const request = input.artifacts.find((artifact) => artifact.kind === 'request');
  if (!request) return stop('MISSING_REFERENCE', requestEvidence());
  if (
    request.payload_digest !== input.context.expectedPayloadDigest ||
    request.task_context_digest !== input.context.expectedTaskContextDigest
  )
    return stop('INVALID_DIGEST_LINKAGE', requestEvidence());

  // TIME
  const now = input.now.getTime();
  const skew = Number(input.trustSnapshot.max_clock_skew_seconds) * 1000;
  for (const artifact of input.artifacts) {
    if (!intervalValid(artifact)) return stop('INVALID_TIME_INTERVAL', requestEvidence());
    const local = constraints(artifact);
    const starts = [at(artifact.not_before), at(local?.not_before)].filter(
      (value): value is number => value !== undefined
    );
    const ends = [at(artifact.expires_at), at(local?.expires_at)].filter(
      (value): value is number => value !== undefined
    );
    if (starts.some((value) => now < value - skew)) return stop('NOT_YET_VALID', requestEvidence());
    if (ends.some((value) => now > value + skew)) return stop('EXPIRED', requestEvidence());
  }

  // TRUST
  const root = credentials.find(
    (credential) => credential.credential_purpose === 'agent-root-authority'
  );
  if (!root) return stop('MIXED_TRUST_ROOT', preflightChainEvidence());
  const rootIssuer = trustKey(input.trustSnapshot, root.proof.kid, 'issuer_authorities');
  if (!rootIssuer || !principalEqual(rootIssuer.principal, root.issuer))
    return stop('UNTRUSTED_ISSUER', preflightChainEvidence());
  const rootAllowed = array(input.trustSnapshot.roots)?.some(
    (candidate) =>
      object(candidate) &&
      principalEqual(candidate.issuer, root.issuer) &&
      principalEqual(candidate.root_subject, root.subject) &&
      candidate.credential_purpose === 'agent-root-authority'
  );
  if (!rootAllowed) return stop('MIXED_TRUST_ROOT', preflightChainEvidence());

  // CHAIN — exactly request → zero/more delegation → root credential with typed references and linked principals.
  const chain: ArtifactBase[] = [request];
  const chainEvidence = (): string[] => [
    root.id,
    ...chain
      .slice()
      .reverse()
      .filter((artifact) => artifact.id !== root.id)
      .map((artifact) => artifact.id)
  ];
  const failureEvidence = (): string[] => {
    const failing =
      input.artifacts.find(
        (artifact) =>
          artifact.kind === 'delegation' &&
          object(artifact.parent_ref) &&
          !artifacts.has(String(artifact.parent_ref.id))
      ) ?? current;
    return [
      root.id,
      failing.id,
      ...chain
        .slice()
        .reverse()
        .filter((artifact) => artifact.id !== root.id && artifact.id !== failing.id)
        .map((artifact) => artifact.id)
    ];
  };
  let current = request;
  while (current.kind === 'request' || current.kind === 'delegation') {
    const reference = artifactRef(current);
    const parentId = string(reference?.id) ? reference.id : undefined;
    const parent = parentId ? artifacts.get(parentId) : undefined;
    if (!parent)
      return stop(
        current.kind === 'request' ? 'MISSING_REFERENCE' : 'CHAIN_PARENT_MISSING',
        current.kind === 'request' ? preflightChainEvidence() : failureEvidence()
      );
    if (parent.kind !== reference?.kind) return stop('MISSING_REFERENCE', chainEvidence());
    if (current.kind === 'request' && reference?.kind !== 'delegation')
      return stop('MISSING_REFERENCE', chainEvidence());
    if (chain.some((entry) => entry.id === parent.id))
      return stop('CHAIN_BOUNDS_EXCEEDED', chainEvidence());
    if (
      current.kind === 'request' &&
      parent.kind === 'delegation' &&
      !principalEqual(current.signer, parent.delegate)
    )
      return stop('SIGNER_MISMATCH', chainEvidence());
    if (current.kind === 'delegation') {
      if (
        parent.kind === 'credential' &&
        (!principalEqual(current.delegator, parent.subject) ||
          parent.credential_purpose !== 'agent-root-authority')
      )
        return stop('CHAIN_PARENT_MISSING', chainEvidence());
      if (parent.kind === 'delegation' && !principalEqual(current.delegator, parent.delegate))
        return stop('CHAIN_PARENT_MISSING', chainEvidence());
    }
    chain.push(parent);
    current = parent;
  }
  if (current.id !== root.id || chain.length - 2 > Number(input.trustSnapshot.max_chain_depth))
    return stop('CHAIN_BOUNDS_EXCEEDED', chainEvidence());
  for (let index = 1; index < chain.length - 1; index += 1) {
    const child = constraints(chain[index]!);
    const parent = constraints(chain[index + 1]!);
    if (
      !child ||
      !parent ||
      Number(child.remaining_depth) >= Number(parent.remaining_depth) ||
      at(child.not_before)! < at(parent.not_before)! ||
      at(child.expires_at)! > at(parent.expires_at)!
    )
      return stop('ATTENUATION_VIOLATION', chainEvidence());
    for (const field of ['capabilities', 'resources', 'tasks', 'audiences'] as const)
      if ((array(child[field]) ?? []).some((value) => !contains(parent[field], value)))
        return stop('ATTENUATION_VIOLATION', chainEvidence());
  }

  // STATUS — offline inspection still enforces supplied key state and revocations.
  // It skips only high-water/freshness requirements, which need current online state.
  const offlineInspection =
    input.replayMode === 'offline' &&
    input.trustSnapshot.replay_policy === 'offline-inspection-only';
  const keys = new Set(
    chain.flatMap((artifact) =>
      [artifact.proof.kid, string(artifact.key_id) ? artifact.key_id : undefined].filter(
        (value): value is string => value !== undefined
      )
    )
  );
  for (const keyId of keys) {
    const selected = statusFor(input.artifacts, keyId);
    if (offlineInspection && !selected) continue;
    if (!selected)
      return stop(
        'STATUS_UNAVAILABLE',
        chain
          .slice()
          .reverse()
          .map((artifact) => artifact.id)
      );
    if (selected.state !== 'active')
      return stop(
        'KEY_NOT_USABLE',
        chain
          .slice()
          .reverse()
          .map((artifact) => artifact.id)
      );
    if (!statusChainValid(input.artifacts, selected))
      return stop(
        'STATUS_UNAVAILABLE',
        chain
          .slice()
          .reverse()
          .map((artifact) => artifact.id)
      );
    if (!offlineInspection) {
      const water = highWater(input.trustSnapshot, selected.publisher, keyId);
      if (
        !water ||
        water.sequence !== selected.sequence ||
        water.semantic_digest !== semanticDigestFor(selected)
      )
        return stop(
          'STATUS_ROLLBACK',
          chain
            .slice()
            .reverse()
            .map((artifact) => artifact.id)
        );
      if ((at(selected.as_of) ?? Infinity) > now || (at(selected.valid_until) ?? -Infinity) < now)
        return stop(
          'STATUS_STALE',
          chain
            .slice()
            .reverse()
            .map((artifact) => artifact.id)
        );
    }
  }
  for (const record of input.artifacts)
    if ([...chain].some((artifact) => revokes(record, artifact, keys, now)))
      return stop(
        'REVOKED',
        chain
          .slice()
          .reverse()
          .map((artifact) => artifact.id)
      );

  // BINDING
  const effective = constraints(chain[1] ?? root);
  const evidenceIds = chain
    .slice()
    .reverse()
    .map((artifact) => artifact.id);
  const bindingOptions = offlineInspection ? {} : { statusFresh: true };
  if (!principalEqual(request.signer, input.context.expectedSigner))
    return stop('SIGNER_MISMATCH', evidenceIds, bindingOptions);
  if (request.audience !== input.context.audience)
    return stop('AUDIENCE_MISMATCH', evidenceIds, bindingOptions);
  if (
    !effective ||
    !contains(effective.capabilities, request.action) ||
    !contains(effective.capabilities, input.context.action)
  )
    return stop('ACTION_NOT_ALLOWED', evidenceIds, bindingOptions);
  if (
    !contains(effective.resources, request.resource) ||
    !canonicalEqual(request.resource, input.context.resource)
  )
    return stop('RESOURCE_NOT_ALLOWED', evidenceIds, bindingOptions);
  if (!contains(effective.tasks, request.task) || request.task !== input.context.task)
    return stop('TASK_NOT_ALLOWED', evidenceIds, bindingOptions);

  // REPLAY
  if (offlineInspection)
    return stop('VALID', evidenceIds, {
      warnings: ['OFFLINE_STATUS_NOT_FRESH', 'OFFLINE_REPLAY_NOT_CHECKED']
    });
  if (input.context.replayRequired && input.replayMode === 'offline')
    return stop('OFFLINE_REPLAY_UNAVAILABLE', evidenceIds, { statusFresh: true });
  if (input.context.replayRequired && input.replay === 'duplicate')
    return stop('REPLAY_DETECTED', evidenceIds, { statusFresh: true, replayChecked: true });
  const archived = input.archivedSnapshot;
  if (archived !== undefined) {
    const policyContent = object(archived.policy_content) ? archived.policy_content : undefined;
    const statusMembers = array(archived.status_members);
    const historicalValid =
      archived.verification_mode === 'historical' &&
      policyContent !== undefined &&
      statusMembers !== undefined &&
      archived.policy_hash === policyHashFor(policyContent) &&
      archived.status_snapshot_hash === statusHashFor(statusMembers.filter(object));
    if (!historicalValid) return stop('TRUST_SNAPSHOT_INVALID', evidenceIds, { statusFresh: true });
    return stop('VALID', evidenceIds, {
      statusFresh: true,
      replayChecked: input.context.replayRequired,
      warnings: ['HISTORICAL_SNAPSHOT']
    });
  }
  return stop('VALID', evidenceIds, {
    statusFresh: true,
    replayChecked: input.context.replayRequired
  });
}

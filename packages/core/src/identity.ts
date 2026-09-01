import { createPublicKey, verify as verifySignature, type JsonWebKey } from 'node:crypto';
import {
  artifactIdFor,
  canonicalize,
  decodeBase64Url,
  keyIdFor,
  parseStrictJson,
  policyHashFor,
  signingInputFor,
  statusHashFor,
  type ArtifactBase,
  type DecisionCode,
  type JsonObject,
  type JsonValue,
  type Principal,
  type PublicJwk,
  type VerificationResult,
  validateArtifact,
  validateOuterEnvelope
} from '@agent-proof/protocol';

export interface IdentityVerificationInput {
  readonly credential: ArtifactBase | Uint8Array;
  readonly trustSnapshot: JsonObject;
  readonly now: Date;
}

const protocol = 'agent-proof/v1' as const;
const statusHash = statusHashFor([]);

function decision(
  now: Date,
  policyHash: string,
  code: DecisionCode,
  evidenceIds: readonly string[] = []
): VerificationResult {
  return {
    code,
    valid: code === 'VALID',
    decision_version: protocol,
    verifier_now: now.toISOString().replace('.000Z', 'Z'),
    policy_hash: policyHash,
    status_snapshot_hash: statusHash,
    evidence_ids: evidenceIds,
    secondary_codes: [],
    status_fresh: false,
    replay_checked: false,
    warnings:
      code === 'VALID'
        ? ['OFFLINE_STATUS_NOT_FRESH', 'OFFLINE_REPLAY_NOT_CHECKED']
        : ['NOT_ALL_STAGES_EXECUTED']
  };
}

function policyHash(snapshot: JsonObject): string {
  try {
    return policyHashFor(snapshot);
  } catch {
    return 'urn:agent-proof:policy:v1:sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
  }
}

function asObject(value: JsonValue | undefined): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined;
}

function asPrincipal(value: JsonValue | undefined): Principal | undefined {
  const candidate = asObject(value);
  if (
    candidate === undefined ||
    typeof candidate.type !== 'string' ||
    (typeof candidate.id !== 'string' && asObject(candidate.id) === undefined)
  )
    return undefined;
  return candidate as unknown as Principal;
}

function asJwk(value: JsonValue | undefined): PublicJwk | undefined {
  const candidate = asObject(value);
  if (candidate?.kty !== 'OKP' || candidate.crv !== 'Ed25519' || typeof candidate.x !== 'string')
    return undefined;
  return candidate as unknown as PublicJwk;
}

function equalJson(left: unknown, right: unknown): boolean {
  try {
    return canonicalize(left as JsonValue) === canonicalize(right as JsonValue);
  } catch {
    return false;
  }
}

function issuerAuthority(snapshot: JsonObject, issuer: Principal): JsonObject | undefined {
  const authorities = snapshot.issuer_authorities;
  if (!Array.isArray(authorities)) return undefined;
  return authorities
    .map((authority) => asObject(authority))
    .find((authority) => authority !== undefined && equalJson(authority.principal, issuer));
}

/**
 * Verifies one identity credential with the core RFC pipeline. The caller supplies
 * the explicit verification instant and local trust policy; no I/O occurs here.
 */
export function verifyIdentityCredential(input: IdentityVerificationInput): VerificationResult {
  const hash = policyHash(input.trustSnapshot);
  let value: unknown = input.credential;
  if (input.credential instanceof Uint8Array) {
    try {
      value = parseStrictJson(input.credential);
    } catch (error) {
      const code =
        error instanceof Error && 'code' in error && typeof error.code === 'string'
          ? (error.code as DecisionCode)
          : 'MALFORMED_JSON';
      return decision(input.now, hash, code);
    }
  }
  if (!validateOuterEnvelope(value)) return decision(input.now, hash, 'SCHEMA_INVALID');
  const credential = value;
  const evidence = [credential.id];
  if (credential.version !== protocol)
    return decision(input.now, hash, 'UNSUPPORTED_VERSION', evidence);
  if (credential.kind !== 'credential')
    return decision(input.now, hash, 'UNSUPPORTED_KIND', evidence);
  if (credential.proof.alg !== 'Ed25519')
    return decision(input.now, hash, 'UNSUPPORTED_ALGORITHM', evidence);
  if (!validateArtifact(credential)) return decision(input.now, hash, 'SCHEMA_INVALID', evidence);
  if (credential.id !== artifactIdFor(credential))
    return decision(input.now, hash, 'ID_MISMATCH', evidence);
  const publicJwk = asJwk(credential.public_jwk);
  if (publicJwk === undefined || credential.key_id !== keyIdFor(publicJwk))
    return decision(input.now, hash, 'KEY_ID_MISMATCH', evidence);
  const issuedAt = Date.parse(credential.issued_at);
  const notBefore = Date.parse(credential.not_before as string);
  const expiresAt = Date.parse(credential.expires_at as string);
  if (notBefore > issuedAt || issuedAt > expiresAt)
    return decision(input.now, hash, 'INVALID_TIME_INTERVAL', evidence);
  const skewSeconds = input.trustSnapshot.max_clock_skew_seconds;
  if (
    typeof skewSeconds !== 'number' ||
    !Number.isSafeInteger(skewSeconds) ||
    skewSeconds < 0 ||
    skewSeconds > 300 ||
    input.trustSnapshot.policy_hash !== hash ||
    typeof input.trustSnapshot.sequence !== 'number' ||
    !Number.isSafeInteger(input.trustSnapshot.sequence) ||
    input.trustSnapshot.sequence < 1 ||
    !Array.isArray(input.trustSnapshot.roots) ||
    !Array.isArray(input.trustSnapshot.status_publishers)
  ) {
    return decision(input.now, hash, 'TRUST_SNAPSHOT_INVALID', evidence);
  }
  const now = input.now.getTime();
  if (now < notBefore - skewSeconds * 1000)
    return decision(input.now, hash, 'NOT_YET_VALID', evidence);
  if (now > expiresAt + skewSeconds * 1000) return decision(input.now, hash, 'EXPIRED', evidence);
  const issuer = asPrincipal(credential.issuer);
  if (issuer === undefined) return decision(input.now, hash, 'SCHEMA_INVALID', evidence);
  const authority = issuerAuthority(input.trustSnapshot, issuer);
  if (authority === undefined) return decision(input.now, hash, 'UNTRUSTED_ISSUER', evidence);
  const issuerKey = asJwk(authority.public_jwk);
  if (authority.key_id !== credential.proof.kid || issuerKey === undefined)
    return decision(input.now, hash, 'UNTRUSTED_KEY', evidence);
  try {
    const key = createPublicKey({ key: issuerKey as JsonWebKey, format: 'jwk' });
    if (
      !verifySignature(
        null,
        signingInputFor(credential),
        key,
        decodeBase64Url(credential.proof.sig, 64)
      )
    )
      return decision(input.now, hash, 'INVALID_SIGNATURE', evidence);
  } catch {
    return decision(input.now, hash, 'INVALID_SIGNATURE', evidence);
  }
  const trustedRoot = input.trustSnapshot.roots.some((root) => {
    const candidate = asObject(root);
    return (
      candidate !== undefined &&
      candidate.credential_purpose === credential.credential_purpose &&
      equalJson(candidate.issuer, credential.issuer) &&
      equalJson(candidate.root_subject, credential.subject)
    );
  });
  return trustedRoot
    ? decision(input.now, hash, 'VALID', evidence)
    : decision(input.now, hash, 'MIXED_TRUST_ROOT', evidence);
}

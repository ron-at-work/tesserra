import { parseStrictJson, StrictJsonError } from '@agent-proof/protocol';
import type { AgentId, Constraints, JsonValue, Principal, PublicJwk } from '@agent-proof/protocol';

/** Strict raw JSON parser used by every HTTP transport edge. */
export { StrictJsonError };
export type { JsonValue };
export function parseApiJson(input: Uint8Array): JsonValue {
  return parseStrictJson(input);
}
/** Public local HTTP models. They deliberately do not expose private key or provider data. */

export const apiVersion = 'v1' as const;
export const apiBasePath = '/v1' as const;

export interface ErrorEnvelope {
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details: readonly string[];
  };
  readonly requestId: string;
}

export type AgentIdDto = AgentId;
export type PrincipalDto = Principal;
export type AuthorityCeilingDto = Constraints;

export interface CredentialDto {
  readonly version: 'agent-proof/v1';
  readonly kind: 'credential';
  readonly id: string;
  readonly issued_at: string;
  readonly proof: { readonly alg: 'Ed25519'; readonly kid: string; readonly sig: string };
  readonly issuer: PrincipalDto;
  readonly subject: PrincipalDto & { readonly type: 'agent'; readonly id: AgentIdDto };
  readonly public_jwk: PublicJwk;
  readonly key_id: string;
  readonly not_before: string;
  readonly expires_at: string;
  readonly credential_purpose: 'agent-root-authority' | 'agent-key-binding';
  readonly authority_ceiling: AuthorityCeilingDto;
}

export interface CreateIdentityRequest {
  readonly subject: AgentIdDto;
  readonly issuer: PrincipalDto;
  readonly authorityCeiling: AuthorityCeilingDto;
  readonly credentialPurpose?: 'agent-root-authority' | 'agent-key-binding';
}

export interface IdentityResponse {
  readonly id: string;
  readonly credential: CredentialDto;
  readonly createdAt: string;
}

export interface VerifyIdentityRequest {
  readonly credential: CredentialDto;
}

export interface VerificationResponse {
  readonly valid: boolean;
  readonly code: string;
  readonly decision_version: 'agent-proof/v1';
  readonly evidence_ids: readonly string[];
  readonly policy_hash: string;
  readonly status_snapshot_hash: string;
  readonly replay_checked: boolean;
  readonly secondary_codes: readonly string[];
  readonly status_fresh: boolean;
  readonly verifier_now: string;
  readonly warnings: readonly string[];
}

export interface ListAgentsResponse {
  readonly items: readonly IdentityResponse[];
  readonly nextCursor?: string;
}

/** Sensitive trust policy is read-only over HTTP and contains no private material. */
export interface TrustSnapshotResponse {
  readonly snapshot: Record<string, unknown>;
}

export interface ReloadTrustSnapshotResponse {
  readonly snapshot: Record<string, unknown>;
}

export const routes = {
  createIdentity: 'POST /v1/identities',
  getIdentity: 'GET /v1/identities/{id}',
  verifyIdentity: 'POST /v1/verifications/identity',
  listAgents: 'GET /v1/agents',
  readTrustSnapshot: 'GET /v1/trust-anchors',
  reloadTrustSnapshot: 'POST /v1/trust-snapshots:reload'
} as const;

export function isErrorEnvelope(value: unknown): value is ErrorEnvelope {
  if (typeof value !== 'object' || value === null) return false;
  const candidate = value as { error?: unknown; requestId?: unknown };
  return (
    typeof candidate.requestId === 'string' &&
    typeof candidate.error === 'object' &&
    candidate.error !== null &&
    typeof (candidate.error as { code?: unknown }).code === 'string' &&
    typeof (candidate.error as { message?: unknown }).message === 'string'
  );
}

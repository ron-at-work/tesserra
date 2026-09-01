export const PROTOCOL_VERSION = 'agent-proof/v1' as const;
export const SUPPORTED_KINDS = [
  'credential',
  'delegation',
  'request',
  'provenance',
  'key_status',
  'revocation',
  'key_rotation'
] as const;
export type ArtifactKind = (typeof SUPPORTED_KINDS)[number];
export type DecisionCode =
  | 'VALID'
  | 'MALFORMED_UTF8'
  | 'MALFORMED_JSON'
  | 'DUPLICATE_MEMBER'
  | 'SCHEMA_INVALID'
  | 'NON_CANONICAL'
  | 'ID_MISMATCH'
  | 'KEY_ID_MISMATCH'
  | 'UNSUPPORTED_VERSION'
  | 'UNSUPPORTED_KIND'
  | 'UNSUPPORTED_ALGORITHM'
  | 'UNSUPPORTED_CRITICAL_SEMANTICS'
  | 'UNSUPPORTED_RESOURCE_TYPE'
  | 'MISSING_REFERENCE'
  | 'INVALID_SIGNATURE'
  | 'INVALID_DIGEST_LINKAGE'
  | 'NOT_YET_VALID'
  | 'EXPIRED'
  | 'INVALID_TIME_INTERVAL'
  | 'TRUST_SNAPSHOT_INVALID'
  | 'UNTRUSTED_ISSUER'
  | 'UNTRUSTED_KEY'
  | 'MIXED_TRUST_ROOT'
  | 'KEY_NOT_USABLE'
  | 'CHAIN_PARENT_MISSING'
  | 'CHAIN_PARENT_AMBIGUOUS'
  | 'CHAIN_BOUNDS_EXCEEDED'
  | 'ATTENUATION_VIOLATION'
  | 'STATUS_UNAVAILABLE'
  | 'STATUS_STALE'
  | 'STATUS_ROLLBACK'
  | 'REVOKED'
  | 'SIGNER_MISMATCH'
  | 'AUDIENCE_MISMATCH'
  | 'ACTION_NOT_ALLOWED'
  | 'RESOURCE_NOT_ALLOWED'
  | 'TASK_NOT_ALLOWED'
  | 'REPLAY_DETECTED'
  | 'OFFLINE_REPLAY_UNAVAILABLE';
export type WarningCode =
  | 'NOT_ALL_STAGES_EXECUTED'
  | 'OFFLINE_STATUS_NOT_FRESH'
  | 'OFFLINE_REPLAY_NOT_CHECKED'
  | 'HISTORICAL_SNAPSHOT';
export type JsonPrimitive = null | boolean | number | string;
export type JsonValue = JsonPrimitive | JsonValue[] | { readonly [key: string]: JsonValue };
export type JsonObject = { readonly [key: string]: JsonValue } & {
  readonly version?: JsonValue;
  readonly kind?: JsonValue;
  readonly id?: JsonValue;
  readonly issued_at?: JsonValue;
  readonly proof?: JsonValue;
  readonly alg?: JsonValue;
  readonly kid?: JsonValue;
  readonly sig?: JsonValue;
  readonly issuer?: JsonValue;
  readonly subject?: JsonValue;
  readonly public_jwk?: JsonValue;
  readonly key_id?: JsonValue;
  readonly not_before?: JsonValue;
  readonly expires_at?: JsonValue;
  readonly credential_purpose?: JsonValue;
  readonly authority_ceiling?: JsonValue;
  readonly delegator?: JsonValue;
  readonly delegate?: JsonValue;
  readonly parent_ref?: JsonValue;
  readonly constraints?: JsonValue;
  readonly signer?: JsonValue;
  readonly delegation_ref?: JsonValue;
  readonly request_id?: JsonValue;
  readonly nonce?: JsonValue;
  readonly action?: JsonValue;
  readonly resource?: JsonValue;
  readonly task?: JsonValue;
  readonly audience?: JsonValue;
  readonly payload_digest?: JsonValue;
  readonly task_context_digest?: JsonValue;
  readonly publisher?: JsonValue;
  readonly effective_at?: JsonValue;
  readonly as_of?: JsonValue;
  readonly valid_until?: JsonValue;
  readonly sequence?: JsonValue;
  readonly previous_digest?: JsonValue;
  readonly target_key_id?: JsonValue;
  readonly state?: JsonValue;
  readonly target_type?: JsonValue;
  readonly target_id?: JsonValue;
  readonly reason?: JsonValue;
  readonly old_key_id?: JsonValue;
  readonly new_key_id?: JsonValue;
  readonly activation_time?: JsonValue;
  readonly retirement_time?: JsonValue;
  readonly kty?: JsonValue;
  readonly crv?: JsonValue;
  readonly x?: JsonValue;
  readonly type?: JsonValue;
  readonly scheme?: JsonValue;
  readonly authority?: JsonValue;
  readonly path?: JsonValue;
  readonly capabilities?: JsonValue;
  readonly resources?: JsonValue;
  readonly tasks?: JsonValue;
  readonly audiences?: JsonValue;
  readonly remaining_depth?: JsonValue;
  readonly critical?: JsonValue;
  readonly policy_hash?: JsonValue;
  readonly max_clock_skew_seconds?: JsonValue;
  readonly max_chain_depth?: JsonValue;
  readonly issuer_authorities?: JsonValue;
  readonly status_publishers?: JsonValue;
  readonly roots?: JsonValue;
  readonly status_high_water?: JsonValue;
  readonly replay_policy?: JsonValue;
  readonly value?: JsonValue;
};
export interface AgentId {
  readonly scheme: 'agid';
  readonly version: 1;
  readonly authority: string;
  readonly path: readonly string[];
}
export interface Principal {
  readonly type: 'human' | 'service' | 'agent' | 'workload' | 'oauth_client' | 'model';
  readonly id: string | AgentId;
}
export interface PublicJwk {
  readonly kty: 'OKP';
  readonly crv: 'Ed25519';
  readonly x: string;
}
export interface Proof {
  readonly alg: string;
  readonly kid: string;
  readonly sig: string;
  readonly [key: string]: JsonValue;
}
export interface Resource {
  readonly type: string;
  readonly value: string;
}
export interface Constraints {
  readonly capabilities: readonly string[];
  readonly resources: readonly Resource[];
  readonly tasks: readonly string[];
  readonly audiences: readonly string[];
  readonly not_before: string;
  readonly expires_at: string;
  readonly remaining_depth: number;
}
export interface ArtifactBase {
  readonly version: string;
  readonly kind: string;
  readonly id: string;
  readonly issued_at: string;
  readonly proof: Proof;
  readonly [key: string]: JsonValue;
}
export interface VerificationResult {
  readonly code: DecisionCode;
  readonly valid: boolean;
  readonly decision_version: 'agent-proof/v1';
  readonly verifier_now: string;
  readonly policy_hash: string;
  readonly status_snapshot_hash: string;
  readonly evidence_ids: readonly string[];
  readonly secondary_codes: readonly DecisionCode[];
  readonly status_fresh: boolean;
  readonly replay_checked: boolean;
  readonly warnings: readonly WarningCode[];
}

import { LocalApiClient } from '@agent-proof/api-client';
import { verifyIdentityCredential } from '@agent-proof/core';
import {
  isTimestamp,
  validAgentId,
  type ArtifactBase,
  type JsonObject,
  type VerificationResult
} from '@agent-proof/protocol';
import type { CredentialDto } from '@agent-proof/api-contract';

export { LocalApiClient };
export type {
  AgentId,
  Constraints as AuthorityConstraints,
  Principal,
  PublicJwk,
  VerificationResult as IdentityVerificationResult
} from '@agent-proof/protocol';
export type {
  CredentialDto as IdentityCredential,
  TrustSnapshotResponse
} from '@agent-proof/api-contract';

export interface VerifyIdentityInput {
  readonly credential: CredentialDto | Uint8Array | string;
  readonly trustSnapshot: JsonObject;
  /** An explicit RFC 3339 UTC timestamp or Date. Defaults to the current instant. */
  readonly now?: string | Date;
}

function verificationNow(value: string | Date | undefined): Date {
  if (value === undefined) return new Date();
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new TypeError('now must be a valid Date');
    return value;
  }
  if (!isTimestamp(value))
    throw new TypeError('now must be an RFC 3339 UTC timestamp with whole seconds');
  return new Date(value);
}

/** Parse a logging-only agid:v1 display form into the structured protocol value. */
export function parseAgentId(value: string): import('@agent-proof/protocol').AgentId {
  const match = /^agid:v1:([^/]+)\/(.+)$/.exec(value);
  if (match === null) throw new TypeError('Agent ID must use agid:v1:<authority>/<path>');
  const agentId = {
    scheme: 'agid' as const,
    version: 1 as const,
    authority: match[1]!,
    path: match[2]!.split('/')
  };
  if (!validAgentId(agentId))
    throw new TypeError('Agent ID has an invalid authority or path segment');
  return agentId;
}

/** Render the protocol Agent ID only for display; comparisons remain structural. */
export function formatAgentId(value: import('@agent-proof/protocol').AgentId): string {
  if (!validAgentId(value as unknown as JsonObject))
    throw new TypeError('Agent ID has an invalid authority or path segment');
  return `agid:v1:${value.authority}/${value.path.join('/')}`;
}

/** Delegate deterministic offline verification to the RFC core implementation. */
export function verifyIdentity(input: VerifyIdentityInput): VerificationResult {
  const credential: ArtifactBase | Uint8Array =
    typeof input.credential === 'string'
      ? new TextEncoder().encode(input.credential)
      : input.credential instanceof Uint8Array
        ? input.credential
        : (input.credential as unknown as ArtifactBase);
  return verifyIdentityCredential({
    credential,
    trustSnapshot: input.trustSnapshot,
    now: verificationNow(input.now)
  });
}

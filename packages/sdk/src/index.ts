import { LocalApiClient } from '@agent-proof/api-client';
import {
  verifyArtifacts,
  verifyIdentityCredential,
  type VerificationInput
} from '@agent-proof/core';
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

export interface VerifyArtifactsInput {
  readonly artifacts: readonly ArtifactBase[];
  readonly trustSnapshot: JsonObject;
  readonly context: VerificationInput['context'];
  readonly now?: string | Date;
  readonly replayMode?: VerificationInput['replayMode'];
  readonly replay?: VerificationInput['replay'];
  readonly archivedSnapshot?: JsonObject;
}

/**
 * Verify delegation evidence in its intended request context. The core verifier
 * owns all chain, attenuation, trust, and signature decisions.
 */
export function verifyDelegation(input: VerifyArtifactsInput): VerificationResult {
  if (!input.artifacts.some((artifact) => artifact.kind === 'delegation'))
    throw new TypeError('artifacts must contain a delegation');
  return verifyRequest(input);
}

/** Verify a signed request and its supplied credential/delegation evidence. */
export function verifyRequest(input: VerifyArtifactsInput): VerificationResult {
  return verifyArtifacts({
    artifacts: input.artifacts,
    trustSnapshot: input.trustSnapshot,
    context: input.context,
    now: verificationNow(input.now),
    replayMode: input.replayMode ?? 'offline',
    ...(input.replay === undefined ? {} : { replay: input.replay }),
    ...(input.archivedSnapshot === undefined ? {} : { archivedSnapshot: input.archivedSnapshot })
  });
}

/** Check an exact capability string in a decoded constraint set. */
export function hasCapability(
  constraints: { readonly capabilities: readonly string[] },
  capability: string
): boolean {
  return constraints.capabilities.includes(capability);
}

/** Check exact, mechanically decidable resource membership. */
export function isAuthorizedForResource(
  constraints: { readonly resources: readonly { readonly type: string; readonly value: string }[] },
  resource: { readonly type: string; readonly value: string }
): boolean {
  return constraints.resources.some(
    (candidate) => candidate.type === resource.type && candidate.value === resource.value
  );
}

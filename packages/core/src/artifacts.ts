import {
  artifactIdFor,
  keyIdFor,
  signingInputFor,
  type ArtifactBase,
  type DelegationArtifact,
  type JsonObject,
  type ProvenanceArtifact,
  type RequestArtifact
} from '@agent-proof/protocol';
import type { KeyProvider, RandomSource } from './ports.js';

export interface SignArtifactInput<T extends ArtifactBase> {
  readonly artifact: Omit<T, 'id' | 'proof'>;
  readonly signingReference: string;
}

/** Creates an RFC v1 content-addressed, Ed25519-signed artifact with no key export. */
export async function signArtifact<T extends ArtifactBase>(
  provider: KeyProvider,
  input: SignArtifactInput<T>
): Promise<T> {
  const publicJwk = await provider.publicKey(input.signingReference);
  if (publicJwk === undefined) throw new Error('signing key is unavailable');
  const identified = {
    ...input.artifact,
    id: '',
    proof: { alg: 'Ed25519', kid: keyIdFor(publicJwk), sig: '' }
  } as T;
  const artifact = { ...identified, id: artifactIdFor(identified) } as T;
  const signature = await provider.sign(input.signingReference, signingInputFor(artifact));
  return {
    ...artifact,
    proof: { ...artifact.proof, sig: Buffer.from(signature).toString('base64url') }
  } as T;
}

export interface CreateDelegationInput {
  readonly issuedAt: string;
  readonly delegator: DelegationArtifact['delegator'];
  readonly delegate: DelegationArtifact['delegate'];
  readonly parentRef: DelegationArtifact['parent_ref'];
  readonly constraints: DelegationArtifact['constraints'];
  readonly signingReference: string;
}

export async function createDelegation(
  provider: KeyProvider,
  input: CreateDelegationInput
): Promise<DelegationArtifact> {
  return signArtifact(provider, {
    signingReference: input.signingReference,
    artifact: {
      version: 'agent-proof/v1',
      kind: 'delegation',
      issued_at: input.issuedAt,
      delegator: input.delegator,
      delegate: input.delegate,
      parent_ref: input.parentRef,
      constraints: input.constraints
    }
  });
}

export interface CreateRequestInput {
  readonly issuedAt: string;
  readonly requestId: string;
  readonly nonce?: string;
  readonly signer: RequestArtifact['signer'];
  readonly delegationRef: RequestArtifact['delegation_ref'];
  readonly notBefore: string;
  readonly expiresAt: string;
  readonly action: string;
  readonly resource: RequestArtifact['resource'];
  readonly task: string;
  readonly audience: string;
  readonly payloadDigest: string;
  readonly taskContextDigest: string;
  readonly signingReference: string;
}

export async function createRequest(
  provider: KeyProvider,
  random: RandomSource,
  input: CreateRequestInput
): Promise<RequestArtifact> {
  return signArtifact(provider, {
    signingReference: input.signingReference,
    artifact: {
      version: 'agent-proof/v1',
      kind: 'request',
      issued_at: input.issuedAt,
      signer: input.signer,
      delegation_ref: input.delegationRef,
      request_id: input.requestId,
      nonce: input.nonce ?? Buffer.from(random.bytes(32)).toString('base64url'),
      not_before: input.notBefore,
      expires_at: input.expiresAt,
      action: input.action,
      resource: input.resource,
      task: input.task,
      audience: input.audience,
      payload_digest: input.payloadDigest,
      task_context_digest: input.taskContextDigest
    }
  });
}

export interface CreateProvenanceInput {
  readonly issuedAt: string;
  readonly authorityRefs: ProvenanceArtifact['authority_refs'];
  readonly requestRef: ProvenanceArtifact['request_ref'];
  readonly subject: ProvenanceArtifact['subject'];
  readonly predicate: ProvenanceArtifact['predicate'];
  readonly predecessorRefs: ProvenanceArtifact['predecessor_refs'];
  readonly signingReference: string;
}

export async function createProvenance(
  provider: KeyProvider,
  input: CreateProvenanceInput
): Promise<ProvenanceArtifact> {
  return signArtifact(provider, {
    signingReference: input.signingReference,
    artifact: {
      version: 'agent-proof/v1',
      kind: 'provenance',
      issued_at: input.issuedAt,
      authority_refs: input.authorityRefs,
      request_ref: input.requestRef,
      predicate_type: 'https://agent-proof.invalid/spec/v1/provenance',
      subject: input.subject,
      predicate: input.predicate,
      predecessor_refs: input.predecessorRefs
    }
  });
}

export function artifactJson(artifact: ArtifactBase): JsonObject {
  return artifact as JsonObject;
}

import type { ArtifactBase, Constraints, JsonObject, Principal, Proof, Resource } from './types.js';

export interface ArtifactReference {
  readonly [key: string]: import('./types.js').JsonValue;
  readonly id: string;
  readonly kind: 'credential' | 'delegation' | 'request' | 'provenance';
}

export interface DelegationArtifact extends ArtifactBase {
  readonly kind: 'delegation';
  readonly delegator: Principal;
  readonly delegate: Principal;
  readonly parent_ref: ArtifactReference;
  readonly constraints: Constraints;
}

export interface RequestArtifact extends ArtifactBase {
  readonly kind: 'request';
  readonly signer: Principal;
  readonly delegation_ref: ArtifactReference;
  readonly request_id: string;
  readonly nonce: string;
  readonly not_before: string;
  readonly expires_at: string;
  readonly action: string;
  readonly resource: Resource;
  readonly task: string;
  readonly audience: string;
  readonly payload_digest: string;
  readonly task_context_digest: string;
}

export interface ProvenanceSubject {
  readonly [key: string]: import('./types.js').JsonValue;
  readonly name: string;
  readonly digest: string;
}

export interface ProvenancePredicate {
  readonly [key: string]: import('./types.js').JsonValue;
  readonly task: string;
  readonly action: string;
  readonly resource: Resource;
  readonly audience: string;
  readonly input_digests: readonly string[];
  readonly output_digests: readonly string[];
  readonly result: string;
}

/** Immutable evidence statement. It is never an authorization grant. */
export interface ProvenanceArtifact extends ArtifactBase {
  readonly kind: 'provenance';
  readonly authority_refs: readonly ArtifactReference[];
  readonly request_ref: ArtifactReference;
  readonly predicate_type: 'https://agent-proof.invalid/spec/v1/provenance';
  readonly subject: ProvenanceSubject;
  readonly predicate: ProvenancePredicate;
  readonly predecessor_refs: readonly ArtifactReference[];
}

export type SignedArtifact = DelegationArtifact | RequestArtifact | ProvenanceArtifact;

export type UnsignedArtifact<T extends ArtifactBase = ArtifactBase> = Omit<T, 'id' | 'proof'> & {
  readonly id?: string;
  readonly proof?: Partial<Proof>;
};

export function artifactReference(artifact: Pick<ArtifactBase, 'id' | 'kind'>): ArtifactReference {
  if (!['credential', 'delegation', 'request', 'provenance'].includes(artifact.kind))
    throw new TypeError(
      `Artifact kind cannot be referenced as authority evidence: ${artifact.kind}`
    );
  return { id: artifact.id, kind: artifact.kind as ArtifactReference['kind'] };
}

export function asJsonObject(value: unknown): JsonObject | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonObject)
    : undefined;
}

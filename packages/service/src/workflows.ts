import {
  artifactReference,
  asJsonObject,
  type ArtifactBase,
  type DelegationArtifact,
  type JsonObject,
  type ProvenanceArtifact,
  type RequestArtifact,
  type VerificationResult
} from '@agent-proof/protocol';
import {
  createDelegation,
  createProvenance,
  createRequest,
  verifyArtifacts,
  type KeyProvider,
  type RandomSource,
  type ReplayStore,
  type VerificationContext
} from '@agent-proof/core';

export interface EvidenceRepository {
  put(artifact: ArtifactBase): Promise<void>;
  get(id: string): Promise<ArtifactBase | undefined>;
  listStatus(): Promise<readonly ArtifactBase[]>;
  consumeReplay?: ReplayStore;
}

export interface DelegationService {
  delegate(
    input: Omit<Parameters<typeof createDelegation>[1], 'signingReference'> & {
      readonly signingReference: string;
    }
  ): Promise<DelegationArtifact>;
  createRequest(
    input: Omit<Parameters<typeof createRequest>[2], 'signingReference'> & {
      readonly signingReference: string;
    }
  ): Promise<RequestArtifact>;
  verifyRequest(input: {
    readonly request: RequestArtifact;
    readonly trustSnapshot: JsonObject;
    readonly context: VerificationContext;
    readonly now: Date;
    readonly replayMode: 'online' | 'offline';
  }): Promise<VerificationResult>;
  recordProvenance(
    input: Omit<Parameters<typeof createProvenance>[1], 'signingReference'> & {
      readonly signingReference: string;
    }
  ): Promise<ProvenanceArtifact>;
}

async function chain(
  repository: EvidenceRepository,
  request: RequestArtifact
): Promise<ArtifactBase[]> {
  const result: ArtifactBase[] = [request];
  let current: ArtifactBase = request;
  const seen = new Set<string>([request.id]);
  while (current.kind === 'request' || current.kind === 'delegation') {
    const reference = asJsonObject(
      current.kind === 'request' ? current['delegation_ref'] : current['parent_ref']
    );
    const parent =
      reference !== undefined && typeof reference['id'] === 'string'
        ? await repository.get(reference['id'])
        : undefined;
    if (parent === undefined || seen.has(parent.id)) break;
    result.push(parent);
    seen.add(parent.id);
    current = parent;
  }
  return result;
}

/** Service-ready facade; all authorization decisions remain in the one core verifier. */
export function createDelegationService(
  provider: KeyProvider,
  random: RandomSource,
  repository: EvidenceRepository
): DelegationService {
  return {
    async delegate(input) {
      const artifact = await createDelegation(provider, input);
      await repository.put(artifact);
      return artifact;
    },
    async createRequest(input) {
      const artifact = await createRequest(provider, random, input);
      await repository.put(artifact);
      return artifact;
    },
    async verifyRequest(input) {
      const artifacts = [
        ...(await chain(repository, input.request)),
        ...(await repository.listStatus())
      ];
      const preliminary = verifyArtifacts({
        artifacts,
        trustSnapshot: input.trustSnapshot,
        context: input.context,
        now: input.now,
        replayMode: input.replayMode
      });
      if (!preliminary.valid || !input.context.replayRequired || input.replayMode === 'offline')
        return preliminary;
      if (repository.consumeReplay === undefined)
        return verifyArtifacts({ ...input, artifacts, replay: 'duplicate' });
      const outcome = await repository.consumeReplay.consume({
        audience: input.request.audience,
        signerKeyId: input.request.proof.kid,
        requestId: input.request.request_id,
        nonce: input.request.nonce,
        expiresAt: new Date(input.request.expires_at)
      });
      return outcome === 'consumed'
        ? preliminary
        : verifyArtifacts({
            ...input,
            artifacts,
            replay: 'duplicate'
          });
    },
    async recordProvenance(input) {
      const artifact = await createProvenance(provider, input);
      await repository.put(artifact);
      return artifact;
    }
  };
}

export { artifactReference };

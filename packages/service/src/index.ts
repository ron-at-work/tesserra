import {
  artifactIdFor,
  keyIdFor,
  policyHashFor,
  signingInputFor,
  validAgentId
} from '@agent-proof/protocol';
import { verifyIdentityCredential } from '@agent-proof/core';
import type {
  AgentId,
  ArtifactBase,
  JsonObject,
  Constraints,
  DecisionCode,
  Principal,
  PublicJwk,
  VerificationResult as CoreVerificationResult
} from '@agent-proof/protocol';
import type { Clock, KeyProvider } from '@agent-proof/core';
/**
 * Application use cases and ports for local identity operations. Concrete
 * storage, key, and verifier implementations belong to the composition host.
 */

export type VerificationCode = DecisionCode;

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue =
  JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export type { AgentId, Principal, PublicJwk };
export type AuthorityCeiling = Constraints;

export interface IdentityCredential {
  readonly version: 'agent-proof/v1';
  readonly kind: 'credential';
  readonly id: string;
  readonly issued_at: string;
  readonly proof: { readonly alg: 'Ed25519'; readonly kid: string; readonly sig: string };
  readonly issuer: Principal;
  readonly subject: Principal & { readonly type: 'agent'; readonly id: AgentId };
  readonly public_jwk: PublicJwk;
  readonly key_id: string;
  readonly not_before: string;
  readonly expires_at: string;
  readonly credential_purpose: 'agent-root-authority' | 'agent-key-binding';
  readonly authority_ceiling: AuthorityCeiling;
}

export interface TrustSnapshot {
  readonly snapshot_id: string;
  readonly sequence: number;
  readonly issued_at: string;
  readonly expires_at: string;
  readonly policy_hash: string;
  readonly [key: string]: JsonValue;
}

export interface IdentityRecord {
  readonly id: string;
  readonly credential: IdentityCredential;
  readonly createdAt: string;
}

export interface Page<T> {
  readonly items: readonly T[];
  readonly nextCursor?: string;
}

export interface CreateIdentityInput {
  readonly subject: AgentId;
  readonly issuer: Principal;
  readonly authorityCeiling: AuthorityCeiling;
  readonly credentialPurpose?: 'agent-root-authority' | 'agent-key-binding';
  /** Used to make network retries safe. The repository owns uniqueness. */
  readonly idempotencyKey?: string;
}

export type VerificationResult = CoreVerificationResult;

export interface IdentityRepository {
  create(record: IdentityRecord, idempotencyKey?: string): Promise<IdentityRecord>;
  getByIdempotency?(key: string): Promise<IdentityRecord | undefined>;
  get(id: string): Promise<IdentityRecord | undefined>;
  list(cursor: string | undefined, limit: number): Promise<Page<IdentityRecord>>;
}

export interface IdentityIssuer {
  issue(input: CreateIdentityInput, now: Date): Promise<IdentityCredential>;
}

export interface IdentityVerifier {
  verify(
    credential: IdentityCredential,
    trust: TrustSnapshot,
    now: Date
  ): Promise<VerificationResult>;
}

export interface TrustSnapshotProvider {
  current(): Promise<TrustSnapshot>;
  /** Reloads only host-configured trust material; callers supply no policy bytes. */
  reloadConfigured(): Promise<TrustSnapshot>;
}

export type { Clock };

export type ServiceErrorCode =
  | 'IDENTITY_NOT_FOUND'
  | 'IDENTITY_CONFLICT'
  | 'INVALID_INPUT'
  | 'TRUST_RELOAD_FORBIDDEN'
  | 'TRUST_SNAPSHOT_INVALID'
  | 'INTERNAL';

export class ServiceError extends Error {
  public constructor(
    public readonly code: ServiceErrorCode,
    message: string,
    public readonly details: readonly string[] = []
  ) {
    super(message);
    this.name = 'ServiceError';
  }
}

export interface IdentityService {
  createIdentity(input: CreateIdentityInput): Promise<IdentityRecord>;
  getIdentity(id: string): Promise<IdentityRecord>;
  verifyIdentity(credential: IdentityCredential): Promise<VerificationResult>;
  listAgents(cursor: string | undefined, limit: number | undefined): Promise<Page<IdentityRecord>>;
  readTrustSnapshot(): Promise<TrustSnapshot>;
  reloadTrustSnapshot(): Promise<TrustSnapshot>;
}

export function publicKeyId(jwk: PublicJwk): string {
  return keyIdFor(jwk);
}

export interface LocalCredentialAssembly {
  readonly keyProvider: KeyProvider;
  readonly issuer: Principal & { readonly type: 'human' | 'service' };
  readonly issuerReference: string;
}

/** Shared issuance primitive for composition hosts; private bytes stay in KeyProvider. */
export function createLocalCredentialIssuer(assembly: LocalCredentialAssembly): IdentityIssuer {
  return {
    async issue(input, now): Promise<IdentityCredential> {
      const subjectKey = await assembly.keyProvider.create();
      const issuedAt = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
      const issuerJwk = await assembly.keyProvider.publicKey(assembly.issuerReference);
      if (issuerJwk === undefined)
        throw new ServiceError('INTERNAL', 'configured issuer key is unavailable');
      const draft = {
        version: 'agent-proof/v1' as const,
        kind: 'credential' as const,
        id: '',
        issued_at: issuedAt,
        proof: { alg: 'Ed25519' as const, kid: keyIdFor(issuerJwk), sig: '' },
        issuer: assembly.issuer,
        subject: { type: 'agent' as const, id: input.subject },
        public_jwk: subjectKey.publicJwk,
        key_id: subjectKey.keyId,
        not_before: input.authorityCeiling.not_before,
        expires_at: input.authorityCeiling.expires_at,
        credential_purpose: input.credentialPurpose ?? 'agent-root-authority',
        authority_ceiling: input.authorityCeiling
      };
      const identified = { ...draft, id: artifactIdFor(draft as unknown as ArtifactBase) };
      const signature = await assembly.keyProvider.sign(
        assembly.issuerReference,
        signingInputFor(identified as unknown as ArtifactBase)
      );
      return {
        ...identified,
        proof: { ...identified.proof, sig: Buffer.from(signature).toString('base64url') }
      };
    }
  };
}

/** Thin adapter to the shared core identity verifier; no local verification fork. */
export function verifyIdentityOffline(
  credential: IdentityCredential,
  trust: TrustSnapshot,
  now: Date
): VerificationResult {
  return verifyIdentityCredential({
    credential: credential as unknown as ArtifactBase,
    trustSnapshot: trust as unknown as JsonObject,
    now
  });
}

export function createLocalIdentityVerifier(): IdentityVerifier {
  return {
    async verify(credential, trust, now): Promise<VerificationResult> {
      return verifyIdentityOffline(credential, trust, now);
    }
  };
}

/** Derives a complete, hash-bound snapshot from the supplied public policy. */
export function withPolicyHash(snapshot: Omit<TrustSnapshot, 'policy_hash'>): TrustSnapshot {
  return {
    ...snapshot,
    policy_hash: policyHashFor(snapshot as unknown as JsonObject)
  } as TrustSnapshot;
}

export interface IdentityServiceDependencies {
  readonly identities: IdentityRepository;
  readonly issuer: IdentityIssuer;
  readonly verifier: IdentityVerifier;
  readonly trust: TrustSnapshotProvider;
  readonly clock: Clock;
}

const maxPageSize = 100;
const defaultPageSize = 25;

function validateCreateInput(input: CreateIdentityInput): void {
  if (!validAgentId(input.subject as never)) {
    throw new ServiceError('INVALID_INPUT', 'subject must be a valid structured agent identifier');
  }
  if (input.issuer.type !== 'human' && input.issuer.type !== 'service') {
    throw new ServiceError(
      'INVALID_INPUT',
      'credential issuers must be human or service principals'
    );
  }
  const ceiling = input.authorityCeiling;
  if (
    ceiling.capabilities.length === 0 ||
    ceiling.resources.length === 0 ||
    ceiling.tasks.length === 0 ||
    ceiling.audiences.length === 0
  ) {
    throw new ServiceError('INVALID_INPUT', 'authority ceiling selectors must be nonempty');
  }
  if (
    ceiling.remaining_depth < 0 ||
    ceiling.remaining_depth > 8 ||
    ceiling.not_before > ceiling.expires_at
  ) {
    throw new ServiceError('INVALID_INPUT', 'authority ceiling has an invalid interval or depth');
  }
}

export function createIdentityService(dependencies: IdentityServiceDependencies): IdentityService {
  return {
    async createIdentity(input): Promise<IdentityRecord> {
      validateCreateInput(input);
      if (
        input.idempotencyKey !== undefined &&
        dependencies.identities.getByIdempotency !== undefined
      ) {
        const prior = await dependencies.identities.getByIdempotency(input.idempotencyKey);
        if (prior !== undefined) return prior;
      }
      const createdAt = dependencies.clock.now().toISOString().replace('.000Z', 'Z');
      const credential = await dependencies.issuer.issue(input, dependencies.clock.now());
      if (credential.subject.type !== 'agent' || credential.subject.id.scheme !== 'agid') {
        throw new ServiceError(
          'INTERNAL',
          'issuer returned a credential with an invalid agent subject'
        );
      }
      return dependencies.identities.create(
        { id: credential.id, credential, createdAt },
        input.idempotencyKey
      );
    },

    async getIdentity(id): Promise<IdentityRecord> {
      const identity = await dependencies.identities.get(id);
      if (identity === undefined) {
        throw new ServiceError('IDENTITY_NOT_FOUND', 'identity was not found');
      }
      return identity;
    },

    async verifyIdentity(credential): Promise<VerificationResult> {
      return dependencies.verifier.verify(
        credential,
        await dependencies.trust.current(),
        dependencies.clock.now()
      );
    },

    async listAgents(cursor, limit): Promise<Page<IdentityRecord>> {
      const pageSize = limit ?? defaultPageSize;
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > maxPageSize) {
        throw new ServiceError(
          'INVALID_INPUT',
          `limit must be an integer between 1 and ${maxPageSize}`
        );
      }
      return dependencies.identities.list(cursor, pageSize);
    },

    readTrustSnapshot: () => dependencies.trust.current(),
    reloadTrustSnapshot: () => dependencies.trust.reloadConfigured()
  };
}

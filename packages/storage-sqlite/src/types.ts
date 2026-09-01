/** Public, redacted persistence contracts. Private key bytes are intentionally absent. */
export type JsonValue =
  null | boolean | number | string | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface AgentRecord {
  readonly id: string;
  readonly principalType: 'agent';
  readonly displayName?: string;
  readonly metadata?: JsonValue;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt?: string;
}

export type KeyStatus = 'active' | 'retired' | 'compromised' | 'revoked';
export interface KeyRecord {
  readonly id: string;
  readonly agentId: string;
  readonly algorithm: 'Ed25519';
  readonly publicJwk: JsonValue;
  /** Opaque provider handle only. It never contains private key material. */
  readonly providerReference?: string;
  readonly status: KeyStatus;
  readonly notBefore: string;
  readonly expiresAt: string;
  readonly replacementKeyId?: string;
  readonly historySequence: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface IdentityCredentialRecord {
  readonly id: string;
  readonly agentId: string;
  /** Complete public credential; validation rejects any private-key field. */
  readonly credential: JsonValue;
  readonly createdAt: string;
}

export interface TrustSnapshotRecord {
  readonly snapshotId: string;
  readonly policyHash: string;
  readonly sequence: number;
  readonly canonicalPolicy: Uint8Array;
  readonly issuerId: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
  readonly source?: string;
  readonly createdAt: string;
}

export interface TrustAnchorRecord {
  readonly snapshotId: string;
  readonly anchorId: string;
  readonly principalId: string;
  readonly purpose: string;
  readonly publicJwk: JsonValue;
  readonly createdAt: string;
}

export interface VerificationEventRecord {
  readonly id: string;
  readonly occurredAt: string;
  readonly decision: 'verified' | 'rejected';
  readonly primaryCode: string;
  readonly secondaryCodes: readonly string[];
  readonly artifactDigest?: string;
  readonly evidenceIds: readonly string[];
  readonly trustSnapshotId?: string;
  readonly policyHash?: string;
  readonly trustSequence?: number;
  readonly statusHash?: string;
  /** This field must already be redacted by the caller. */
  readonly redactedEvidence?: JsonValue;
}

export interface VerificationEventFilter {
  readonly limit?: number;
  readonly afterId?: string;
  readonly decision?: VerificationEventRecord['decision'];
  readonly trustSnapshotId?: string;
}

export interface VerificationEventPage {
  readonly items: readonly VerificationEventRecord[];
  readonly nextAfterId?: string;
}

export interface ReplayKey {
  readonly audience: string;
  readonly signerKeyId: string;
  readonly requestId: string;
  readonly nonceDigest: string;
  readonly expiresAt: string;
}

export interface StatusPublisherHighWater {
  readonly snapshotId: string;
  readonly publisherId: string;
  readonly targetKeyId: string;
  readonly sequence: number;
  readonly digest: string;
  readonly updatedAt: string;
}

export interface AgentRepository {
  put(agent: AgentRecord): void;
  get(id: string): AgentRecord | undefined;
  list(): readonly AgentRecord[];
}
export interface KeyRepository {
  put(key: KeyRecord): void;
  get(id: string): KeyRecord | undefined;
  listForAgent(agentId: string): readonly KeyRecord[];
}
export interface IdentityCredentialRepository {
  create(record: IdentityCredentialRecord, idempotencyKey?: string): IdentityCredentialRecord;
  getByIdempotency(key: string): IdentityCredentialRecord | undefined;
  get(id: string): IdentityCredentialRecord | undefined;
  list(afterId: string | undefined, limit: number): readonly IdentityCredentialRecord[];
}

export interface TrustRepository {
  acceptSnapshot(snapshot: TrustSnapshotRecord, anchors: readonly TrustAnchorRecord[]): void;
  getSnapshot(snapshotId: string): TrustSnapshotRecord | undefined;
  currentSnapshot(): TrustSnapshotRecord | undefined;
  listAnchors(snapshotId: string): readonly TrustAnchorRecord[];
  acceptHighWater(value: StatusPublisherHighWater): void;
  getHighWater(
    snapshotId: string,
    publisherId: string,
    targetKeyId: string
  ): StatusPublisherHighWater | undefined;
}
export interface EventSink {
  record(event: VerificationEventRecord): void;
  list(filter?: VerificationEventFilter): VerificationEventPage;
}
export interface ReplayStore {
  /** Returns false when the key is expired or either protocol replay key was consumed. */
  consume(key: ReplayKey, now: string): boolean;
  purgeExpired(now: string): number;
}

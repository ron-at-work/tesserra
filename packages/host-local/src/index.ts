import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  createLocalApiServer,
  type EvidenceApi,
  type LocalApiServer
} from '@agent-proof/api-server';
import type { ArtifactBase } from '@agent-proof/protocol';
import { EncryptedFilesystemKeyProvider, SystemRandomSource } from '@agent-proof/crypto-local';
import {
  createIdentityService,
  createLocalCredentialIssuer,
  createLocalIdentityVerifier,
  withPolicyHash,
  publicKeyId,
  ServiceError,
  type Clock,
  type CreateIdentityInput,
  type IdentityCredential,
  type IdentityIssuer,
  type IdentityRecord,
  type IdentityRepository,
  type IdentityService,
  type IdentityVerifier,
  type Principal,
  type TrustSnapshot,
  type TrustSnapshotProvider
} from '@agent-proof/service';
import { SqliteStorage, type JsonValue } from '@agent-proof/storage-sqlite';

export interface LocalHostDependencies {
  readonly identities: IdentityRepository;
  readonly issuer: IdentityIssuer;
  readonly verifier: IdentityVerifier;
  readonly trust: TrustSnapshotProvider;
  readonly clock: Clock;
}
export interface LocalHostOptions extends LocalHostDependencies {
  readonly evidence?: EvidenceApi;
  readonly host?: string;
  readonly port?: number;
  readonly trustReloadToken?: string;
}
export interface LocalHost {
  readonly service: IdentityService;
  readonly api: LocalApiServer;
  start(): Promise<void>;
  stop(): Promise<void>;
}

export function createLocalHost(options: LocalHostOptions): LocalHost {
  const service = createIdentityService(options);
  const api = createLocalApiServer({
    service,
    ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
    ...(options.host === undefined ? {} : { host: options.host }),
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.trustReloadToken === undefined
      ? {}
      : { trustReloadToken: options.trustReloadToken })
  });
  return { service, api, start: () => api.listen(), stop: () => api.close() };
}

export interface ConcreteLocalHostOptions {
  readonly keyDirectory: string;
  readonly keyPassphrase: Uint8Array;
  readonly storagePath?: string;
  readonly issuer?: Principal & { readonly type: 'service' | 'human' };
  readonly host?: string;
  readonly port?: number;
  readonly trustReloadToken?: string;
  readonly clock?: Clock;
}
export interface ConcreteLocalHost extends LocalHost {
  readonly storage: SqliteStorage;
  close(): Promise<void>;
}
const nowUtc = (date: Date): string => date.toISOString().replace(/\.\d{3}Z$/, 'Z');

class SqliteIdentityRepository implements IdentityRepository {
  public constructor(private readonly storage: SqliteStorage) {}
  async create(record: IdentityRecord, idempotencyKey?: string): Promise<IdentityRecord> {
    const agentId = `agid:v1:${record.credential.subject.id.authority}/${record.credential.subject.id.path.join('/')}`;
    this.storage.agents.put({
      id: agentId,
      principalType: 'agent',
      createdAt: record.createdAt,
      updatedAt: record.createdAt
    });
    const existingKeys = this.storage.keys.listForAgent(agentId);
    const existing = existingKeys.find((key) => key.id === record.credential.key_id);
    try {
      if (existing === undefined)
        this.storage.keys.put({
          id: record.credential.key_id,
          agentId,
          algorithm: 'Ed25519',
          publicJwk: record.credential.public_jwk as unknown as JsonValue,
          status: 'active',
          notBefore: record.credential.not_before,
          expiresAt: record.credential.expires_at,
          historySequence: existingKeys.length,
          createdAt: record.createdAt,
          updatedAt: record.createdAt
        });
    } catch {
      throw new ServiceError('IDENTITY_CONFLICT', 'identity key persistence conflicted');
    }
    const saved = this.storage.credentials.create(
      {
        id: record.id,
        agentId,
        credential: record.credential as unknown as JsonValue,
        createdAt: record.createdAt
      },
      idempotencyKey
    );
    return {
      id: saved.id,
      credential: saved.credential as unknown as IdentityCredential,
      createdAt: saved.createdAt
    };
  }
  async getByIdempotency(key: string): Promise<IdentityRecord | undefined> {
    const saved = this.storage.credentials.getByIdempotency(key);
    return saved === undefined
      ? undefined
      : {
          id: saved.id,
          credential: saved.credential as unknown as IdentityCredential,
          createdAt: saved.createdAt
        };
  }
  async get(id: string): Promise<IdentityRecord | undefined> {
    const saved = this.storage.credentials.get(id);
    return saved === undefined
      ? undefined
      : {
          id: saved.id,
          credential: saved.credential as unknown as IdentityCredential,
          createdAt: saved.createdAt
        };
  }
  async list(cursor: string | undefined, limit: number) {
    const items = this.storage.credentials.list(cursor, limit + 1).map((saved) => ({
      id: saved.id,
      credential: saved.credential as unknown as IdentityCredential,
      createdAt: saved.createdAt
    }));
    const page = items.slice(0, limit);
    const next = items.length > limit ? page.at(-1)?.id : undefined;
    return next === undefined ? { items: page } : { items: page, nextCursor: next };
  }
}

class SqliteEvidenceApi implements EvidenceApi {
  public constructor(
    private readonly storage: SqliteStorage,
    private readonly clock: Clock
  ) {}

  async createDelegation(artifact: ArtifactBase) {
    if (artifact.kind !== 'delegation')
      throw new ServiceError('INVALID_INPUT', 'artifact must be a delegation');
    const createdAt = nowUtc(this.clock.now());
    this.storage.artifacts.put({
      id: artifact.id,
      kind: 'delegation',
      artifact: artifact as unknown as JsonValue,
      issuedAt: artifact.issued_at,
      createdAt
    });
    return { id: artifact.id, artifact, createdAt };
  }

  async getDelegation(id: string) {
    const record = this.storage.artifacts.get(id);
    return record === undefined || record.kind !== 'delegation'
      ? undefined
      : {
          id: record.id,
          artifact: record.artifact as unknown as ArtifactBase,
          createdAt: record.createdAt
        };
  }

  async listDelegations(cursor: string | undefined, limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ServiceError('INVALID_INPUT', 'limit must be an integer between 1 and 100');
    // Cursor ordering is explicitly by immutable artifact ID, not issued time.
    const records = this.storage.artifacts
      .list('delegation')
      .slice()
      .sort((left, right) => left.id.localeCompare(right.id))
      .filter((record) => cursor === undefined || record.id > cursor);
    const page = records.slice(0, limit);
    const nextCursor = records.length > limit ? page.at(-1)?.id : undefined;
    return {
      items: page.map((record) => ({
        id: record.id,
        artifact: record.artifact as unknown as ArtifactBase,
        createdAt: record.createdAt
      })),
      ...(nextCursor === undefined ? {} : { nextCursor })
    };
  }

  async createRevocation(artifact: ArtifactBase) {
    if (artifact.kind !== 'revocation')
      throw new ServiceError('INVALID_INPUT', 'artifact must be a revocation');
    const targetType = artifact['target_type'];
    const targetId = artifact['target_id'];
    const effectiveAt = artifact['effective_at'];
    if (
      (targetType !== 'credential' && targetType !== 'key' && targetType !== 'delegation') ||
      typeof targetId !== 'string' ||
      typeof effectiveAt !== 'string'
    )
      throw new ServiceError('INVALID_INPUT', 'revocation target is invalid');
    const createdAt = nowUtc(this.clock.now());
    this.storage.artifacts.put({
      id: artifact.id,
      kind: 'revocation',
      artifact: artifact as unknown as JsonValue,
      issuedAt: artifact.issued_at,
      createdAt
    });
    this.storage.artifacts.revoke({
      id: artifact.id,
      targetType,
      targetId,
      effectiveAt,
      artifact: artifact as unknown as JsonValue,
      createdAt
    });
    return { id: artifact.id, artifact, createdAt };
  }

  async getRevocation(id: string) {
    const record = this.storage.artifacts.get(id);
    return record === undefined || record.kind !== 'revocation'
      ? undefined
      : {
          id: record.id,
          artifact: record.artifact as unknown as ArtifactBase,
          createdAt: record.createdAt
        };
  }

  async listEvents(cursor: string | undefined, limit: number) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      throw new ServiceError('INVALID_INPUT', 'limit must be an integer between 1 and 100');
    const page = this.storage.events.list({
      limit,
      ...(cursor === undefined ? {} : { afterId: cursor })
    });
    return {
      items: page.items.map((event) => ({ ...event })) as readonly Record<string, JsonValue>[],
      ...(page.nextAfterId === undefined ? {} : { nextAfterId: page.nextAfterId })
    };
  }
}

class MutableTrustProvider implements TrustSnapshotProvider {
  public constructor(private snapshot: TrustSnapshot) {}
  addRoot(credential: IdentityCredential): void {
    const roots = [
      ...((this.snapshot['roots'] as unknown as readonly unknown[]) ?? []),
      {
        issuer: credential.issuer,
        root_subject: credential.subject,
        credential_purpose: 'agent-root-authority'
      }
    ];
    this.snapshot = withPolicyHash({
      ...this.snapshot,
      roots,
      policy_hash: undefined
    } as unknown as Omit<TrustSnapshot, 'policy_hash'>);
  }
  async current(): Promise<TrustSnapshot> {
    return this.snapshot;
  }
  async reloadConfigured(): Promise<TrustSnapshot> {
    return this.snapshot;
  }
}

class RootRegisteringIssuer implements IdentityIssuer {
  public constructor(
    private readonly issuer: IdentityIssuer,
    private readonly trust: MutableTrustProvider
  ) {}
  async issue(input: CreateIdentityInput, now: Date): Promise<IdentityCredential> {
    const credential = await this.issuer.issue(input, now);
    if (credential.credential_purpose === 'agent-root-authority') this.trust.addRoot(credential);
    return credential;
  }
}

async function issuerReference(
  provider: EncryptedFilesystemKeyProvider,
  directory: string
): Promise<{
  reference: string;
  publicJwk: Awaited<ReturnType<typeof provider.create>>['publicJwk'];
}> {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = join(directory, 'issuer-reference');
  try {
    const reference = (await readFile(path, 'utf8')).trim();
    const publicJwk = await provider.publicKey(reference);
    if (publicJwk !== undefined) return { reference, publicJwk };
  } catch {
    /* first bootstrap */
  }
  const created = await provider.create();
  await writeFile(path, `${created.reference}\n`, { mode: 0o600 });
  return { reference: created.reference, publicJwk: created.publicJwk };
}

export async function createConcreteLocalHost(
  options: ConcreteLocalHostOptions
): Promise<ConcreteLocalHost> {
  const clock = options.clock ?? { now: () => new Date() };
  const storage = new SqliteStorage(
    options.storagePath === undefined ? {} : { path: options.storagePath }
  );
  const provider = new EncryptedFilesystemKeyProvider(
    options.keyDirectory,
    options.keyPassphrase,
    new SystemRandomSource()
  );
  const issuer = options.issuer ?? { type: 'service' as const, id: 'local:issuer' };
  const issuerKey = await issuerReference(provider, options.keyDirectory);
  const issuedAt = nowUtc(clock.now());
  const trust = new MutableTrustProvider(
    withPolicyHash({
      snapshot_id: 'local-bootstrap',
      sequence: 1,
      issued_at: issuedAt,
      expires_at: '2099-01-01T00:00:00Z',
      max_clock_skew_seconds: 0,
      max_lifetime_seconds: 31_536_000,
      max_chain_depth: 0,
      replay_policy: 'offline-inspection-only',
      issuer_authorities: [
        {
          principal: issuer,
          key_id: publicKeyId(issuerKey.publicJwk),
          public_jwk: issuerKey.publicJwk
        }
      ],
      status_publishers: [
        {
          principal: issuer,
          key_id: publicKeyId(issuerKey.publicJwk),
          public_jwk: issuerKey.publicJwk
        }
      ],
      roots: [],
      status_high_water: [],
      archival_policy: {
        historical_verification: 'explicit-snapshot-only',
        minimum_retention_seconds: 1
      }
    } as unknown as Omit<TrustSnapshot, 'policy_hash'>)
  );
  for (const saved of storage.credentials.list(undefined, 1000))
    trust.addRoot(saved.credential as unknown as IdentityCredential);
  const issuerBase = createLocalCredentialIssuer({
    keyProvider: provider,
    issuer,
    issuerReference: issuerKey.reference
  });
  const host = createLocalHost({
    identities: new SqliteIdentityRepository(storage),
    issuer: new RootRegisteringIssuer(issuerBase, trust),
    verifier: createLocalIdentityVerifier(),
    trust,
    clock,
    evidence: new SqliteEvidenceApi(storage, clock),
    ...(options.host === undefined ? {} : { host: options.host }),
    ...(options.port === undefined ? {} : { port: options.port }),
    ...(options.trustReloadToken === undefined
      ? {}
      : { trustReloadToken: options.trustReloadToken })
  });
  let started = false;
  let closed = false;
  return {
    ...host,
    storage,
    start: async () => {
      if (closed) throw new Error('local host is closed');
      await host.start();
      started = true;
    },
    close: async () => {
      if (closed) return;
      if (started) {
        await host.stop();
        started = false;
      }
      storage.close();
      closed = true;
    }
  };
}

import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import type { ReplayStore as CoreReplayStore } from '@agent-proof/core';
import { migrations } from './migrations.js';
import type {
  AgentRecord,
  AgentRepository,
  ArtifactRepository,
  EventSink,
  IdentityCredentialRecord,
  IdentityCredentialRepository,
  JsonValue,
  ProvenanceGraph,
  ProvenanceGraphEdge,
  ProvenanceGraphNode,
  ProvenanceRepository,
  RevocationRecord,
  SignedArtifactRecord,
  StoredArtifactKind,
  KeyRecord,
  KeyRepository,
  ReplayKey,
  ReplayStore,
  StatusPublisherHighWater,
  TrustAnchorRecord,
  TrustRepository,
  TrustSnapshotRecord,
  VerificationEventFilter,
  VerificationEventPage,
  VerificationEventRecord
} from './types.js';

type SqlValue = string | number | Uint8Array | null;
type SqlRow = Record<string, unknown>;
const json = (value: JsonValue | readonly string[]): string => JSON.stringify(value);
const parseJson = (value: unknown): JsonValue => JSON.parse(requiredString(value)) as JsonValue;
const requiredString = (value: unknown): string => {
  if (typeof value !== 'string') throw new Error('database invariant violated: expected string');
  return value;
};
const optionalString = (value: unknown): string | undefined =>
  value === null ? undefined : requiredString(value);
const requiredInteger = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value))
    throw new Error('database invariant violated: expected integer');
  return value;
};
const blob = (value: unknown): Uint8Array => {
  if (!(value instanceof Uint8Array)) throw new Error('database invariant violated: expected blob');
  return new Uint8Array(value);
};
const nonEmpty = (value: string, name: string): void => {
  if (value.length === 0) throw new Error(`${name} must not be empty`);
};
const isObject = (value: JsonValue): value is { readonly [key: string]: JsonValue } =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** Rejects JWK private members before they can enter SQLite. */
function assertPublicEd25519Jwk(value: JsonValue): void {
  if (
    !isObject(value) ||
    value['kty'] !== 'OKP' ||
    value['crv'] !== 'Ed25519' ||
    typeof value['x'] !== 'string'
  ) {
    throw new Error('publicJwk must be an OKP/Ed25519 public JWK');
  }
  for (const prohibited of ['d', 'k', 'p', 'q', 'dp', 'dq', 'qi', 'oth']) {
    if (prohibited in value) throw new Error('private key material must not be persisted');
  }
}
function assertNoPrivateMaterial(value: JsonValue): void {
  const prohibited = new Set([
    'd',
    'k',
    'p',
    'q',
    'dp',
    'dq',
    'qi',
    'oth',
    'private_key',
    'passphrase',
    'secret'
  ]);
  const walk = (current: JsonValue): void => {
    if (Array.isArray(current)) {
      current.forEach(walk);
      return;
    }
    if (isObject(current))
      for (const [key, nested] of Object.entries(current)) {
        if (prohibited.has(key.toLowerCase()))
          throw new Error('private key material must not be persisted');
        walk(nested);
      }
  };
  walk(value);
}
function provenanceEdges(
  record: SignedArtifactRecord
): readonly { to: string; relation: 'authority' | 'request' | 'predecessor' }[] {
  if (!isObject(record.artifact) || record.kind !== 'provenance') return [];
  const references = (value: JsonValue | undefined): readonly { id: string }[] =>
    Array.isArray(value)
      ? value.filter(
          (item): item is { readonly id: string } =>
            isObject(item) && typeof item['id'] === 'string'
        )
      : [];
  const edges = [
    ...references(record.artifact['authority_refs']).map((reference) => ({
      to: reference.id,
      relation: 'authority' as const
    })),
    ...references(record.artifact['predecessor_refs']).map((reference) => ({
      to: reference.id,
      relation: 'predecessor' as const
    }))
  ];
  const requestReference = record.artifact['request_ref'] as JsonValue | undefined;
  const request =
    requestReference !== undefined && isObject(requestReference) ? requestReference : undefined;
  return typeof request?.['id'] === 'string'
    ? [...edges, { to: request['id'], relation: 'request' }]
    : edges;
}
function assertRedacted(value: JsonValue | undefined): void {
  if (value === undefined) return;
  const prohibited = /private|secret|token|passphrase|password|authorization|payload|nonce/i;
  const walk = (current: JsonValue): void => {
    if (Array.isArray(current)) {
      current.forEach(walk);
      return;
    }
    if (isObject(current))
      for (const [key, item] of Object.entries(current)) {
        if (prohibited.test(key))
          throw new Error(`verification event contains prohibited field: ${key}`);
        walk(item);
      }
  };
  walk(value);
}

export interface SqliteStorageOptions {
  /** Explicit clock for replay consumption; production composition supplies system time. */
  readonly now?: () => Date;
  /** Use ":memory:" for isolated tests. File permissions remain a deployment responsibility. */
  readonly path?: string;
  /** Allows tests or a composition root to own a database connection. */
  readonly database?: DatabaseSync;
}

/**
 * SQLite implementation of Phase 1 identity, trust, event, and replay ports.
 * This adapter deliberately persists only public JWKs and opaque key-provider references.
 */
export class SqliteStorage {
  readonly #db: DatabaseSync;
  readonly #ownsDatabase: boolean;
  readonly #now: () => Date;

  /** Narrow typed views for composition roots that depend on individual ports. */
  readonly agents: AgentRepository = {
    put: (record) => this.putAgent(record),
    get: (id) => this.getAgent(id),
    list: () => this.listAgents()
  };
  readonly credentials: IdentityCredentialRepository = {
    create: (record, idempotencyKey) => this.createIdentityCredential(record, idempotencyKey),
    getByIdempotency: (key) => this.getIdentityCredentialByIdempotency(key),
    get: (id) => this.getIdentityCredential(id),
    list: (afterId, limit) => this.listIdentityCredentials(afterId, limit)
  };
  readonly keys: KeyRepository = {
    put: (record) => this.putKey(record),
    get: (id) => this.getKey(id),
    listForAgent: (id) => this.listKeysForAgent(id)
  };
  readonly trust: TrustRepository = {
    acceptSnapshot: (snapshot, anchors) => this.acceptTrustSnapshot(snapshot, anchors),
    getSnapshot: (id) => this.getTrustSnapshot(id),
    currentSnapshot: () => this.currentTrustSnapshot(),
    listAnchors: (id) => this.listTrustAnchors(id),
    acceptHighWater: (value) => this.acceptStatusHighWater(value),
    getHighWater: (snapshotId, publisherId, targetKeyId) =>
      this.getStatusHighWater(snapshotId, publisherId, targetKeyId)
  };
  readonly artifacts: ArtifactRepository = {
    put: (record) => this.putArtifact(record),
    get: (id) => this.getArtifact(id),
    list: (kind) => this.listArtifacts(kind),
    revoke: (record) => this.revokeArtifact(record),
    isRevoked: (targetType, targetId, at) => this.isRevoked(targetType, targetId, at),
    listRevocations: (targetId) => this.listRevocations(targetId)
  };
  readonly provenance: ProvenanceRepository = { graph: (rootId) => this.provenanceGraph(rootId) };
  readonly events: EventSink = {
    record: (event) => this.recordVerificationEvent(event),
    list: (filter) => this.listVerificationEvents(filter)
  };
  readonly replay: ReplayStore = {
    consume: (key, now) => this.consumeReplayKey(key, now),
    purgeExpired: (now) => this.purgeExpiredReplayKeys(now)
  };
  /** Core-compatible online replay adapter. Raw nonces are digested before persistence. */
  readonly coreReplayStore: CoreReplayStore = {
    consume: (input) => {
      const nonceDigest = `sha256:${createHash('sha256').update(input.nonce, 'utf8').digest('base64url')}`;
      const now = this.#now().toISOString();
      if (input.expiresAt.toISOString() <= now) return Promise.resolve('expired');
      const outcome = this.consumeReplayKey(
        {
          audience: input.audience,
          signerKeyId: input.signerKeyId,
          requestId: input.requestId,
          nonceDigest,
          expiresAt: input.expiresAt.toISOString()
        },
        now
      )
        ? 'consumed'
        : 'duplicate';
      return Promise.resolve(outcome);
    }
  };

  constructor(options: SqliteStorageOptions = {}) {
    if (options.path !== undefined && options.database !== undefined)
      throw new Error('set path or database, not both');
    this.#db = options.database ?? new DatabaseSync(options.path ?? ':memory:');
    this.#ownsDatabase = options.database === undefined;
    this.#now = options.now ?? (() => new Date());
    this.#configureAndMigrate();
  }

  close(): void {
    if (this.#ownsDatabase) this.#db.close();
  }

  putAgent(agent: AgentRecord): void {
    nonEmpty(agent.id, 'agent.id');
    this.#db
      .prepare(
        `INSERT INTO agents (id, principal_type, display_name, metadata_json, created_at, updated_at, deleted_at)
      VALUES (?, 'agent', ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, metadata_json = excluded.metadata_json,
        updated_at = excluded.updated_at, deleted_at = excluded.deleted_at`
      )
      .run(
        agent.id,
        agent.displayName ?? null,
        agent.metadata === undefined ? null : json(agent.metadata),
        agent.createdAt,
        agent.updatedAt,
        agent.deletedAt ?? null
      );
  }
  getAgent(id: string): AgentRecord | undefined {
    const row = this.#db.prepare('SELECT * FROM agents WHERE id = ?').get(id) as SqlRow | undefined;
    return row === undefined ? undefined : this.#agent(row);
  }
  listAgents(): readonly AgentRecord[] {
    return (
      this.#db
        .prepare('SELECT * FROM agents WHERE deleted_at IS NULL ORDER BY id')
        .all() as SqlRow[]
    ).map((row) => this.#agent(row));
  }

  createIdentityCredential(
    record: IdentityCredentialRecord,
    idempotencyKey?: string
  ): IdentityCredentialRecord {
    nonEmpty(record.id, 'credential.id');
    nonEmpty(record.agentId, 'credential.agentId');
    assertNoPrivateMaterial(record.credential);
    return this.#transaction(() => {
      if (idempotencyKey !== undefined) {
        const existing = this.#db
          .prepare('SELECT identity_id FROM identity_idempotency WHERE key = ?')
          .get(idempotencyKey) as SqlRow | undefined;
        if (existing !== undefined) {
          const identity = this.getIdentityCredential(requiredString(existing['identity_id']));
          if (identity === undefined) throw new Error('idempotency reference is invalid');
          return identity;
        }
      }
      const prior = this.getIdentityCredential(record.id);
      if (prior !== undefined) return prior;
      this.#db
        .prepare('INSERT INTO identity_credentials VALUES (?, ?, ?, ?)')
        .run(record.id, record.agentId, json(record.credential), record.createdAt);
      if (idempotencyKey !== undefined)
        this.#db
          .prepare('INSERT INTO identity_idempotency VALUES (?, ?, ?)')
          .run(idempotencyKey, record.id, record.createdAt);
      return record;
    });
  }
  getIdentityCredentialByIdempotency(key: string): IdentityCredentialRecord | undefined {
    const row = this.#db
      .prepare('SELECT identity_id FROM identity_idempotency WHERE key = ?')
      .get(key) as SqlRow | undefined;
    return row === undefined
      ? undefined
      : this.getIdentityCredential(requiredString(row['identity_id']));
  }
  getIdentityCredential(id: string): IdentityCredentialRecord | undefined {
    const row = this.#db.prepare('SELECT * FROM identity_credentials WHERE id = ?').get(id) as
      SqlRow | undefined;
    return row === undefined
      ? undefined
      : {
          id: requiredString(row['id']),
          agentId: requiredString(row['agent_id']),
          credential: parseJson(row['credential_json']),
          createdAt: requiredString(row['created_at'])
        };
  }
  listIdentityCredentials(
    afterId: string | undefined,
    limit: number
  ): readonly IdentityCredentialRecord[] {
    const rows = (
      afterId === undefined
        ? this.#db.prepare('SELECT * FROM identity_credentials ORDER BY id LIMIT ?').all(limit)
        : this.#db
            .prepare('SELECT * FROM identity_credentials WHERE id > ? ORDER BY id LIMIT ?')
            .all(afterId, limit)
    ) as SqlRow[];
    return rows.map((row) => ({
      id: requiredString(row['id']),
      agentId: requiredString(row['agent_id']),
      credential: parseJson(row['credential_json']),
      createdAt: requiredString(row['created_at'])
    }));
  }

  putKey(key: KeyRecord): void {
    nonEmpty(key.id, 'key.id');
    nonEmpty(key.agentId, 'key.agentId');
    assertPublicEd25519Jwk(key.publicJwk);
    if (key.notBefore > key.expiresAt) throw new Error('key validity interval is invalid');
    this.#transaction(() => {
      const existing = this.getKey(key.id);
      if (
        existing !== undefined &&
        (existing.agentId !== key.agentId ||
          JSON.stringify(existing.publicJwk) !== JSON.stringify(key.publicJwk))
      ) {
        throw new Error('key identity is immutable');
      }
      if (existing !== undefined && key.historySequence <= existing.historySequence) {
        throw new Error('key history sequence must advance');
      }
      this.#db
        .prepare(
          `INSERT INTO keys (id, agent_id, algorithm, public_jwk_json, provider_reference, status, not_before, expires_at, replacement_key_id, history_sequence, created_at, updated_at)
        VALUES (?, ?, 'Ed25519', ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET provider_reference = excluded.provider_reference, status = excluded.status,
          not_before = excluded.not_before, expires_at = excluded.expires_at, replacement_key_id = excluded.replacement_key_id,
          history_sequence = excluded.history_sequence, updated_at = excluded.updated_at`
        )
        .run(
          key.id,
          key.agentId,
          json(key.publicJwk),
          key.providerReference ?? null,
          key.status,
          key.notBefore,
          key.expiresAt,
          key.replacementKeyId ?? null,
          key.historySequence,
          key.createdAt,
          key.updatedAt
        );
      this.#db
        .prepare('INSERT INTO key_history VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          key.id,
          key.historySequence,
          key.status,
          key.notBefore,
          key.expiresAt,
          key.replacementKeyId ?? null,
          key.providerReference ?? null,
          key.updatedAt
        );
    });
  }
  getKey(id: string): KeyRecord | undefined {
    const row = this.#db.prepare('SELECT * FROM keys WHERE id = ?').get(id) as SqlRow | undefined;
    return row === undefined ? undefined : this.#key(row);
  }
  listKeysForAgent(agentId: string): readonly KeyRecord[] {
    return (
      this.#db
        .prepare('SELECT * FROM keys WHERE agent_id = ? ORDER BY history_sequence')
        .all(agentId) as SqlRow[]
    ).map((row) => this.#key(row));
  }

  acceptTrustSnapshot(snapshot: TrustSnapshotRecord, anchors: readonly TrustAnchorRecord[]): void {
    nonEmpty(snapshot.snapshotId, 'snapshot.snapshotId');
    nonEmpty(snapshot.policyHash, 'snapshot.policyHash');
    if (snapshot.issuedAt > snapshot.expiresAt)
      throw new Error('trust snapshot validity interval is invalid');
    if (anchors.some((anchor) => anchor.snapshotId !== snapshot.snapshotId))
      throw new Error('anchor belongs to another trust snapshot');
    for (const anchor of anchors) assertPublicEd25519Jwk(anchor.publicJwk);
    this.#transaction(() => {
      const current = this.#db
        .prepare(
          'SELECT snapshot_id, policy_hash, sequence FROM trust_snapshots ORDER BY sequence DESC LIMIT 1'
        )
        .get() as SqlRow | undefined;
      const sameId = this.#db
        .prepare('SELECT policy_hash, sequence FROM trust_snapshots WHERE snapshot_id = ?')
        .get(snapshot.snapshotId) as SqlRow | undefined;
      if (sameId !== undefined) {
        if (
          requiredString(sameId['policy_hash']) !== snapshot.policyHash ||
          requiredInteger(sameId['sequence']) !== snapshot.sequence
        )
          throw new Error('trust snapshot identity conflict');
        return; // An immutable accepted snapshot may be supplied idempotently.
      }
      if (current !== undefined && snapshot.sequence <= requiredInteger(current['sequence']))
        throw new Error('trust snapshot sequence rollback');
      this.#db
        .prepare('INSERT INTO trust_snapshots VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          snapshot.snapshotId,
          snapshot.policyHash,
          snapshot.sequence,
          snapshot.canonicalPolicy,
          snapshot.issuerId,
          snapshot.issuedAt,
          snapshot.expiresAt,
          snapshot.source ?? null,
          snapshot.createdAt
        );
      const insert = this.#db.prepare('INSERT INTO trust_anchors VALUES (?, ?, ?, ?, ?, ?)');
      for (const anchor of anchors)
        insert.run(
          anchor.snapshotId,
          anchor.anchorId,
          anchor.principalId,
          anchor.purpose,
          json(anchor.publicJwk),
          anchor.createdAt
        );
    });
  }
  getTrustSnapshot(snapshotId: string): TrustSnapshotRecord | undefined {
    const row = this.#db
      .prepare('SELECT * FROM trust_snapshots WHERE snapshot_id = ?')
      .get(snapshotId) as SqlRow | undefined;
    return row === undefined ? undefined : this.#snapshot(row);
  }
  currentTrustSnapshot(): TrustSnapshotRecord | undefined {
    const row = this.#db
      .prepare('SELECT * FROM trust_snapshots ORDER BY sequence DESC LIMIT 1')
      .get() as SqlRow | undefined;
    return row === undefined ? undefined : this.#snapshot(row);
  }
  listTrustAnchors(snapshotId: string): readonly TrustAnchorRecord[] {
    return (
      this.#db
        .prepare('SELECT * FROM trust_anchors WHERE snapshot_id = ? ORDER BY anchor_id')
        .all(snapshotId) as SqlRow[]
    ).map((row) => ({
      snapshotId: requiredString(row['snapshot_id']),
      anchorId: requiredString(row['anchor_id']),
      principalId: requiredString(row['principal_id']),
      purpose: requiredString(row['purpose']),
      publicJwk: parseJson(row['public_jwk_json']),
      createdAt: requiredString(row['created_at'])
    }));
  }
  acceptStatusHighWater(value: StatusPublisherHighWater): void {
    if (!Number.isSafeInteger(value.sequence) || value.sequence < 1 || value.digest.length === 0)
      throw new Error('invalid status publisher high water');
    this.#transaction(() => {
      const previous = this.getStatusHighWater(
        value.snapshotId,
        value.publisherId,
        value.targetKeyId
      );
      if (
        previous !== undefined &&
        value.sequence === previous.sequence &&
        value.digest === previous.digest
      )
        return;
      if (
        (previous === undefined && value.sequence !== 1) ||
        (previous !== undefined && value.sequence !== previous.sequence + 1)
      ) {
        throw new Error('status publisher sequence gap, rollback, or fork');
      }
      const accepted = this.#db
        .prepare(
          `INSERT INTO status_publishers (snapshot_id, publisher_id, target_key_id, sequence, digest, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(snapshot_id, publisher_id, target_key_id) DO UPDATE SET
            sequence = excluded.sequence, digest = excluded.digest, updated_at = excluded.updated_at
          WHERE excluded.sequence = status_publishers.sequence + 1`
        )
        .run(
          value.snapshotId,
          value.publisherId,
          value.targetKeyId,
          value.sequence,
          value.digest,
          value.updatedAt
        ) as { changes: number };
      if (accepted.changes !== 1)
        throw new Error('status publisher sequence gap, rollback, or fork');
    });
  }
  getStatusHighWater(
    snapshotId: string,
    publisherId: string,
    targetKeyId: string
  ): StatusPublisherHighWater | undefined {
    const row = this.#db
      .prepare(
        'SELECT * FROM status_publishers WHERE snapshot_id = ? AND publisher_id = ? AND target_key_id = ?'
      )
      .get(snapshotId, publisherId, targetKeyId) as SqlRow | undefined;
    return row === undefined
      ? undefined
      : {
          snapshotId: requiredString(row['snapshot_id']),
          publisherId: requiredString(row['publisher_id']),
          targetKeyId: requiredString(row['target_key_id']),
          sequence: requiredInteger(row['sequence']),
          digest: requiredString(row['digest']),
          updatedAt: requiredString(row['updated_at'])
        };
  }

  putArtifact(record: SignedArtifactRecord): void {
    assertNoPrivateMaterial(record.artifact);
    this.#transaction(() => {
      const existing = this.getArtifact(record.id);
      if (existing !== undefined) {
        if (existing.kind !== record.kind || json(existing.artifact) !== json(record.artifact))
          throw new Error('signed artifact identity conflict');
        return;
      }
      this.#db
        .prepare('INSERT INTO signed_artifacts VALUES (?, ?, ?, ?, ?)')
        .run(record.id, record.kind, json(record.artifact), record.issuedAt, record.createdAt);
      for (const edge of provenanceEdges(record))
        this.#db
          .prepare('INSERT OR IGNORE INTO provenance_edges VALUES (?, ?, ?)')
          .run(record.id, edge.to, edge.relation);
    });
  }
  getArtifact(id: string): SignedArtifactRecord | undefined {
    const row = this.#db.prepare('SELECT * FROM signed_artifacts WHERE id = ?').get(id) as
      SqlRow | undefined;
    return row === undefined ? undefined : this.#artifact(row);
  }
  listArtifacts(kind?: StoredArtifactKind): readonly SignedArtifactRecord[] {
    const rows = (
      kind === undefined
        ? this.#db.prepare('SELECT * FROM signed_artifacts ORDER BY issued_at, id').all()
        : this.#db
            .prepare('SELECT * FROM signed_artifacts WHERE kind = ? ORDER BY issued_at, id')
            .all(kind)
    ) as SqlRow[];
    return rows.map((row) => this.#artifact(row));
  }
  revokeArtifact(record: RevocationRecord): void {
    assertNoPrivateMaterial(record.artifact);
    this.#transaction(() => {
      const artifact = this.getArtifact(record.id);
      if (artifact === undefined || artifact.kind !== 'revocation')
        throw new Error('revocation must reference a stored signed revocation artifact');
      this.#db
        .prepare('INSERT INTO revocations VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING')
        .run(
          record.id,
          record.targetType,
          record.targetId,
          record.effectiveAt,
          json(record.artifact),
          record.createdAt
        );
    });
  }
  isRevoked(targetType: RevocationRecord['targetType'], targetId: string, at: string): boolean {
    return (
      (this.#db
        .prepare(
          'SELECT 1 FROM revocations WHERE target_type = ? AND target_id = ? AND julianday(effective_at) <= julianday(?) LIMIT 1'
        )
        .get(targetType, targetId, at) as SqlRow | undefined) !== undefined
    );
  }
  listRevocations(targetId?: string): readonly RevocationRecord[] {
    const rows = (
      targetId === undefined
        ? this.#db.prepare('SELECT * FROM revocations ORDER BY effective_at, id').all()
        : this.#db
            .prepare('SELECT * FROM revocations WHERE target_id = ? ORDER BY effective_at, id')
            .all(targetId)
    ) as SqlRow[];
    return rows.map((row) => ({
      id: requiredString(row['id']),
      targetType: requiredString(row['target_type']) as RevocationRecord['targetType'],
      targetId: requiredString(row['target_id']),
      effectiveAt: requiredString(row['effective_at']),
      artifact: parseJson(row['artifact_json']),
      createdAt: requiredString(row['created_at'])
    }));
  }
  provenanceGraph(rootId?: string): ProvenanceGraph {
    const artifacts =
      rootId === undefined ? this.listArtifacts() : this.#reachableArtifacts(rootId);
    const nodes: ProvenanceGraphNode[] = artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      valid: !(
        artifact.kind === 'delegation' &&
        this.isRevoked('delegation', artifact.id, this.#now().toISOString())
      ),
      artifact: artifact.artifact
    }));
    const ids = new Set(nodes.map((node) => node.id));
    const edges = (
      this.#db
        .prepare('SELECT * FROM provenance_edges ORDER BY from_id, relation, to_id')
        .all() as SqlRow[]
    )
      .map((row) => ({
        from: requiredString(row['from_id']),
        to: requiredString(row['to_id']),
        relation: requiredString(row['relation']) as ProvenanceGraphEdge['relation']
      }))
      .filter((edge) => rootId === undefined || (ids.has(edge.from) && ids.has(edge.to)));
    return { nodes, edges };
  }

  recordVerificationEvent(event: VerificationEventRecord): void {
    assertRedacted(event.redactedEvidence);
    this.#db
      .prepare(`INSERT INTO verification_events VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(
        event.id,
        event.occurredAt,
        event.decision,
        event.primaryCode,
        json(event.secondaryCodes),
        event.artifactDigest ?? null,
        json(event.evidenceIds),
        event.trustSnapshotId ?? null,
        event.policyHash ?? null,
        event.trustSequence ?? null,
        event.statusHash ?? null,
        event.redactedEvidence === undefined ? null : json(event.redactedEvidence)
      );
  }
  listVerificationEvents(filter: VerificationEventFilter = {}): VerificationEventPage {
    const limit = Math.min(Math.max(filter.limit ?? 50, 1), 200);
    const clauses: string[] = [];
    const values: SqlValue[] = [];
    if (filter.afterId !== undefined) {
      clauses.push('id < ?');
      values.push(filter.afterId);
    }
    if (filter.decision !== undefined) {
      clauses.push('decision = ?');
      values.push(filter.decision);
    }
    if (filter.trustSnapshotId !== undefined) {
      clauses.push('trust_snapshot_id = ?');
      values.push(filter.trustSnapshotId);
    }
    const where = clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`;
    const rows = this.#db
      .prepare(`SELECT * FROM verification_events ${where} ORDER BY id DESC LIMIT ?`)
      .all(...values, limit + 1) as SqlRow[];
    const items = rows.slice(0, limit).map((row) => this.#event(row));
    if (rows.length <= limit) return { items };
    const nextAfterId = items.at(-1)?.id;
    return nextAfterId === undefined ? { items } : { items, nextAfterId };
  }

  consumeReplayKey(key: ReplayKey, now: string): boolean {
    if (key.expiresAt <= now) return false;
    return this.#transaction(() => {
      const result = this.#db
        .prepare('INSERT INTO replay_requests VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING')
        .run(key.audience, key.signerKeyId, key.requestId, key.nonceDigest, key.expiresAt, now) as {
        changes: number;
      };
      return result.changes === 1;
    });
  }
  purgeExpiredReplayKeys(now: string): number {
    const result = this.#db
      .prepare('DELETE FROM replay_requests WHERE expires_at < ?')
      .run(now) as { changes: number };
    return result.changes;
  }

  #configureAndMigrate(): void {
    this.#db.exec(
      'PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF; PRAGMA journal_mode = WAL; PRAGMA synchronous = FULL;'
    );
    this.#db.exec(
      'CREATE TABLE IF NOT EXISTS migrations (id TEXT PRIMARY KEY NOT NULL, checksum TEXT NOT NULL, applied_at TEXT NOT NULL) STRICT;'
    );
    const applied = this.#db
      .prepare('SELECT id, checksum FROM migrations ORDER BY id')
      .all() as SqlRow[];
    if (applied.length > migrations.length) throw new Error('database contains unknown migrations');
    for (let index = 0; index < applied.length; index += 1) {
      const expected = migrations[index];
      const found = applied[index];
      if (
        expected === undefined ||
        found === undefined ||
        found['id'] !== expected.id ||
        found['checksum'] !== expected.checksum
      )
        throw new Error('migration history is missing, reordered, or checksum-mismatched');
    }
    for (const migration of migrations.slice(applied.length))
      this.#transaction(() => {
        this.#db.exec(migration.sql);
        this.#db
          .prepare('INSERT INTO migrations VALUES (?, ?, ?)')
          .run(migration.id, migration.checksum, this.#now().toISOString());
      });
  }
  #transaction<T>(operation: () => T): T {
    this.#db.exec('BEGIN IMMEDIATE');
    try {
      const result = operation();
      this.#db.exec('COMMIT');
      return result;
    } catch (error) {
      this.#db.exec('ROLLBACK');
      throw error;
    }
  }
  #reachableArtifacts(rootId: string): readonly SignedArtifactRecord[] {
    const rows = this.#db
      .prepare(
        `WITH RECURSIVE reachable(id) AS (
          SELECT ?
          UNION
          SELECT provenance_edges.to_id FROM provenance_edges JOIN reachable ON provenance_edges.from_id = reachable.id
        ) SELECT signed_artifacts.* FROM signed_artifacts JOIN reachable ON signed_artifacts.id = reachable.id ORDER BY issued_at, id`
      )
      .all(rootId) as SqlRow[];
    return rows.map((row) => this.#artifact(row));
  }
  #artifact(row: SqlRow): SignedArtifactRecord {
    return {
      id: requiredString(row['id']),
      kind: requiredString(row['kind']) as StoredArtifactKind,
      artifact: parseJson(row['artifact_json']),
      issuedAt: requiredString(row['issued_at']),
      createdAt: requiredString(row['created_at'])
    };
  }
  #agent(row: SqlRow): AgentRecord {
    const displayName = optionalString(row['display_name']);
    const deletedAt = optionalString(row['deleted_at']);
    const metadata = row['metadata_json'] === null ? undefined : parseJson(row['metadata_json']);
    return {
      id: requiredString(row['id']),
      principalType: 'agent',
      ...(displayName === undefined ? {} : { displayName }),
      ...(metadata === undefined ? {} : { metadata }),
      createdAt: requiredString(row['created_at']),
      updatedAt: requiredString(row['updated_at']),
      ...(deletedAt === undefined ? {} : { deletedAt })
    };
  }
  #key(row: SqlRow): KeyRecord {
    const providerReference = optionalString(row['provider_reference']);
    const replacementKeyId = optionalString(row['replacement_key_id']);
    return {
      id: requiredString(row['id']),
      agentId: requiredString(row['agent_id']),
      algorithm: 'Ed25519',
      publicJwk: parseJson(row['public_jwk_json']),
      ...(providerReference === undefined ? {} : { providerReference }),
      status: requiredString(row['status']) as KeyRecord['status'],
      notBefore: requiredString(row['not_before']),
      expiresAt: requiredString(row['expires_at']),
      ...(replacementKeyId === undefined ? {} : { replacementKeyId }),
      historySequence: requiredInteger(row['history_sequence']),
      createdAt: requiredString(row['created_at']),
      updatedAt: requiredString(row['updated_at'])
    };
  }
  #snapshot(row: SqlRow): TrustSnapshotRecord {
    const source = optionalString(row['source']);
    return {
      snapshotId: requiredString(row['snapshot_id']),
      policyHash: requiredString(row['policy_hash']),
      sequence: requiredInteger(row['sequence']),
      canonicalPolicy: blob(row['canonical_policy']),
      issuerId: requiredString(row['issuer_id']),
      issuedAt: requiredString(row['issued_at']),
      expiresAt: requiredString(row['expires_at']),
      ...(source === undefined ? {} : { source }),
      createdAt: requiredString(row['created_at'])
    };
  }
  #event(row: SqlRow): VerificationEventRecord {
    const artifactDigest = optionalString(row['artifact_digest']);
    const trustSnapshotId = optionalString(row['trust_snapshot_id']);
    const policyHash = optionalString(row['policy_hash']);
    const statusHash = optionalString(row['status_hash']);
    const trustSequence =
      row['trust_sequence'] === null ? undefined : requiredInteger(row['trust_sequence']);
    const redactedEvidence =
      row['redacted_evidence_json'] === null ? undefined : parseJson(row['redacted_evidence_json']);
    return {
      id: requiredString(row['id']),
      occurredAt: requiredString(row['occurred_at']),
      decision: requiredString(row['decision']) as VerificationEventRecord['decision'],
      primaryCode: requiredString(row['primary_code']),
      secondaryCodes: parseJson(row['secondary_codes_json']) as readonly string[],
      ...(artifactDigest === undefined ? {} : { artifactDigest }),
      evidenceIds: parseJson(row['evidence_ids_json']) as readonly string[],
      ...(trustSnapshotId === undefined ? {} : { trustSnapshotId }),
      ...(policyHash === undefined ? {} : { policyHash }),
      ...(trustSequence === undefined ? {} : { trustSequence }),
      ...(statusHash === undefined ? {} : { statusHash }),
      ...(redactedEvidence === undefined ? {} : { redactedEvidence })
    };
  }
}

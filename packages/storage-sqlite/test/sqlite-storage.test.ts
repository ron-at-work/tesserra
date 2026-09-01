import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { SqliteStorage } from '../src/index.js';

const now = '2026-09-01T00:00:00Z';
const publicJwk = {
  kty: 'OKP',
  crv: 'Ed25519',
  x: '11qYAYLefAqG2oMef6A8S_7i7Fe1P8RiKL6aD1G2ofc'
} as const;

function store(): SqliteStorage {
  return new SqliteStorage({ path: ':memory:' });
}

test('stores agents and public-key metadata but rejects private JWK material', () => {
  const db = store();
  db.agents.put({
    id: 'agid:example:build',
    principalType: 'agent',
    displayName: 'Build',
    createdAt: now,
    updatedAt: now
  });
  db.keys.put({
    id: 'urn:agent-proof:kid:v1:sha256:key',
    agentId: 'agid:example:build',
    algorithm: 'Ed25519',
    publicJwk,
    providerReference: 'local-key:opaque-handle',
    status: 'active',
    notBefore: now,
    expiresAt: '2027-09-01T00:00:00Z',
    historySequence: 0,
    createdAt: now,
    updatedAt: now
  });
  assert.deepEqual(db.keys.get('urn:agent-proof:kid:v1:sha256:key')?.publicJwk, publicJwk);
  assert.throws(
    () =>
      db.keys.put({
        id: 'private',
        agentId: 'agid:example:build',
        algorithm: 'Ed25519',
        publicJwk: { ...publicJwk, d: 'private-key-bytes' },
        status: 'active',
        notBefore: now,
        expiresAt: '2027-09-01T00:00:00Z',
        historySequence: 1,
        createdAt: now,
        updatedAt: now
      }),
    /private key material/
  );
  db.close();
});

test('accepts immutable monotonically ordered trust snapshots atomically with anchors', () => {
  const db = store();
  const snapshot = {
    snapshotId: 'snapshot-1',
    policyHash: 'urn:agent-proof:policy:v1:sha256:one',
    sequence: 1,
    canonicalPolicy: new Uint8Array([1, 2]),
    issuerId: 'issuer',
    issuedAt: now,
    expiresAt: '2027-09-01T00:00:00Z',
    createdAt: now
  };
  const anchor = {
    snapshotId: snapshot.snapshotId,
    anchorId: 'root-1',
    principalId: 'issuer',
    purpose: 'credential-issuer',
    publicJwk,
    createdAt: now
  };
  db.trust.acceptSnapshot(snapshot, [anchor]);
  assert.equal(db.trust.currentSnapshot()?.snapshotId, 'snapshot-1');
  assert.equal(db.trust.listAnchors('snapshot-1').length, 1);
  assert.throws(
    () => db.trust.acceptSnapshot({ ...snapshot, policyHash: 'different' }, []),
    /identity conflict/
  );
  assert.throws(
    () => db.trust.acceptSnapshot({ ...snapshot, snapshotId: 'snapshot-0', sequence: 0 }, []),
    /sequence rollback/
  );
  db.close();
});

test('atomically consumes both request-id and nonce replay keys', () => {
  const db = store();
  const key = {
    audience: 'https://receiver.example',
    signerKeyId: 'kid',
    requestId: 'request-1',
    nonceDigest: 'nonce-1',
    expiresAt: '2026-09-01T00:05:00Z'
  };
  assert.equal(db.replay.consume(key, now), true);
  assert.equal(db.replay.consume(key, now), false);
  assert.equal(db.replay.consume({ ...key, requestId: 'request-2' }, now), false);
  assert.equal(
    db.replay.consume(
      { ...key, requestId: 'expired', nonceDigest: 'expired', expiresAt: '2026-08-01T00:00:00Z' },
      now
    ),
    false
  );
  db.close();
});

test('updates status publisher high water only through monotonic next sequences', () => {
  const db = store();
  db.trust.acceptSnapshot(
    {
      snapshotId: 'snapshot-1',
      policyHash: 'urn:agent-proof:policy:v1:sha256:one',
      sequence: 1,
      canonicalPolicy: new Uint8Array([1]),
      issuerId: 'issuer',
      issuedAt: now,
      expiresAt: '2027-09-01T00:00:00Z',
      createdAt: now
    },
    []
  );
  const first = {
    snapshotId: 'snapshot-1',
    publisherId: 'publisher',
    targetKeyId: 'key',
    sequence: 1,
    digest: 'digest-1',
    updatedAt: now
  };
  db.trust.acceptHighWater(first);
  db.trust.acceptHighWater(first);
  db.trust.acceptHighWater({
    ...first,
    sequence: 2,
    digest: 'digest-2',
    updatedAt: '2026-09-01T00:01:00Z'
  });
  assert.deepEqual(db.trust.getHighWater('snapshot-1', 'publisher', 'key'), {
    ...first,
    sequence: 2,
    digest: 'digest-2',
    updatedAt: '2026-09-01T00:01:00Z'
  });
  assert.throws(
    () => db.trust.acceptHighWater({ ...first, sequence: 2, digest: 'fork' }),
    /gap, rollback, or fork/
  );
  assert.throws(() => db.trust.acceptHighWater(first), /gap, rollback, or fork/);
  assert.throws(
    () => db.trust.acceptHighWater({ ...first, sequence: 4, digest: 'gap' }),
    /gap, rollback, or fork/
  );
  assert.throws(
    () => db.trust.acceptHighWater({ ...first, targetKeyId: 'other', sequence: 2 }),
    /gap, rollback, or fork/
  );
  db.close();
});

test('uses the injected replay clock and rejects the exact expiry boundary', async () => {
  const db = new SqliteStorage({ path: ':memory:', now: () => new Date(now) });
  const outcome = await db.coreReplayStore.consume({
    audience: 'https://receiver.example',
    signerKeyId: 'kid',
    requestId: 'expired',
    nonce: 'nonce',
    expiresAt: new Date(now)
  });
  assert.equal(outcome, 'expired');
  db.close();
});

test('persists only redacted verification evidence and pages events', () => {
  const db = store();
  db.events.record({
    id: 'event-1',
    occurredAt: now,
    decision: 'rejected',
    primaryCode: 'INVALID_SIGNATURE',
    secondaryCodes: [],
    evidenceIds: ['credential'],
    redactedEvidence: { artifactDigest: 'sha256:abc' }
  });
  assert.deepEqual(
    db.events.list().items.map((event) => event.id),
    ['event-1']
  );
  assert.throws(
    () =>
      db.events.record({
        id: 'event-2',
        occurredAt: now,
        decision: 'verified',
        primaryCode: 'VALID',
        secondaryCodes: [],
        evidenceIds: [],
        redactedEvidence: { private_key: 'not allowed' }
      }),
    /prohibited field/
  );
  db.close();
});

test('preserves key lifecycle history and rejects non-monotonic status changes', () => {
  const db = store();
  db.agents.put({
    id: 'agid:example:rotate',
    principalType: 'agent',
    createdAt: now,
    updatedAt: now
  });
  const initial = {
    id: 'kid-rotate',
    agentId: 'agid:example:rotate',
    algorithm: 'Ed25519' as const,
    publicJwk,
    status: 'active' as const,
    notBefore: now,
    expiresAt: '2027-09-01T00:00:00Z',
    historySequence: 0,
    createdAt: now,
    updatedAt: now
  };
  db.keys.put(initial);
  db.keys.put({
    ...initial,
    status: 'retired',
    historySequence: 1,
    updatedAt: '2026-10-01T00:00:00Z'
  });
  assert.equal(db.keys.get('kid-rotate')?.status, 'retired');
  assert.throws(
    () => db.keys.put({ ...initial, status: 'active', historySequence: 1 }),
    /must advance/
  );
  db.close();
});

test('migrates a temporary file database once and reads persisted state after reopening', () => {
  const directory = mkdtempSync(join(tmpdir(), 'agent-proof-storage-'));
  const path = join(directory, 'identity.sqlite');
  try {
    const first = new SqliteStorage({ path });
    first.agents.put({
      id: 'agid:example:persistent',
      principalType: 'agent',
      createdAt: now,
      updatedAt: now
    });
    first.close();
    const second = new SqliteStorage({ path });
    assert.equal(second.agents.get('agid:example:persistent')?.id, 'agid:example:persistent');
    second.close();
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

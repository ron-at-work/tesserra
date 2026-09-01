import assert from 'node:assert/strict';
import { test } from 'vitest';
import { SqliteStorage } from '../src/index.js';

const now = '2026-09-01T00:00:00Z';
const id = (value: string) => `urn:agent-proof:v1:sha256:${value}`;

test('persists immutable signed artifacts and materializes deterministic provenance edges', () => {
  const db = new SqliteStorage({ path: ':memory:', now: () => new Date(now) });
  db.artifacts.put({
    id: id('request'),
    kind: 'request',
    issuedAt: now,
    createdAt: now,
    artifact: { kind: 'request', request_id: 'request' }
  });
  db.artifacts.put({
    id: id('delegation'),
    kind: 'delegation',
    issuedAt: now,
    createdAt: now,
    artifact: { kind: 'delegation' }
  });
  db.artifacts.put({
    id: id('provenance'),
    kind: 'provenance',
    issuedAt: now,
    createdAt: now,
    artifact: {
      kind: 'provenance',
      authority_refs: [{ id: id('delegation'), kind: 'delegation' }],
      request_ref: { id: id('request'), kind: 'request' },
      predecessor_refs: []
    }
  });
  const graph = db.provenance.graph(id('provenance'));
  assert.deepEqual(
    graph.nodes.map((node) => node.id),
    [id('delegation'), id('provenance'), id('request')]
  );
  assert.deepEqual(graph.edges, [
    { from: id('provenance'), to: id('delegation'), relation: 'authority' },
    { from: id('provenance'), to: id('request'), relation: 'request' }
  ]);
  assert.throws(
    () =>
      db.artifacts.put({
        id: id('request'),
        kind: 'request',
        issuedAt: now,
        createdAt: now,
        artifact: { kind: 'request', changed: true }
      }),
    /identity conflict/
  );
  db.close();
});

test('does not treat revoked authority as valid provenance evidence', () => {
  const db = new SqliteStorage({ path: ':memory:', now: () => new Date(now) });
  const delegation = id('delegation');
  const revocation = id('revocation');
  db.artifacts.put({
    id: delegation,
    kind: 'delegation',
    issuedAt: now,
    createdAt: now,
    artifact: { kind: 'delegation' }
  });
  db.artifacts.put({
    id: revocation,
    kind: 'revocation',
    issuedAt: now,
    createdAt: now,
    artifact: { kind: 'revocation' }
  });
  db.artifacts.revoke({
    id: revocation,
    targetType: 'delegation',
    targetId: delegation,
    effectiveAt: now,
    artifact: { kind: 'revocation' },
    createdAt: now
  });
  assert.equal(db.artifacts.isRevoked('delegation', delegation, now), true);
  const graph = db.provenance.graph();
  assert.equal(graph.nodes.find((node) => node.id === delegation)?.valid, false);
  db.close();
});

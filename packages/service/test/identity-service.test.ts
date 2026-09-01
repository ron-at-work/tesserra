import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  createIdentityService,
  ServiceError,
  type CreateIdentityInput,
  type IdentityCredential,
  type IdentityRecord,
  type IdentityRepository,
  type IdentityVerifier,
  type Page,
  type TrustSnapshot,
  type TrustSnapshotProvider
} from '../src/index.js';

const now = new Date('2026-09-01T00:00:00.000Z');
const snapshot: TrustSnapshot = {
  snapshot_id: 'local',
  sequence: 1,
  issued_at: '2026-09-01T00:00:00Z',
  expires_at: '2026-09-02T00:00:00Z',
  policy_hash: 'urn:agent-proof:policy:v1:sha256:test'
};
const input: CreateIdentityInput = {
  subject: { scheme: 'agid', version: 1, authority: 'example.test', path: ['build', 'agent'] },
  issuer: { type: 'service', id: 'issuer:local' },
  authorityCeiling: {
    capabilities: ['read'],
    resources: [{ type: 'opaque', value: 'unit-test' }],
    tasks: ['018f28c8-4c1c-7000-8000-000000000001'],
    audiences: ['local.test'],
    not_before: '2026-09-01T00:00:00Z',
    expires_at: '2026-09-02T00:00:00Z',
    remaining_depth: 0
  }
};

function credential(): IdentityCredential {
  return {
    version: 'agent-proof/v1',
    kind: 'credential',
    id: 'urn:agent-proof:v1:sha256:test',
    issued_at: '2026-09-01T00:00:00Z',
    proof: { alg: 'Ed25519', kid: 'urn:agent-proof:kid:v1:sha256:test', sig: 'test' },
    issuer: input.issuer,
    subject: { type: 'agent', id: input.subject },
    public_jwk: { kty: 'OKP', crv: 'Ed25519', x: 'test' },
    key_id: 'urn:agent-proof:kid:v1:sha256:test',
    not_before: input.authorityCeiling.not_before,
    expires_at: input.authorityCeiling.expires_at,
    credential_purpose: 'agent-root-authority',
    authority_ceiling: input.authorityCeiling
  };
}

function inMemoryService() {
  const records = new Map<string, IdentityRecord>();
  const repository: IdentityRepository = {
    async create(record) {
      records.set(record.id, record);
      return record;
    },
    async get(id) {
      return records.get(id);
    },
    async list(): Promise<Page<IdentityRecord>> {
      return { items: [...records.values()] };
    }
  };
  const verifier: IdentityVerifier = {
    async verify(_credential, trust, clock) {
      assert.equal(trust, snapshot);
      assert.equal(clock, now);
      return {
        valid: true,
        code: 'VALID',
        decision_version: 'agent-proof/v1',
        evidence_ids: [],
        policy_hash: snapshot.policy_hash,
        status_snapshot_hash: 'urn:agent-proof:status:v1:sha256:test',
        replay_checked: false,
        secondary_codes: [],
        status_fresh: false,
        verifier_now: '2026-09-01T00:00:00Z',
        warnings: []
      };
    }
  };
  return createIdentityService({
    identities: repository,
    issuer: {
      async issue() {
        return credential();
      }
    },
    verifier,
    trust: {
      async current() {
        return snapshot;
      },
      async reloadConfigured() {
        return snapshot;
      }
    },
    clock: { now: () => now }
  });
}

test('identity service orchestrates injected ports and verifies against pinned trust', async () => {
  const service = inMemoryService();
  const created = await service.createIdentity(input);
  assert.equal(created.id, credential().id);
  assert.equal(
    (await service.getIdentity(created.id)).credential.subject.id.authority,
    'example.test'
  );
  assert.equal((await service.listAgents(undefined, 25)).items.length, 1);
  assert.equal((await service.verifyIdentity(created.credential)).code, 'VALID');
});

test('identity service rejects omitted authority selectors', async () => {
  const service = inMemoryService();
  await assert.rejects(
    () =>
      service.createIdentity({
        ...input,
        authorityCeiling: { ...input.authorityCeiling, tasks: [] }
      }),
    (error: unknown) => error instanceof ServiceError && error.code === 'INVALID_INPUT'
  );
});

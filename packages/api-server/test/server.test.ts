import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { test, vi } from 'vitest';
import { createLocalApiServer, isLoopbackAddress, type EvidenceApi } from '../src/index.js';
import { ServiceError, type IdentityService } from '@agent-proof/service';
import type { ArtifactBase } from '@agent-proof/protocol';

const trust = {
  snapshot_id: 'local',
  sequence: 1,
  issued_at: '2026-09-01T00:00:00Z',
  expires_at: '2026-09-02T00:00:00Z',
  policy_hash: 'urn:agent-proof:policy:v1:sha256:test'
};
const service: IdentityService = {
  async createIdentity() {
    throw new ServiceError('INVALID_INPUT', 'invalid identity');
  },
  async getIdentity() {
    throw new ServiceError('IDENTITY_NOT_FOUND', 'missing');
  },
  async verifyIdentity() {
    throw new Error('secret database failure');
  },
  async listAgents() {
    return { items: [] };
  },
  async readTrustSnapshot() {
    return trust;
  },
  async reloadTrustSnapshot() {
    return trust;
  }
};

async function withServer(
  run: (base: string) => Promise<void>,
  options: {
    readonly identityService?: IdentityService;
    readonly evidence?: EvidenceApi;
    readonly now?: () => Date;
  } = {}
): Promise<void> {
  const port = 46000 + Math.floor(Math.random() * 1000);
  const server = createLocalApiServer({
    service: options.identityService ?? service,
    ...(options.evidence === undefined ? {} : { evidence: options.evidence }),
    ...(options.now === undefined ? {} : { now: options.now }),
    port,
    trustReloadToken: 'reload-token',
    reloadFailureLimit: 2,
    requestId: () => 'test-request'
  });
  await server.listen();
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await server.close();
  }
}

test('server accepts only loopback binding forms', () => {
  assert.equal(isLoopbackAddress('127.0.0.1'), true);
  assert.equal(isLoopbackAddress('::1'), true);
  assert.equal(isLoopbackAddress('127.0.0.1.evil.test'), false);
  assert.equal(isLoopbackAddress('0.0.0.0'), false);
  assert.throws(() => createLocalApiServer({ service, host: '0.0.0.0' }), /non-loopback/);
});

test('persistence refuses malformed and ID-mismatched signed artifacts before graph mutation', async () => {
  await withServer(async (base) => {
    const malformed = await fetch(`${base}/v1/delegations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ delegation: { kind: 'delegation' } })
    });
    assert.equal(malformed.status, 400);
    assert.equal(
      ((await malformed.json()) as { error: { code: string } }).error.code,
      'INVALID_INPUT'
    );
    const spoofed = await fetch(`${base}/v1/revocations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        revocation: {
          version: 'agent-proof/v1',
          kind: 'revocation',
          id: 'urn:agent-proof:v1:sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          issued_at: '2026-09-01T00:00:00Z',
          proof: { alg: 'Ed25519', kid: 'bad', sig: 'bad' }
        }
      })
    });
    assert.equal(spoofed.status, 400);
  });
});

test('delegation persistence accepts complete valid evidence and rejects tampering', async () => {
  const fixture = JSON.parse(
    await readFile(join(cwd(), '../../tests/conformance/v1/cases/positive-two-hop.json'), 'utf8')
  ) as { trust_snapshot: unknown; verifier_now: string; artifacts: ArtifactBase[] };
  const now = new Date(fixture.verifier_now);
  const valid = fixture.artifacts.filter(
    (artifact) =>
      artifact.kind === 'credential' ||
      artifact.kind === 'delegation' ||
      artifact.kind === 'key_status'
  );
  const delegation = valid.find((artifact) => artifact.kind === 'delegation')!;
  const created = vi.fn(async (artifact: ArtifactBase) => ({
    id: artifact.id,
    artifact,
    createdAt: now.toISOString()
  }));
  const evidence: EvidenceApi = {
    createDelegation: created,
    async getDelegation() {
      return undefined;
    },
    async listDelegations() {
      return { items: [] };
    },
    async createRevocation(artifact) {
      return { id: artifact.id, artifact, createdAt: now.toISOString() };
    },
    async getRevocation() {
      return undefined;
    },
    async listEvents() {
      return { items: [] };
    }
  };
  const fixtureService: IdentityService = {
    ...service,
    async readTrustSnapshot() {
      return fixture.trust_snapshot as never;
    }
  };
  await withServer(
    async (base) => {
      const accepted = await fetch(`${base}/v1/delegations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          delegation,
          artifacts: valid.filter((artifact) => artifact.id !== delegation.id)
        })
      });
      assert.equal(accepted.status, 201, await accepted.text());
      assert.equal(created.mock.calls.length, 1);
      const tampered = {
        ...delegation,
        proof: { ...delegation.proof, sig: `A${delegation.proof.sig.slice(1)}` }
      };
      const rejected = await fetch(`${base}/v1/delegations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          delegation: tampered,
          artifacts: valid.filter((artifact) => artifact.id !== delegation.id)
        })
      });
      assert.equal(rejected.status, 400);
      assert.equal(created.mock.calls.length, 1);
    },
    { identityService: fixtureService, evidence, now: () => now }
  );
});

test('server uses strict raw parsing, JSON content types, redacted errors and reload throttling', async () => {
  await withServer(async (base) => {
    const wrongType = await fetch(`${base}/v1/identities`, { method: 'POST', body: '{}' });
    assert.equal(wrongType.status, 400);
    assert.equal(
      ((await wrongType.json()) as { error: { code: string } }).error.code,
      'INVALID_INPUT'
    );
    const duplicate = await fetch(`${base}/v1/identities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"subject":{},"subject":{}}'
    });
    assert.equal(duplicate.status, 400);
    assert.equal(
      ((await duplicate.json()) as { error: { code: string } }).error.code,
      'DUPLICATE_MEMBER'
    );
    const internal = await fetch(`${base}/v1/verifications/identity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{"credential":{}}'
    });
    assert.equal(internal.status, 500);
    assert.deepEqual(await internal.json(), {
      error: { code: 'INTERNAL', message: 'internal server error', details: [] },
      requestId: 'test-request'
    });
    for (let count = 0; count < 2; count += 1)
      assert.equal(
        (await fetch(`${base}/v1/trust-snapshots:reload`, { method: 'POST' })).status,
        403
      );
    assert.equal(
      (await fetch(`${base}/v1/trust-snapshots:reload`, { method: 'POST' })).status,
      429
    );
  });
});

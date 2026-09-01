import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createLocalApiServer, isLoopbackAddress } from '../src/index.js';
import { ServiceError, type IdentityService } from '@agent-proof/service';

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

async function withServer(run: (base: string) => Promise<void>): Promise<void> {
  const port = 46000 + Math.floor(Math.random() * 1000);
  const server = createLocalApiServer({
    service,
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

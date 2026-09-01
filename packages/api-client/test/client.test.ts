import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ApiClientError, LocalApiClient, type FetchLike } from '../src/index.js';

function response(status: number, payload: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return payload;
    }
  };
}

test('client uses loopback default, encodes requests, and passes idempotency keys', async () => {
  const requests: Array<{ url: string; init?: Parameters<FetchLike>[1] }> = [];
  const fetcher: FetchLike = async (url, init) => {
    requests.push({ url, init });
    return response(200, { items: [] });
  };
  const client = new LocalApiClient({ fetch: fetcher });
  await client.listAgents('cursor value', 5);
  assert.equal(requests[0]?.url, 'http://127.0.0.1:4318/v1/agents?cursor=cursor+value&limit=5');
  await client.createIdentity(
    {
      subject: { scheme: 'agid', version: 1, authority: 'example.test', path: ['agent'] },
      issuer: { type: 'service', id: 'issuer:one' },
      authorityCeiling: {
        capabilities: ['read'],
        resources: [{ type: 'opaque', value: 'x' }],
        tasks: ['018f28c8-4c1c-7000-8000-000000000001'],
        audiences: ['local.test'],
        not_before: '2026-09-01T00:00:00Z',
        expires_at: '2026-09-02T00:00:00Z',
        remaining_depth: 0
      }
    },
    'retry-key'
  );
  assert.equal(requests[1]?.init?.headers?.['idempotency-key'], 'retry-key');
});

test('client maps typed API failures to ApiClientError', async () => {
  const client = new LocalApiClient({
    fetch: async () =>
      response(404, {
        error: { code: 'IDENTITY_NOT_FOUND', message: 'missing', details: [] },
        requestId: 'req-1'
      })
  });
  await assert.rejects(
    () => client.getIdentity('missing'),
    (error: unknown) =>
      error instanceof ApiClientError &&
      error.status === 404 &&
      error.envelope.error.code === 'IDENTITY_NOT_FOUND'
  );
});

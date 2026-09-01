import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { verifyIdentityOffline } from '@agent-proof/service';
import { createConcreteLocalHost, createLocalHost } from '../src/index.js';

const request = {
  subject: {
    scheme: 'agid' as const,
    version: 1 as const,
    authority: 'example.test',
    path: ['agent']
  },
  issuer: { type: 'service' as const, id: 'local:issuer' },
  authorityCeiling: {
    capabilities: ['read'],
    resources: [{ type: 'opaque' as const, value: 'test' }],
    tasks: ['018f28c8-4c1c-7000-8000-000000000001'],
    audiences: ['local.test'],
    not_before: '2026-09-01T00:00:00Z',
    expires_at: '2099-01-01T00:00:00Z',
    remaining_depth: 0
  }
};

test('injected host composes and starts/stops the local listener', async () => {
  const port = 47000 + Math.floor(Math.random() * 1000);
  const host = createLocalHost({
    port,
    clock: { now: () => new Date('2026-09-01T00:00:00Z') },
    identities: {
      async create(record) {
        return record;
      },
      async get() {
        return undefined;
      },
      async list() {
        return { items: [] };
      }
    },
    issuer: {
      async issue() {
        throw new Error('not called');
      }
    },
    verifier: {
      async verify() {
        throw new Error('not called');
      }
    },
    trust: {
      async current() {
        return {
          snapshot_id: 'x',
          sequence: 1,
          issued_at: '2026-01-01T00:00:00Z',
          expires_at: '2099-01-01T00:00:00Z',
          policy_hash: 'hash'
        };
      },
      async reloadConfigured() {
        throw new Error('not called');
      }
    }
  });
  await host.start();
  try {
    assert.equal((await fetch(`http://127.0.0.1:${port}/v1/agents`)).status, 200);
  } finally {
    await host.stop();
  }
});

test('concrete host issues, persists public material, and verifies an identity end to end', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-proof-host-'));
  const port = 48000 + Math.floor(Math.random() * 1000);
  const host = await createConcreteLocalHost({
    keyDirectory: join(directory, 'keys'),
    keyPassphrase: Buffer.from('test passphrase'),
    storagePath: join(directory, 'state.sqlite'),
    port,
    clock: { now: () => new Date('2026-09-01T00:00:00Z') }
  });
  await host.start();
  try {
    const created = await fetch(`http://127.0.0.1:${port}/v1/identities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'restart-safe-key' },
      body: JSON.stringify(request)
    });
    assert.equal(created.status, 201);
    const identity = (await created.json()) as { id: string; credential: unknown };
    const verified = await fetch(`http://127.0.0.1:${port}/v1/verifications/identity`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(identity)
    });
    const apiDecision = await verified.json();
    assert.equal((apiDecision as { code: string }).code, 'VALID');
    const snapshot = (
      (await (await fetch(`http://127.0.0.1:${port}/v1/trust-anchors`)).json()) as {
        snapshot: never;
      }
    ).snapshot;
    assert.deepEqual(
      apiDecision,
      verifyIdentityOffline(
        identity.credential as never,
        snapshot as never,
        new Date('2026-09-01T00:00:00Z')
      )
    );
    const expired = {
      ...(identity.credential as Record<string, unknown>),
      expires_at: '2025-01-01T00:00:00Z'
    };
    const expiredApi = await (
      await fetch(`http://127.0.0.1:${port}/v1/verifications/identity`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ credential: expired })
      })
    ).json();
    assert.deepEqual(
      expiredApi,
      verifyIdentityOffline(expired as never, snapshot as never, new Date('2026-09-01T00:00:00Z'))
    );
    const tamperedPolicy = {
      ...(snapshot as Record<string, unknown>),
      policy_hash: 'urn:agent-proof:policy:v1:sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    };
    assert.equal(
      verifyIdentityOffline(
        identity.credential as never,
        tamperedPolicy as never,
        new Date('2026-09-01T00:00:00Z')
      ).code,
      'TRUST_SNAPSHOT_INVALID'
    );
    const identityId = identity.id;
    assert.ok(identityId);
    await host.close();
    const restarted = await createConcreteLocalHost({
      keyDirectory: join(directory, 'keys'),
      keyPassphrase: Buffer.from('test passphrase'),
      storagePath: join(directory, 'state.sqlite'),
      port,
      clock: { now: () => new Date('2026-09-01T00:00:00Z') }
    });
    await restarted.start();
    const fetched = await fetch(
      `http://127.0.0.1:${port}/v1/identities/${encodeURIComponent(identityId)}`
    );
    assert.equal(fetched.status, 200);
    const retried = await fetch(`http://127.0.0.1:${port}/v1/identities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': 'restart-safe-key' },
      body: JSON.stringify(request)
    });
    assert.equal(retried.status, 201);
    assert.equal(((await retried.json()) as { id: string }).id, identityId);
    await restarted.close();
    const bytes = await readFile(join(directory, 'state.sqlite'));
    assert.equal(
      bytes.includes(Buffer.from('"d"')),
      false,
      'SQLite must not contain private JWK material'
    );
  } finally {
    await host.close();
    await rm(directory, { recursive: true, force: true });
  }
});

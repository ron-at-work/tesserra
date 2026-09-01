import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  createSpiffeIdentityProvider,
  createSpiffeTrustProvider,
  jwtWorkloadIdentity,
  runtimeEvidenceFor,
  type WorkloadApiClient
} from '../src/index.js';

const x509 = {
  kind: 'x509' as const,
  spiffeId: 'spiffe://example.org/worker' as const,
  trustDomain: 'example.org',
  certificateChainPem: ['leaf'],
  privateKeyReference: 'opaque://key',
  expiresAt: new Date('2026-09-01T00:10:00Z')
};
const client: WorkloadApiClient = {
  fetchX509Svid: async () => x509,
  fetchJwtSvid: async (audience) => ({
    kind: 'jwt',
    spiffeId: x509.spiffeId,
    trustDomain: x509.trustDomain,
    token: 'validated-by-spiffe-client',
    audience,
    expiresAt: x509.expiresAt
  }),
  fetchBundles: async () => [
    { trustDomain: 'example.org', bundlePem: 'bundle' },
    { trustDomain: 'other.org', bundlePem: 'other' }
  ]
};
test('maps a configured X.509-SVID to a separate workload principal', async () => {
  const identity = await createSpiffeIdentityProvider(client, ['example.org']).workloadIdentity();
  assert.deepEqual(identity.principal, { type: 'workload', id: 'spiffe://example.org/worker' });
  assert.equal(identity.channelIdentity, 'x509-svid');
  assert.deepEqual(runtimeEvidenceFor(identity), {
    kind: 'spiffe-runtime-evidence/v1',
    spiffeId: 'spiffe://example.org/worker',
    trustDomain: 'example.org',
    svidKind: 'x509',
    expiresAt: '2026-09-01T00:10:00.000Z'
  });
});
test('requires JWT-SVID audience and filters configured trust bundles', async () => {
  await assert.rejects(jwtWorkloadIdentity(client, ['example.org'], []));
  const identity = await jwtWorkloadIdentity(client, ['example.org'], ['api.example.org']);
  assert.equal(identity.channelIdentity, 'jwt-svid');
  assert.deepEqual(await createSpiffeTrustProvider(client, ['example.org']).bundles(), [
    { trustDomain: 'example.org', bundlePem: 'bundle' }
  ]);
});
test('rejects unconfigured trust domains', async () => {
  await assert.rejects(
    createSpiffeIdentityProvider(client, ['other.org']).workloadIdentity(),
    /not configured/
  );
});

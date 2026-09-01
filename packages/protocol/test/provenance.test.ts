import assert from 'node:assert/strict';
import { test } from 'vitest';
import { validateArtifact } from '../src/index.js';

const digest = 'sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const artifactId = 'urn:agent-proof:v1:sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const keyId = 'urn:agent-proof:kid:v1:sha256:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const reference = { id: artifactId, kind: 'request' } as const;

test('accepts the frozen provenance evidence schema', () => {
  const provenance = {
    version: 'agent-proof/v1',
    kind: 'provenance',
    id: artifactId,
    issued_at: '2026-09-01T00:00:00Z',
    proof: { alg: 'Ed25519', kid: keyId, sig: 'A'.repeat(86) },
    authority_refs: [{ ...reference, kind: 'delegation' }],
    request_ref: reference,
    predicate_type: 'https://agent-proof.invalid/spec/v1/provenance',
    subject: { name: 'result', digest },
    predicate: {
      task: '0198e1f8-0000-7000-8000-000000000001',
      action: 'invoice.read',
      resource: { type: 'opaque', value: 'unit-test' },
      audience: 'api.example.invalid',
      input_digests: [digest],
      output_digests: [digest],
      result: 'verified'
    },
    predecessor_refs: []
  };
  assert.equal(validateArtifact(provenance), true);
  assert.equal(validateArtifact({ ...provenance, predecessor_refs: [reference] }), false);
  assert.equal(
    validateArtifact({
      ...provenance,
      kind: 'request',
      delegation_ref: { id: artifactId, kind: 'credential' }
    }),
    false
  );
});

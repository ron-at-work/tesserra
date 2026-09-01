import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  A2A_PROOF_BINDING_VERSION,
  A2A_PROOF_EXTENSION_URI,
  a2aProofExtension,
  a2aTaskDigests,
  supportsA2aProof,
  verifyA2aMessage,
  withA2aProof
} from '../src/index.js';
import type { A2aTaskContext } from '../src/index.js';

const context: A2aTaskContext = {
  taskId: 'a2a-task-1',
  message: { text: 'read invoice' },
  audience: 'api.example.invalid',
  resource: { type: 'uri', value: 'https://api.example.invalid/v1/finance/invoices/2026-09' },
  action: 'invoice.read',
  task: '0198e1f8-0000-7000-8000-000000000001',
  expectedSigner: {
    type: 'agent',
    id: { scheme: 'agid', version: 1, authority: 'example.invalid', path: ['finance', 'worker'] }
  }
};
const options = {
  trustSnapshot: {},
  now: new Date('2026-09-01T00:02:00Z'),
  replayMode: 'online' as const
};
test('negotiates only the explicit A2A proof extension', () => {
  assert.equal(supportsA2aProof({ supportedExtensions: [a2aProofExtension()] }), true);
  assert.equal(supportsA2aProof({ supportedExtensions: [] }), false);
});
test('distinguishes missing and stripped A2A proof extensions', () => {
  assert.deepEqual(verifyA2aMessage({}, context, options), { status: 'missing' });
  assert.deepEqual(verifyA2aMessage({ extensions: {} }, context, options), { status: 'stripped' });
});
test('binds exact task messages and denies invalid proof evidence', () => {
  const message = withA2aProof<{ readonly extensions?: Readonly<Record<string, unknown>> }>(
    {},
    { version: A2A_PROOF_BINDING_VERSION, artifacts: [] }
  );
  assert.equal(typeof message.extensions?.[A2A_PROOF_EXTENSION_URI], 'string');
  assert.notEqual(
    a2aTaskDigests(context).payloadDigest,
    a2aTaskDigests({ ...context, message: { text: 'changed' } }).payloadDigest
  );
  assert.equal(verifyA2aMessage(message, context, options).status, 'denied');
});

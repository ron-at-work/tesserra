import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  apiBasePath,
  apiVersion,
  isErrorEnvelope,
  parseApiJson,
  routes,
  StrictJsonError
} from '../src/index.js';
import { openApiDocument } from '../src/openapi.js';

test('contract exports versioned route and OpenAPI definitions', () => {
  assert.equal(apiVersion, 'v1');
  assert.equal(apiBasePath, '/v1');
  assert.equal(routes.createIdentity, 'POST /v1/identities');
  assert.ok(openApiDocument.paths['/v1/verifications/identity']);
  assert.ok(openApiDocument.paths['/v1/delegations']);
  assert.ok(openApiDocument.paths['/v1/verifications/request']);
  assert.ok(openApiDocument.paths['/v1/revocations']);
  assert.ok(openApiDocument.paths['/v1/events']);
  assert.ok(openApiDocument.paths['/v1/trust-snapshots:reload']);
  assert.equal(
    isErrorEnvelope({ error: { code: 'X', message: 'x', details: [] }, requestId: 'request' }),
    true
  );
  assert.equal(isErrorEnvelope({ error: {} }), false);
  assert.deepEqual(parseApiJson(Buffer.from('{"ok":true}')), { ok: true });
  assert.throws(
    () => parseApiJson(Buffer.from('{"x":1,"x":2}')),
    (error: unknown) => error instanceof StrictJsonError && error.code === 'DUPLICATE_MEMBER'
  );
});

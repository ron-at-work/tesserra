import assert from 'node:assert/strict';
import { test } from 'vitest';
import {
  canonicalize,
  decodeBase64Url,
  keyIdFor,
  parseStrictJson,
  sha256DigestFor
} from '../src/index.js';

test('RFC 8785 canonicalization orders object members', () => {
  assert.equal(canonicalize({ z: [true, 'x'], a: 1 }), '{"a":1,"z":[true,"x"]}');
});
test('strict parser rejects duplicate members', () => {
  assert.throws(() => parseStrictJson(new TextEncoder().encode('{"a":1,"a":2}')), /Duplicate/);
});
test('strict base64url rejects noncanonical trailing bits', () => {
  assert.throws(() => decodeBase64Url('AB'));
});
test('key identifiers use frozen public JWK preimages', () => {
  assert.equal(
    keyIdFor({ kty: 'OKP', crv: 'Ed25519', x: 'rkZEP2c-WyDmfpqJVWSoRNoqBJUzUJSKi2Drd0fSD_w' }),
    'urn:agent-proof:kid:v1:sha256:ZBX6j1I82CWRmCIG2Czu3Uvr5Ju33qrnRqU7Zwm5OOs'
  );
});
test('request digest helper returns the real SHA-256 digest', () => {
  assert.equal(
    sha256DigestFor(new TextEncoder().encode('abc')),
    'sha256:ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0'
  );
});
test('canonicalization rejects unpaired surrogate object keys', () => {
  const object = JSON.parse('{"\\ud800":"value"}') as Record<string, string>;
  assert.throws(() => canonicalize(object), /Unpaired surrogate/);
});
test('strict parser rejects unpaired surrogate object keys and unsafe integers', () => {
  assert.throws(() => parseStrictJson(new TextEncoder().encode('{"\\ud800":1}')));
  assert.throws(() => parseStrictJson(new TextEncoder().encode('9007199254740992')), /I-JSON/);
});

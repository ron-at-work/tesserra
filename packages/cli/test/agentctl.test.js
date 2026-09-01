import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'vitest';

const cli = resolve(import.meta.dirname, '../dist/src/agentctl.js');
function invoke(home, args, environment = {}) {
  return spawnSync(process.execPath, [cli, '--home', home, ...args], {
    encoding: 'utf8',
    env: { ...process.env, AGENTCTL_PASSPHRASE: 'correct horse battery staple', ...environment }
  });
}

test('development fixture issuance is explicit and never establishes trust automatically', () => {
  const home = mkdtempSync(join(tmpdir(), 'agentctl-'));
  try {
    assert.equal(invoke(home, ['init', '--product-name', 'Fixture Console', '--json']).status, 0);
    const production = invoke(home, [
      'identity',
      'create',
      '--agent',
      'agid:v1:example.com/fixture-agent'
    ]);
    assert.equal(production.status, 2);
    assert.match(production.stderr, /configured local API issuer/);
    const created = invoke(home, [
      'identity',
      'create',
      '--agent',
      'agid:v1:example.com/fixture-agent',
      '--dev-self-issue',
      '--expires-in',
      '2h',
      '--json'
    ]);
    assert.equal(created.status, 0);
    const payload = JSON.parse(created.stdout);
    assert.match(payload.credential.id, /^urn:agent-proof:v1:sha256:/);
    assert.equal(JSON.stringify(payload).includes('correct horse'), false);
    assert.equal(invoke(home, ['trust', 'list', '--json']).stdout, '{"trustAnchors":[]}\n');
    const trusted = invoke(home, [
      'trust',
      'add',
      '--identity',
      payload.credential.id,
      '--dev-self-issue',
      '--json'
    ]);
    assert.equal(trusted.status, 0);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('duration, identity path, and premature rotation failures are actionable', () => {
  const home = mkdtempSync(join(tmpdir(), 'agentctl-'));
  try {
    invoke(home, ['init']);
    const duration = invoke(home, [
      'identity',
      'create',
      '--agent',
      'agid:v1:example.com/fixture-agent',
      '--dev-self-issue',
      '--expires-in',
      '2months'
    ]);
    assert.equal(duration.status, 2);
    assert.match(duration.stderr, /whole number followed by s, m, h, d, or w/);
    const invalidPath = invoke(home, [
      'identity',
      'create',
      '--agent',
      'agid:v1:example.com/../escape',
      '--dev-self-issue'
    ]);
    assert.equal(invalidPath.status, 2);
    assert.match(invalidPath.stderr, /invalid authority or path segment/i);
    const rotate = invoke(home, [
      'identity',
      'rotate',
      '--id',
      'urn:agent-proof:v1:sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
    ]);
    assert.equal(rotate.status, 2);
    assert.match(rotate.stderr, /Phase 4 lifecycle contract/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

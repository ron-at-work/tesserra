import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

test('delegation, request, lifecycle, revocation, and provenance commands complete the local flow', () => {
  const home = mkdtempSync(join(tmpdir(), 'agentctl-flow-'));
  try {
    assert.equal(invoke(home, ['init']).status, 0);
    const parent = JSON.parse(
      invoke(home, [
        'identity',
        'create',
        '--agent',
        'agid:v1:example.com/parent',
        '--dev-self-issue',
        '--depth',
        '1',
        '--capability',
        'files.read',
        '--resource',
        'https://example.invalid/files/1',
        '--json'
      ]).stdout
    );
    // The delegate uses the explicitly trusted parent identity. A separately
    // self-issued identity is intentionally not trusted by this local policy.
    const delegateIdentity = parent;
    assert.equal(
      invoke(home, ['trust', 'add', '--identity', parent.credential.id, '--dev-self-issue']).status,
      0
    );
    const delegation = JSON.parse(
      invoke(home, [
        'delegate',
        'create',
        '--identity',
        parent.credential.id,
        '--delegate',
        'agid:v1:example.com/parent',
        '--capability',
        'files.read',
        '--resource',
        'https://example.invalid/files/1',
        '--json'
      ]).stdout
    ).delegation;
    assert.equal(invoke(home, ['delegate', 'inspect', '--id', delegation.id]).status, 0);
    const delegationDecision = JSON.parse(
      invoke(home, ['delegate', 'verify', '--id', delegation.id, '--json']).stdout
    );
    assert.equal(delegationDecision.code, 'VALID');
    const artifactPath = join(home, 'artifacts', `${delegation.id.slice(-43)}.json`);
    const tamperedText = readFileSync(artifactPath, 'utf8').replace('"sig":"', '"sig":"A');
    writeFileSync(artifactPath, tamperedText);
    const tamperedDecision = JSON.parse(
      invoke(home, ['delegate', 'verify', '--id', delegation.id, '--json']).stdout
    );
    assert.ok(['ID_MISMATCH', 'SCHEMA_INVALID'].includes(tamperedDecision.code));
    writeFileSync(artifactPath, JSON.stringify(delegation));
    const signed = invoke(home, [
      'request',
      'sign',
      '--identity',
      delegateIdentity.credential.id,
      '--delegation',
      delegation.id,
      '--action',
      'files.read',
      '--resource',
      'https://example.invalid/files/1',
      '--json'
    ]);
    assert.equal(signed.status, 0, signed.stderr);
    const request = JSON.parse(signed.stdout).request;
    const decision = JSON.parse(
      invoke(home, ['request', 'verify', '--id', request.id, '--json']).stdout
    );
    assert.equal(decision.code, 'VALID');
    const rotation = invoke(home, [
      'identity',
      'rotate',
      '--id',
      delegateIdentity.credential.id,
      '--json'
    ]);
    assert.equal(rotation.status, 2);
    assert.match(rotation.stderr, /identity rotate is disabled/);
    const revoked = invoke(home, [
      'revoke',
      '--identity',
      parent.credential.id,
      '--type',
      'delegation',
      '--target',
      delegation.id,
      '--json'
    ]);
    assert.equal(revoked.status, 2);
    assert.match(revoked.stderr, /STATUS_AUTHORITY_REQUIRED/);
    assert.equal(
      JSON.parse(invoke(home, ['revoked', '--target', delegation.id, '--json']).stdout).revoked,
      false
    );
    const exported = join(home, 'provenance.json');
    assert.equal(invoke(home, ['provenance', 'inspect', '--json']).status, 0);
    assert.equal(invoke(home, ['provenance', 'export', '--output', exported, '--json']).status, 0);
    assert.equal(existsSync(exported), true);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('untrusted local identities and lifecycle/status operations fail closed', () => {
  const home = mkdtempSync(join(tmpdir(), 'agentctl-closed-'));
  try {
    invoke(home, ['init']);
    const untrusted = JSON.parse(
      invoke(home, [
        'identity',
        'create',
        '--agent',
        'agid:v1:example.com/untrusted',
        '--dev-self-issue',
        '--depth',
        '1',
        '--json'
      ]).stdout
    );
    const rotation = invoke(home, ['identity', 'rotate', '--id', untrusted.credential.id]);
    assert.equal(rotation.status, 2);
    assert.match(rotation.stderr, /identity rotate is disabled/);
    const revoke = invoke(home, [
      'revoke',
      '--identity',
      untrusted.credential.id,
      '--type',
      'credential',
      '--target',
      untrusted.credential.id
    ]);
    assert.equal(revoke.status, 2);
    assert.match(revoke.stderr, /separately configured status authority/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

test('duration and identity path failures are actionable', () => {
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
    assert.match(rotate.stderr, /was not found/);
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
});

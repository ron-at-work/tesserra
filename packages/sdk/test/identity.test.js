import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { test } from 'vitest';
import { policyHashFor } from '@agent-proof/protocol';
import {
  formatAgentId,
  hasCapability,
  isAuthorizedForResource,
  parseAgentId,
  verifyIdentity
} from '../dist/src/index.js';

const cli = resolve(import.meta.dirname, '../../cli/dist/src/agentctl.js');

function fixture() {
  const home = mkdtempSync(join(tmpdir(), 'agent-proof-sdk-'));
  try {
    const environment = { ...process.env, AGENTCTL_PASSPHRASE: 'test passphrase' };
    execFileSync(process.execPath, [cli, '--home', home, 'init'], { env: environment });
    return JSON.parse(
      execFileSync(
        process.execPath,
        [
          cli,
          '--home',
          home,
          'identity',
          'create',
          '--agent',
          'agid:v1:example.com/fixture-agent',
          '--dev-self-issue',
          '--expires-in',
          '1d',
          '--json'
        ],
        { env: environment }
      )
    );
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

function trustSnapshot(created) {
  const snapshot = {
    snapshot_id: 'fixture-policy',
    sequence: 1,
    issued_at: created.credential.issued_at,
    expires_at: created.credential.expires_at,
    policy_hash: '',
    max_clock_skew_seconds: 0,
    max_lifetime_seconds: 86400,
    max_chain_depth: 0,
    replay_policy: 'offline-inspection-only',
    issuer_authorities: [created.issuerAuthority],
    status_publishers: [],
    roots: [
      {
        issuer: created.credential.issuer,
        root_subject: created.credential.subject,
        credential_purpose: 'agent-root-authority'
      }
    ],
    status_high_water: [],
    archival_policy: {
      historical_verification: 'explicit-snapshot-only',
      minimum_retention_seconds: 1
    }
  };
  snapshot.policy_hash = policyHashFor(snapshot);
  return snapshot;
}

test('Agent ID helpers preserve the structured protocol value', () => {
  const agent = parseAgentId('agid:v1:example.com/release/bot');
  assert.deepEqual(agent, {
    scheme: 'agid',
    version: 1,
    authority: 'example.com',
    path: ['release', 'bot']
  });
  assert.equal(formatAgentId(agent), 'agid:v1:example.com/release/bot');
  assert.throws(() => parseAgentId('agid:v1:Example.com/bot'), /invalid/i);
});

test('capability and resource helpers use exact matching semantics', () => {
  const constraints = {
    capabilities: ['files.read'],
    resources: [{ type: 'uri', value: 'https://example.test/files/1' }]
  };
  assert.equal(hasCapability(constraints, 'files.read'), true);
  assert.equal(hasCapability(constraints, 'files.*'), false);
  assert.equal(
    isAuthorizedForResource(constraints, { type: 'uri', value: 'https://example.test/files/1' }),
    true
  );
  assert.equal(
    isAuthorizedForResource(constraints, { type: 'uri', value: 'https://example.test/files/2' }),
    false
  );
});

test('verifyIdentity delegates a generated identity to the core verifier', () => {
  const created = fixture();
  const outcome = verifyIdentity({
    credential: created.credential,
    trustSnapshot: trustSnapshot(created),
    now: created.credential.issued_at
  });
  assert.equal(outcome.code, 'VALID');
  assert.equal(outcome.valid, true);
  assert.deepEqual(outcome.warnings, ['OFFLINE_STATUS_NOT_FRESH', 'OFFLINE_REPLAY_NOT_CHECKED']);
});

test('verifyIdentity rejects malformed bytes, changed proofs, and expiry', () => {
  const created = fixture();
  const snapshot = trustSnapshot(created);
  assert.equal(
    verifyIdentity({ credential: '{', trustSnapshot: snapshot, now: created.credential.issued_at })
      .code,
    'MALFORMED_JSON'
  );
  const modified = structuredClone(created.credential);
  modified.proof.sig = `${modified.proof.sig[0] === 'A' ? 'B' : 'A'}${modified.proof.sig.slice(1)}`;
  assert.equal(
    verifyIdentity({
      credential: modified,
      trustSnapshot: snapshot,
      now: created.credential.issued_at
    }).code,
    'INVALID_SIGNATURE'
  );
  assert.equal(
    verifyIdentity({
      credential: created.credential,
      trustSnapshot: snapshot,
      now: '2099-01-01T00:00:00Z'
    }).code,
    'EXPIRED'
  );
  assert.throws(
    () =>
      verifyIdentity({
        credential: created.credential,
        trustSnapshot: snapshot,
        now: '2026-02-30T00:00:00Z'
      }),
    /RFC 3339/
  );
});

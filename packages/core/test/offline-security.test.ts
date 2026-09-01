import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { test } from 'vitest';
import type { VerificationInput } from '../src/index.js';
import { verifyArtifacts } from '../src/index.js';

const cases = join(cwd(), '../../tests/conformance/v1/cases');

interface Fixture {
  artifacts: VerificationInput['artifacts'];
  trust_snapshot: VerificationInput['trustSnapshot'];
  verification_context: {
    audience: string;
    action: string;
    resource: VerificationInput['context']['resource'];
    task: string;
    expected_signer: VerificationInput['context']['expectedSigner'];
    expected_payload_digest: string;
    expected_task_context_digest: string;
    replay_required: boolean;
  };
  verifier_now: string;
  replay_mode: VerificationInput['replayMode'];
}
async function fixture(name: string): Promise<Fixture> {
  return JSON.parse(await readFile(join(cases, name), 'utf8')) as Fixture;
}
function input(value: Fixture): VerificationInput {
  const context = value.verification_context;
  return {
    artifacts: value.artifacts,
    trustSnapshot: value.trust_snapshot,
    context: {
      audience: context.audience,
      action: context.action,
      resource: context.resource,
      task: context.task,
      expectedSigner: context.expected_signer,
      expectedPayloadDigest: context.expected_payload_digest,
      expectedTaskContextDigest: context.expected_task_context_digest,
      replayRequired: context.replay_required
    },
    now: new Date(value.verifier_now),
    replayMode: value.replay_mode
  };
}

test('offline inspection executes binding checks after status', async () => {
  const offline = await fixture('offline-inspection.json');
  const base = input(offline);
  assert.equal(verifyArtifacts(base).code, 'VALID');
  assert.equal(
    verifyArtifacts({ ...base, context: { ...base.context, audience: 'other.example.invalid' } })
      .code,
    'AUDIENCE_MISMATCH'
  );
  assert.equal(
    verifyArtifacts({ ...base, context: { ...base.context, action: 'invoice.write' } }).code,
    'ACTION_NOT_ALLOWED'
  );
  assert.equal(
    verifyArtifacts({
      ...base,
      context: { ...base.context, resource: { type: 'opaque', value: 'other' } }
    }).code,
    'RESOURCE_NOT_ALLOWED'
  );
  assert.equal(
    verifyArtifacts({
      ...base,
      context: { ...base.context, task: '0198e1f8-0000-7000-8000-000000000099' }
    }).code,
    'TASK_NOT_ALLOWED'
  );
});

test('offline inspection rejects an effective delegation revocation', async () => {
  const value = await fixture('offline-revoked-delegation.json');
  assert.equal(verifyArtifacts(input(value)).code, 'REVOKED');
});

test('rejects an overlapping issuer and status-publisher key role', async () => {
  const offline = await fixture('offline-inspection.json');
  const value = structuredClone(offline);
  const snapshot = value.trust_snapshot as unknown as {
    status_publishers: Array<{ key_id: string }>;
    issuer_authorities: Array<{ key_id: string }>;
  };
  snapshot.status_publishers[0]!.key_id = snapshot.issuer_authorities[0]!.key_id;
  assert.equal(verifyArtifacts(input(value)).code, 'TRUST_SNAPSHOT_INVALID');
});

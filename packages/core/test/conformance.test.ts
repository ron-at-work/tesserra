import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { test } from 'vitest';
import { verifyArtifacts } from '../src/index.js';

const cases = join(cwd(), '../../tests/conformance/v1/cases');
test('all complete conformance cases reproduce the frozen full result', async () => {
  const filenames = await readdir(cases);
  assert.equal(
    filenames.length,
    42,
    'fixture count changed: update this assertion with the manifest'
  );
  for (const filename of filenames) {
    const fixture = JSON.parse(await readFile(join(cases, filename), 'utf8'));
    const context = fixture.verification_context;
    const input = {
      artifacts: fixture.artifacts,
      trustSnapshot: fixture.trust_snapshot,
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
      now: new Date(fixture.verifier_now),
      replayMode: fixture.replay_mode,
      ...(fixture.archived_snapshot === undefined
        ? {}
        : { archivedSnapshot: fixture.archived_snapshot })
    };
    const result = verifyArtifacts(
      filename === 'replay-duplicate.json' ? { ...input, replay: 'duplicate' } : input
    );
    assert.deepEqual(result, fixture.expected_result, filename);
  }
});

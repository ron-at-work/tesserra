import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { test } from 'vitest';
import { verifyDelegationChain } from '../src/index.js';

const cases = join(cwd(), '../../tests/conformance/v1/cases');

async function chainInput(name: string) {
  const fixture = JSON.parse(await readFile(join(cases, `${name}.json`), 'utf8'));
  const artifacts = fixture.artifacts;
  return {
    rootCredential: artifacts.find(
      (artifact: { kind: string; credential_purpose?: string }) =>
        artifact.kind === 'credential' && artifact.credential_purpose === 'agent-root-authority'
    ),
    keyBindingCredentials: artifacts.filter(
      (artifact: { kind: string; credential_purpose?: string }) =>
        artifact.kind === 'credential' && artifact.credential_purpose === 'agent-key-binding'
    ),
    delegations: artifacts.filter((artifact: { kind: string }) => artifact.kind === 'delegation'),
    statusEvidence: artifacts.filter((artifact: { kind: string }) =>
      ['key_status', 'revocation', 'key_rotation'].includes(artifact.kind)
    ),
    trustSnapshot: fixture.trust_snapshot,
    now: new Date(fixture.verifier_now)
  };
}

test('verifies valid root/key-binding/delegation authority evidence without a request', async () => {
  assert.equal((await chainInput('positive-two-hop')).delegations.length, 2);
  assert.equal(verifyDelegationChain(await chainInput('positive-two-hop')).code, 'VALID');
});

test('uses closed chain-stage results for tampering, escalation, linkage, time, and revocation', async () => {
  const valid = await chainInput('positive-two-hop');
  const tampered = structuredClone(valid);
  tampered.delegations[0].proof.sig = `A${tampered.delegations[0].proof.sig.slice(1)}`;
  assert.equal(verifyDelegationChain(tampered).code, 'INVALID_SIGNATURE');
  assert.equal(
    verifyDelegationChain(await chainInput('attenuation')).code,
    'ATTENUATION_VIOLATION'
  );
  assert.equal(
    verifyDelegationChain(await chainInput('chain-parent-missing')).code,
    'CHAIN_PARENT_MISSING'
  );
  const expired = structuredClone(valid);
  expired.now = new Date('2026-09-02T00:00:00Z');
  assert.equal(verifyDelegationChain(expired).code, 'EXPIRED');
  assert.equal(verifyDelegationChain(await chainInput('revoked')).code, 'REVOKED');
});

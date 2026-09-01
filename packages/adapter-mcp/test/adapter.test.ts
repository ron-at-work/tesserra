import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { test } from 'vitest';
import {
  artifactIdFor,
  keyIdFor,
  policyHashFor,
  semanticDigestFor,
  signingInputFor
} from '@agent-proof/protocol';
import { CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import {
  MCP_PROOF_BINDING_VERSION,
  MCP_PROOF_METADATA_KEY,
  encodeMcpProof,
  mcpToolCallDigests,
  verifyMcpToolCall,
  withMcpProof
} from '../src/index.js';
import type { ArtifactBase, JsonObject, PublicJwk } from '@agent-proof/protocol';
import type { McpToolCallContext } from '../src/index.js';

const context: McpToolCallContext = {
  toolName: 'invoice.read',
  arguments: { invoice: '2026-09' },
  audience: 'api.example.invalid',
  resource: { type: 'uri', value: 'https://api.example.invalid/v1/finance/invoices/2026-09' },
  task: '0198e1f8-0000-7000-8000-000000000001',
  expectedSigner: {
    type: 'agent',
    id: { scheme: 'agid', version: 1, authority: 'example.invalid', path: ['finance', 'worker'] }
  }
};
const now = new Date('2026-09-01T00:02:00Z');

type Signer = ReturnType<typeof generateKeyPairSync> & {
  readonly publicJwk: PublicJwk;
  readonly keyId: string;
};
function signer(): Signer {
  const pair = generateKeyPairSync('ed25519');
  const publicJwk = pair.publicKey.export({ format: 'jwk' }) as PublicJwk;
  return { ...pair, publicJwk, keyId: keyIdFor(publicJwk) };
}
function signed(
  signerKey: Signer,
  value: Omit<ArtifactBase, 'id' | 'proof'> & JsonObject
): ArtifactBase {
  const identified = {
    ...value,
    id: '',
    proof: { alg: 'Ed25519', kid: signerKey.keyId, sig: '' }
  } as ArtifactBase;
  const artifact = { ...identified, id: artifactIdFor(identified) };
  return {
    ...artifact,
    proof: {
      ...artifact.proof,
      sig: sign(null, signingInputFor(artifact), signerKey.privateKey).toString('base64url')
    }
  };
}
function validCarrier(callContext: McpToolCallContext) {
  const issuer = signer();
  const rootSigner = signer();
  const workerSigner = signer();
  const status = signer();
  const issuedAt = '2026-09-01T00:00:00Z';
  const rootPrincipal = {
    type: 'agent' as const,
    id: {
      scheme: 'agid' as const,
      version: 1 as const,
      authority: 'example.invalid',
      path: ['finance', 'controller']
    }
  };
  const rootConstraints = {
    capabilities: [callContext.toolName],
    resources: [callContext.resource],
    tasks: [callContext.task],
    audiences: [callContext.audience],
    not_before: issuedAt,
    expires_at: '2026-09-01T00:10:00Z',
    remaining_depth: 1
  };
  const workerConstraints = {
    ...rootConstraints,
    expires_at: '2026-09-01T00:03:00Z',
    remaining_depth: 0
  };
  const rootCredential = signed(issuer, {
    version: 'agent-proof/v1',
    kind: 'credential',
    issued_at: issuedAt,
    issuer: { type: 'service', id: 'example.invalid:issuer' },
    subject: rootPrincipal,
    public_jwk: rootSigner.publicJwk,
    key_id: rootSigner.keyId,
    not_before: issuedAt,
    expires_at: '2026-09-01T00:10:00Z',
    credential_purpose: 'agent-root-authority',
    authority_ceiling: rootConstraints
  } as unknown as Omit<ArtifactBase, 'id' | 'proof'> & JsonObject);
  const workerCredential = signed(issuer, {
    version: 'agent-proof/v1',
    kind: 'credential',
    issued_at: issuedAt,
    issuer: { type: 'service', id: 'example.invalid:issuer' },
    subject: callContext.expectedSigner,
    public_jwk: workerSigner.publicJwk,
    key_id: workerSigner.keyId,
    not_before: issuedAt,
    expires_at: '2026-09-01T00:03:00Z',
    credential_purpose: 'agent-key-binding',
    authority_ceiling: workerConstraints
  } as unknown as Omit<ArtifactBase, 'id' | 'proof'> & JsonObject);
  const delegation = signed(rootSigner, {
    version: 'agent-proof/v1',
    kind: 'delegation',
    issued_at: '2026-09-01T00:01:00Z',
    delegator: rootPrincipal,
    delegate: callContext.expectedSigner,
    parent_ref: { id: rootCredential.id, kind: 'credential' },
    constraints: workerConstraints
  } as unknown as Omit<ArtifactBase, 'id' | 'proof'> & JsonObject);
  const statusRecordFor = (keyId: string) =>
    signed(status, {
      version: 'agent-proof/v1',
      kind: 'key_status',
      issued_at: issuedAt,
      publisher: { type: 'service', id: 'example.invalid:status' },
      target_key_id: keyId,
      state: 'active',
      effective_at: issuedAt,
      as_of: issuedAt,
      valid_until: '2026-09-01T00:10:00Z',
      sequence: 1,
      previous_digest: null
    } as unknown as Omit<ArtifactBase, 'id' | 'proof'> & JsonObject);
  const issuerStatus = statusRecordFor(issuer.keyId);
  const rootStatus = statusRecordFor(rootSigner.keyId);
  const workerStatus = statusRecordFor(workerSigner.keyId);
  const digests = mcpToolCallDigests(callContext);
  const request = signed(workerSigner, {
    version: 'agent-proof/v1',
    kind: 'request',
    issued_at: '2026-09-01T00:01:00Z',
    signer: callContext.expectedSigner,
    delegation_ref: { id: delegation.id, kind: 'delegation' },
    request_id: '0198e1f8-0000-7000-8000-000000000002',
    nonce: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    not_before: '2026-09-01T00:01:00Z',
    expires_at: '2026-09-01T00:03:00Z',
    action: callContext.toolName,
    resource: callContext.resource,
    task: callContext.task,
    audience: callContext.audience,
    payload_digest: digests.payloadDigest,
    task_context_digest: digests.taskContextDigest
  } as unknown as Omit<ArtifactBase, 'id' | 'proof'> & JsonObject);
  const statusRecords = [issuerStatus, rootStatus, workerStatus];
  const snapshot = {
    snapshot_id: 'mcp-test',
    sequence: 1,
    issued_at: issuedAt,
    expires_at: '2026-09-01T00:10:00Z',
    max_clock_skew_seconds: 0,
    max_chain_depth: 1,
    replay_policy: 'online-required',
    issuer_authorities: [
      {
        principal: { type: 'service', id: 'example.invalid:issuer' },
        key_id: issuer.keyId,
        public_jwk: issuer.publicJwk
      }
    ],
    status_publishers: [
      {
        principal: { type: 'service', id: 'example.invalid:status' },
        key_id: status.keyId,
        public_jwk: status.publicJwk
      }
    ],
    roots: [
      {
        issuer: { type: 'service', id: 'example.invalid:issuer' },
        root_subject: rootPrincipal,
        credential_purpose: 'agent-root-authority'
      }
    ],
    status_high_water: statusRecords.map((record) => ({
      publisher: { type: 'service', id: 'example.invalid:status' },
      target_key_id: record['target_key_id'] as string,
      sequence: 1,
      semantic_digest: semanticDigestFor(record)
    })),
    policy_hash: ''
  } as unknown as JsonObject;
  const trustSnapshot = { ...snapshot, policy_hash: policyHashFor(snapshot) };
  return {
    carrier: {
      version: MCP_PROOF_BINDING_VERSION,
      artifacts: [rootCredential, workerCredential, delegation, request, ...statusRecords]
    },
    trustSnapshot
  };
}
test('uses the pinned MCP SDK to preserve the project-defined metadata extension', () => {
  const message = withMcpProof(
    { _meta: { existing: true } as Record<string, unknown> },
    { version: MCP_PROOF_BINDING_VERSION, artifacts: [] }
  );
  const request = CallToolRequestSchema.parse({
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: { name: context.toolName, arguments: context.arguments, _meta: message._meta }
  });
  assert.equal(typeof request.params._meta?.[MCP_PROOF_METADATA_KEY], 'string');
});
test('verifies a valid MCP proof with the shared core verifier', () => {
  const { carrier, trustSnapshot } = validCarrier(context);
  const result = verifyMcpToolCall(withMcpProof({}, carrier), context, {
    trustSnapshot,
    now,
    replayMode: 'online'
  });
  assert.equal(result.status, 'verified', JSON.stringify(result));
});
test('makes missing and stripped MCP proof propagation distinct', () => {
  const options = { trustSnapshot: {}, now, replayMode: 'online' as const };
  assert.deepEqual(verifyMcpToolCall({}, context, options), { status: 'missing' });
  assert.deepEqual(verifyMcpToolCall({ _meta: {} }, context, options), { status: 'stripped' });
});
test('rejects tampered, oversized, capability, and resource-mismatched evidence', () => {
  const { carrier, trustSnapshot } = validCarrier(context);
  const tampered = {
    ...carrier,
    artifacts: carrier.artifacts.map((artifact) =>
      artifact.kind === 'request' ? { ...artifact, audience: 'other.example.invalid' } : artifact
    )
  };
  assert.equal(
    verifyMcpToolCall(withMcpProof({}, tampered), context, {
      trustSnapshot,
      now,
      replayMode: 'online'
    }).status,
    'denied'
  );
  assert.equal(
    verifyMcpToolCall(
      withMcpProof({}, carrier),
      { ...context, toolName: 'invoice.write' },
      { trustSnapshot, now, replayMode: 'online' }
    ).status,
    'denied'
  );
  assert.equal(
    verifyMcpToolCall(
      withMcpProof({}, carrier),
      {
        ...context,
        resource: { type: 'uri', value: 'https://api.example.invalid/v1/finance/invoices/2026-10' }
      },
      { trustSnapshot, now, replayMode: 'online' }
    ).status,
    'denied'
  );
  const encoded = encodeMcpProof(carrier);
  assert.deepEqual(
    verifyMcpToolCall({ _meta: { [MCP_PROOF_METADATA_KEY]: encoded } }, context, {
      trustSnapshot,
      now,
      replayMode: 'online',
      maxProofBytes: 1
    }),
    { status: 'oversized' }
  );
});

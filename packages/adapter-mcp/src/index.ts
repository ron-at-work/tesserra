/**
 * Project-defined MCP metadata binding for the MCP 2026-07-28 baseline.
 * This does not change MCP OAuth or claim support by arbitrary MCP clients,
 * servers, SDKs, or transports.
 */
import {
  canonicalBytes,
  decodeBase64Url,
  encodeBase64Url,
  parseStrictJson,
  sha256DigestFor
} from '@agent-proof/protocol';
import { verifyArtifacts } from '@agent-proof/core';
import type {
  ArtifactBase,
  JsonObject,
  Principal,
  Resource,
  VerificationResult
} from '@agent-proof/protocol';
import type { VerificationInput } from '@agent-proof/core';

export const MCP_PROOF_METADATA_KEY = 'io.agent-proof/proof' as const;
export const MCP_PROOF_BINDING_VERSION = 'agent-proof-mcp/v1' as const;
export const DEFAULT_MAX_PROOF_BYTES = 65_536;

export interface McpToolCallContext {
  readonly toolName: string;
  readonly arguments: JsonObject;
  readonly audience: string;
  readonly resource: Resource;
  readonly task: string;
  readonly expectedSigner: Principal;
}

export interface McpProofCarrier {
  readonly version: typeof MCP_PROOF_BINDING_VERSION;
  readonly artifacts: readonly ArtifactBase[];
}

export type McpProofOutcome =
  | { readonly status: 'verified'; readonly result: VerificationResult }
  | { readonly status: 'missing' | 'stripped' | 'unsupported' | 'oversized' | 'malformed' }
  | { readonly status: 'denied'; readonly result: VerificationResult };

export interface McpProofVerifier {
  readonly trustSnapshot: JsonObject;
  readonly now: Date;
  readonly replayMode: 'online' | 'offline';
  readonly replay?: 'available' | 'duplicate';
  readonly maxProofBytes?: number;
}

export interface McpMetadataMessage {
  readonly _meta?: Readonly<Record<string, unknown>>;
}

const digest = (prefix: string, value: JsonObject): string =>
  sha256DigestFor(
    Buffer.concat([Buffer.from(prefix, 'ascii'), Buffer.from(canonicalBytes(value))])
  );

/** Canonical metadata binding for the exact parsed MCP tool call, never an OAuth replacement. */
export function mcpToolCallDigests(context: McpToolCallContext): {
  readonly payloadDigest: string;
  readonly taskContextDigest: string;
} {
  return {
    payloadDigest: digest('AGENT-PROOF-MCP-TOOL-ARGS-V1\0', context.arguments),
    taskContextDigest: digest('AGENT-PROOF-MCP-TOOL-CONTEXT-V1\0', {
      tool_name: context.toolName,
      task: context.task,
      audience: context.audience,
      resource: context.resource as unknown as JsonObject
    })
  };
}

export function encodeMcpProof(
  carrier: McpProofCarrier,
  maxProofBytes = DEFAULT_MAX_PROOF_BYTES
): string {
  const encoded = encodeBase64Url(canonicalBytes(carrier as unknown as JsonObject));
  if (Buffer.byteLength(encoded, 'ascii') > maxProofBytes)
    throw new RangeError('MCP proof exceeds configured limit');
  return encoded;
}

export function withMcpProof<T extends McpMetadataMessage>(
  message: T,
  carrier: McpProofCarrier,
  maxProofBytes = DEFAULT_MAX_PROOF_BYTES
): T {
  return {
    ...message,
    _meta: { ...message._meta, [MCP_PROOF_METADATA_KEY]: encodeMcpProof(carrier, maxProofBytes) }
  };
}

function carrierFrom(
  message: McpMetadataMessage,
  maxProofBytes: number
): McpProofCarrier | McpProofOutcome {
  const metadata = message._meta;
  if (metadata === undefined) return { status: 'missing' };
  const encoded = metadata[MCP_PROOF_METADATA_KEY];
  if (encoded === undefined) return { status: 'stripped' };
  if (typeof encoded !== 'string') return { status: 'malformed' };
  if (Buffer.byteLength(encoded, 'ascii') > maxProofBytes) return { status: 'oversized' };
  try {
    const decoded = parseStrictJson(decodeBase64Url(encoded)) as unknown;
    if (
      decoded === null ||
      typeof decoded !== 'object' ||
      (decoded as { version?: unknown }).version !== MCP_PROOF_BINDING_VERSION ||
      !Array.isArray((decoded as { artifacts?: unknown }).artifacts)
    )
      return { status: 'malformed' };
    return decoded as McpProofCarrier;
  } catch {
    return { status: 'malformed' };
  }
}

/**
 * Receiver middleware helper. Invoke only after the MCP server has completed
 * its own OAuth/resource authorization checks. A rejected outcome never means
 * MCP itself rejected the call; callers must enforce their local proof policy.
 */
export function verifyMcpToolCall(
  message: McpMetadataMessage,
  context: McpToolCallContext,
  options: McpProofVerifier
): McpProofOutcome {
  const candidate = carrierFrom(message, options.maxProofBytes ?? DEFAULT_MAX_PROOF_BYTES);
  if ('status' in candidate) return candidate;
  const digests = mcpToolCallDigests(context);
  const input: VerificationInput = {
    artifacts: candidate.artifacts,
    trustSnapshot: options.trustSnapshot,
    context: {
      audience: context.audience,
      action: context.toolName,
      resource: context.resource,
      task: context.task,
      expectedSigner: context.expectedSigner,
      expectedPayloadDigest: digests.payloadDigest,
      expectedTaskContextDigest: digests.taskContextDigest,
      replayRequired: true
    },
    now: options.now,
    replayMode: options.replayMode,
    ...(options.replay === undefined ? {} : { replay: options.replay })
  };
  const result = verifyArtifacts(input);
  return result.valid ? { status: 'verified', result } : { status: 'denied', result };
}

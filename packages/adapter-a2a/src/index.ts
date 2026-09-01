/** Project-defined optional A2A v1.0.1 extension binding; not an A2A implementation. */
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

export const A2A_PROOF_EXTENSION_URI = 'https://agent-proof.invalid/extensions/a2a/v1' as const;
export const A2A_PROOF_BINDING_VERSION = 'agent-proof-a2a/v1' as const;
export const DEFAULT_MAX_A2A_PROOF_BYTES = 65_536;

export interface A2aExtensionDeclaration {
  readonly uri: typeof A2A_PROOF_EXTENSION_URI;
  readonly version: 1;
}
export interface A2aNegotiation {
  readonly supportedExtensions: readonly A2aExtensionDeclaration[];
}
export interface A2aTaskContext {
  readonly taskId: string;
  readonly message: JsonObject;
  readonly audience: string;
  readonly resource: Resource;
  readonly action: string;
  readonly task: string;
  readonly expectedSigner: Principal;
}
export interface A2aProofCarrier {
  readonly version: typeof A2A_PROOF_BINDING_VERSION;
  readonly artifacts: readonly ArtifactBase[];
}
export interface A2aMessage {
  readonly extensions?: Readonly<Record<string, unknown>>;
}
export type A2aProofOutcome =
  | { readonly status: 'verified'; readonly result: VerificationResult }
  | { readonly status: 'unsupported' | 'missing' | 'stripped' | 'oversized' | 'malformed' }
  | { readonly status: 'denied'; readonly result: VerificationResult };
export interface A2aProofVerifier {
  readonly trustSnapshot: JsonObject;
  readonly now: Date;
  readonly replayMode: 'online' | 'offline';
  readonly replay?: 'available' | 'duplicate';
  readonly maxProofBytes?: number;
}

const extension: A2aExtensionDeclaration = { uri: A2A_PROOF_EXTENSION_URI, version: 1 };
const digest = (prefix: string, value: JsonObject): string =>
  sha256DigestFor(
    Buffer.concat([Buffer.from(prefix, 'ascii'), Buffer.from(canonicalBytes(value))])
  );
export const a2aProofExtension = (): A2aExtensionDeclaration => extension;
export const supportsA2aProof = (peer: A2aNegotiation): boolean =>
  peer.supportedExtensions.some(
    (candidate) => candidate.uri === extension.uri && candidate.version === extension.version
  );
export function a2aTaskDigests(context: A2aTaskContext): {
  readonly payloadDigest: string;
  readonly taskContextDigest: string;
} {
  return {
    payloadDigest: digest('AGENT-PROOF-A2A-MESSAGE-V1\0', context.message),
    taskContextDigest: digest('AGENT-PROOF-A2A-TASK-CONTEXT-V1\0', {
      task_id: context.taskId,
      task: context.task,
      action: context.action,
      audience: context.audience,
      resource: context.resource as unknown as JsonObject
    })
  };
}
export function withA2aProof<T extends A2aMessage>(
  message: T,
  carrier: A2aProofCarrier,
  maxProofBytes = DEFAULT_MAX_A2A_PROOF_BYTES
): T {
  const encoded = encodeBase64Url(canonicalBytes(carrier as unknown as JsonObject));
  if (Buffer.byteLength(encoded, 'ascii') > maxProofBytes)
    throw new RangeError('A2A proof exceeds configured limit');
  return { ...message, extensions: { ...message.extensions, [A2A_PROOF_EXTENSION_URI]: encoded } };
}
function carrierFrom(
  message: A2aMessage,
  maxProofBytes: number
): A2aProofCarrier | A2aProofOutcome {
  if (message.extensions === undefined) return { status: 'missing' };
  const encoded = message.extensions[A2A_PROOF_EXTENSION_URI];
  if (encoded === undefined) return { status: 'stripped' };
  if (typeof encoded !== 'string') return { status: 'malformed' };
  if (Buffer.byteLength(encoded, 'ascii') > maxProofBytes) return { status: 'oversized' };
  try {
    const decoded = parseStrictJson(decodeBase64Url(encoded)) as unknown;
    if (
      decoded === null ||
      typeof decoded !== 'object' ||
      (decoded as { version?: unknown }).version !== A2A_PROOF_BINDING_VERSION ||
      !Array.isArray((decoded as { artifacts?: unknown }).artifacts)
    )
      return { status: 'malformed' };
    return decoded as A2aProofCarrier;
  } catch {
    return { status: 'malformed' };
  }
}
/** Receiver helper after normal A2A authentication and task processing. */
export function verifyA2aMessage(
  message: A2aMessage,
  context: A2aTaskContext,
  options: A2aProofVerifier
): A2aProofOutcome {
  const candidate = carrierFrom(message, options.maxProofBytes ?? DEFAULT_MAX_A2A_PROOF_BYTES);
  if ('status' in candidate) return candidate;
  const digests = a2aTaskDigests(context);
  const input: VerificationInput = {
    artifacts: candidate.artifacts,
    trustSnapshot: options.trustSnapshot,
    context: {
      audience: context.audience,
      action: context.action,
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

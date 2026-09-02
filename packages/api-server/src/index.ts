import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { parseApiJson, StrictJsonError, type ErrorEnvelope } from '@agent-proof/api-contract';
import type { JsonValue } from '@agent-proof/api-contract';
import {
  verifyArtifacts,
  verifyDelegationChain,
  type VerificationResult
} from '@agent-proof/service';
import { artifactIdFor, validateArtifact, type ArtifactBase } from '@agent-proof/protocol';
import {
  ServiceError,
  type CreateIdentityInput,
  type IdentityCredential,
  type IdentityRecord,
  type IdentityService,
  type RequestVerifier,
  type TrustSnapshot
} from '@agent-proof/service';

export interface EvidenceApi {
  createDelegation(
    artifact: ArtifactBase
  ): Promise<{ id: string; artifact: ArtifactBase; createdAt: string }>;
  getDelegation(
    id: string
  ): Promise<{ id: string; artifact: ArtifactBase; createdAt: string } | undefined>;
  listDelegations(
    cursor: string | undefined,
    limit: number
  ): Promise<{
    items: readonly { id: string; artifact: ArtifactBase; createdAt: string }[];
    nextCursor?: string;
  }>;
  createRevocation(
    artifact: ArtifactBase
  ): Promise<{ id: string; artifact: ArtifactBase; createdAt: string }>;
  getRevocation(
    id: string
  ): Promise<{ id: string; artifact: ArtifactBase; createdAt: string } | undefined>;
  listEvents(
    cursor: string | undefined,
    limit: number
  ): Promise<{
    items: readonly Record<string, JsonValue>[];
    nextAfterId?: string;
  }>;
}

export interface SupabaseAuthOptions {
  /** Supabase project URL, e.g. https://<project-ref>.supabase.co */
  readonly supabaseUrl: string;
  /** Service role key sent as the Supabase apikey header. */
  readonly serviceRoleKey: string;
}

export interface LocalApiServerOptions {
  readonly service: IdentityService;
  /** Phase 2–5 persistence surface supplied by the concrete host. */
  readonly evidence?: EvidenceApi;
  /** Online request verification with atomic replay consumption. */
  readonly requestVerifier?: RequestVerifier;
  readonly host?: string;
  readonly port?: number;
  /** When set, every request must present a valid Supabase access token instead of loopback trust. */
  readonly auth?: SupabaseAuthOptions;
  /** Required to enable the security-sensitive configured-trust reload endpoint. */
  readonly trustReloadToken?: string;
  readonly requestId?: () => string;
  readonly maxBodyBytes?: number;
  /** Per-peer limit for failed reload-token attempts within one minute. */
  readonly reloadFailureLimit?: number;
  /** Injectable clock for deterministic local verification tests. */
  readonly now?: () => Date;
}

export interface LocalApiServer {
  readonly host: string;
  readonly port: number;
  listen(): Promise<void>;
  close(): Promise<void>;
}

const defaultHost = '127.0.0.1';
const defaultPort = 4318;
const defaultMaxBodyBytes = 1_048_576;
const defaultReloadFailureLimit = 5;

export function isLoopbackAddress(host: string): boolean {
  const normalized = host.trim().toLowerCase();
  if (normalized === 'localhost' || normalized === '::1') return true;
  return isIP(normalized) === 4 && /^127(?:\.\d{1,3}){3}$/.test(normalized);
}

function isLoopbackPeer(address: string | undefined): boolean {
  return (
    address !== undefined &&
    (isLoopbackAddress(address) || address.toLowerCase() === '::ffff:127.0.0.1')
  );
}

function isLoopbackHostHeader(value: string | undefined): boolean {
  if (value === undefined) return true; // HTTP/1.0 local clients may omit Host.
  const host = value.startsWith('[') ? value.slice(1, value.indexOf(']')) : value.split(':', 1)[0];
  return host !== undefined && isLoopbackAddress(host);
}

function requestId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function errorPayload(
  code: string,
  message: string,
  id: string,
  details: readonly string[] = []
): ErrorEnvelope {
  return { error: { code, message, details }, requestId: id };
}

function writeJson(response: ServerResponse, status: number, value: unknown): void {
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('cache-control', 'no-store');
  response.setHeader('x-content-type-options', 'nosniff');
  response.end(JSON.stringify(value));
}

function isJsonContentType(request: IncomingMessage): boolean {
  const value = request.headers['content-type'];
  if (typeof value !== 'string') return false;
  return /^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(value);
}

async function readJson(request: IncomingMessage, maxBytes: number): Promise<JsonValue> {
  if (!isJsonContentType(request))
    throw new ServiceError('INVALID_INPUT', 'content-type must be application/json');
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array);
    size += bytes.length;
    if (size > maxBytes)
      throw new ServiceError('INVALID_INPUT', 'request body exceeds the local API limit');
    chunks.push(bytes);
  }
  return parseApiJson(Buffer.concat(chunks));
}

function isRecord(value: JsonValue): value is { readonly [key: string]: JsonValue } {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function createInput(value: JsonValue, idempotencyKey: string | undefined): CreateIdentityInput {
  if (
    !isRecord(value) ||
    value['subject'] === undefined ||
    value['issuer'] === undefined ||
    value['authorityCeiling'] === undefined ||
    !isRecord(value['subject']) ||
    !isRecord(value['issuer']) ||
    !isRecord(value['authorityCeiling'])
  ) {
    throw new ServiceError('INVALID_INPUT', 'request body is invalid');
  }
  if (
    value['credentialPurpose'] !== undefined &&
    value['credentialPurpose'] !== 'agent-root-authority' &&
    value['credentialPurpose'] !== 'agent-key-binding'
  ) {
    throw new ServiceError('INVALID_INPUT', 'credentialPurpose is invalid');
  }
  return {
    subject: value['subject'] as unknown as CreateIdentityInput['subject'],
    issuer: value['issuer'] as unknown as CreateIdentityInput['issuer'],
    authorityCeiling: value[
      'authorityCeiling'
    ] as unknown as CreateIdentityInput['authorityCeiling'],
    ...(value['credentialPurpose'] === undefined
      ? {}
      : { credentialPurpose: value['credentialPurpose'] }),
    ...(idempotencyKey === undefined ? {} : { idempotencyKey })
  };
}

function credentialFrom(value: JsonValue): IdentityCredential {
  if (!isRecord(value) || value['credential'] === undefined || !isRecord(value['credential']))
    throw new ServiceError('INVALID_INPUT', 'request body is invalid');
  return value['credential'] as unknown as IdentityCredential;
}

function identityResponse(identity: IdentityRecord): Record<string, unknown> {
  return { id: identity.id, credential: identity.credential, createdAt: identity.createdAt };
}

function artifactResponse(
  record: { id: string; artifact: ArtifactBase; createdAt: string },
  field: 'delegation' | 'revocation'
): Record<string, unknown> {
  return { id: record.id, [field]: record.artifact, createdAt: record.createdAt };
}

function artifactSubmission(
  value: JsonValue,
  field: 'delegation' | 'revocation'
): {
  artifact: ArtifactBase;
  evidence: readonly ArtifactBase[];
} {
  const record = isRecord(value) ? value : undefined;
  const artifact = record?.[field] as JsonValue | undefined;
  const supplied = record?.['artifacts'];
  if (artifact === undefined || !isRecord(artifact) || !validateArtifact(artifact))
    throw new ServiceError('INVALID_INPUT', 'signed artifact schema is invalid');
  const typed = artifact as unknown as ArtifactBase;
  if (typed.id !== artifactIdFor(typed))
    throw new ServiceError(
      'INVALID_INPUT',
      'signed artifact identifier does not match its canonical content'
    );
  if (
    (field === 'delegation' && typed.kind !== 'delegation') ||
    (field === 'revocation' && typed.kind !== 'revocation')
  )
    throw new ServiceError('INVALID_INPUT', `artifact must be a ${field}`);
  if (
    supplied !== undefined &&
    (!Array.isArray(supplied) ||
      supplied.some((item) => !isRecord(item) || !validateArtifact(item)))
  )
    throw new ServiceError('INVALID_INPUT', 'supporting evidence schema is invalid');
  const evidence = [typed, ...((supplied ?? []) as unknown as ArtifactBase[])];
  if (evidence.some((item) => item.id !== artifactIdFor(item)))
    throw new ServiceError(
      'INVALID_INPUT',
      'supporting evidence identifier does not match its canonical content'
    );
  return { artifact: typed, evidence };
}

async function authorizeDelegationStorage(
  service: IdentityService,
  artifact: ArtifactBase,
  evidence: readonly ArtifactBase[],
  now: Date
): Promise<void> {
  if (Date.parse(artifact.issued_at) > now.getTime())
    throw new ServiceError('INVALID_INPUT', 'signed artifact is not yet valid');
  const rootCredential = evidence.find(
    (item) => item.kind === 'credential' && item['credential_purpose'] === 'agent-root-authority'
  );
  if (rootCredential === undefined)
    throw new ServiceError(
      'INVALID_INPUT',
      'delegation authorization requires root credential evidence'
    );
  const result = verifyDelegationChain({
    rootCredential,
    keyBindingCredentials: evidence.filter(
      (item) => item.kind === 'credential' && item.id !== rootCredential.id
    ),
    delegations: evidence.filter((item) => item.kind === 'delegation'),
    statusEvidence: evidence.filter(
      (item) =>
        item.kind === 'key_status' || item.kind === 'revocation' || item.kind === 'key_rotation'
    ),
    trustSnapshot: (await service.readTrustSnapshot()) as never,
    now,
    offlineInspection: true
  });
  if (!result.valid)
    throw new ServiceError('INVALID_INPUT', `delegation authorization failed: ${result.code}`);
}

function verificationInput(value: JsonValue): {
  artifacts: readonly ArtifactBase[];
  context: Record<string, JsonValue>;
  replayMode: 'online' | 'offline';
} {
  const record =
    value !== null && typeof value === 'object' && !Array.isArray(value)
      ? (value as Record<string, JsonValue>)
      : undefined;
  const artifacts = record?.['artifacts'];
  const context = record?.['context'];
  if (
    artifacts === undefined ||
    context === undefined ||
    !Array.isArray(artifacts) ||
    !isRecord(context)
  )
    throw new ServiceError('INVALID_INPUT', 'request body is invalid');
  const replayMode = record?.['replayMode'] ?? 'offline';
  if (replayMode !== 'online' && replayMode !== 'offline')
    throw new ServiceError('INVALID_INPUT', 'replayMode is invalid');
  return {
    artifacts: artifacts as unknown as readonly ArtifactBase[],
    context,
    replayMode
  };
}

function verificationContext(value: Record<string, JsonValue>) {
  const expected = [
    'audience',
    'action',
    'resource',
    'task',
    'expectedSigner',
    'expectedPayloadDigest',
    'expectedTaskContextDigest'
  ];
  if (
    expected.some((key) => value[key] === undefined) ||
    typeof value['audience'] !== 'string' ||
    typeof value['action'] !== 'string' ||
    typeof value['task'] !== 'string' ||
    typeof value['expectedPayloadDigest'] !== 'string' ||
    typeof value['expectedTaskContextDigest'] !== 'string' ||
    !isRecord(value['resource'] as JsonValue) ||
    !isRecord(value['expectedSigner'] as JsonValue)
  )
    throw new ServiceError('INVALID_INPUT', 'verification context is invalid');
  return {
    audience: value['audience'],
    action: value['action'],
    resource: value['resource'] as { readonly type: string; readonly value: string },
    task: value['task'],
    expectedSigner: value['expectedSigner'] as never,
    expectedPayloadDigest: value['expectedPayloadDigest'],
    expectedTaskContextDigest: value['expectedTaskContextDigest'],
    replayRequired: value['replayRequired'] === true
  };
}

function trustResponse(snapshot: TrustSnapshot): Record<string, unknown> {
  return { snapshot };
}

function constantTimeMatches(expected: string | undefined, supplied: string | undefined): boolean {
  if (expected === undefined || supplied === undefined) return false;
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(supplied, 'utf8');
  // Compare equal-sized buffers even when lengths differ, without accepting them.
  const padded = Buffer.alloc(left.length);
  right.copy(padded, 0, 0, Math.min(right.length, padded.length));
  return right.length === left.length && timingSafeEqual(left, padded);
}

function bearerToken(authorization: string | undefined): string | undefined {
  if (typeof authorization !== 'string') return undefined;
  const trimmed = authorization.trimStart();
  if (trimmed.slice(0, 7).toLowerCase() !== 'bearer ') return undefined;
  const token = trimmed.slice(7).trim();
  return token.length > 0 ? token : undefined;
}

/**
 * Validates an access token by asking Supabase Auth to resolve the caller.
 * Returns `true` when Supabase confirms the token, otherwise a short reason
 * that becomes the 401 error message. Network failures fail closed.
 */
async function verifySupabaseAccessToken(
  auth: SupabaseAuthOptions,
  authorization: string | undefined
): Promise<true | string> {
  const token = bearerToken(authorization);
  if (token === undefined) return 'authorization bearer token is required';
  try {
    const response = await fetch(`${auth.supabaseUrl.replace(/\/+$/, '')}/auth/v1/user`, {
      headers: { authorization: `Bearer ${token}`, apikey: auth.serviceRoleKey }
    });
    if (!response.ok) return 'authorization token is not valid';
    return true;
  } catch {
    return 'authorization token could not be verified';
  }
}

function pathParts(url: URL): readonly string[] {
  try {
    return url.pathname.split('/').filter(Boolean).map(decodeURIComponent);
  } catch {
    throw new ServiceError('INVALID_INPUT', 'request path is invalid');
  }
}

export function createLocalApiServer(options: LocalApiServerOptions): LocalApiServer {
  const host = options.host ?? defaultHost;
  const port = options.port ?? defaultPort;
  const auth = options.auth;
  if (auth === undefined && !isLoopbackAddress(host))
    throw new Error('Local API refuses non-loopback binding. Remote exposure is not implemented.');
  const maxBodyBytes = options.maxBodyBytes ?? defaultMaxBodyBytes;
  const reloadFailureLimit = options.reloadFailureLimit ?? defaultReloadFailureLimit;
  const now = options.now ?? (() => new Date());
  const nextRequestId = options.requestId ?? requestId;
  const reloadFailures = new Map<string, { count: number; resetAt: number }>();

  const server = createServer(async (request, response) => {
    const id = nextRequestId();
    try {
      if (auth !== undefined) {
        const origin = request.headers.origin;
        if (typeof origin === 'string' && origin.length > 0) {
          response.setHeader('access-control-allow-origin', origin);
          response.setHeader('vary', 'Origin');
        } else {
          response.setHeader('access-control-allow-origin', '*');
        }
        response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS');
        response.setHeader(
          'access-control-allow-headers',
          'Authorization, Content-Type, Idempotency-Key'
        );
        response.setHeader('access-control-max-age', '86400');
        if (request.method === 'OPTIONS') {
          response.statusCode = 204;
          response.end();
          return;
        }
        const authFailure = await verifySupabaseAccessToken(auth, request.headers.authorization);
        if (authFailure !== true) {
          writeJson(response, 401, errorPayload('UNAUTHORIZED', authFailure, id));
          return;
        }
      } else if (
        !isLoopbackPeer(request.socket.remoteAddress) ||
        !isLoopbackHostHeader(request.headers.host)
      ) {
        writeJson(response, 403, errorPayload('LOCAL_ONLY', 'local access is required', id));
        return;
      }
      const method = request.method ?? 'GET';
      const url = new URL(request.url ?? '/', `http://${host}`);
      const parts = pathParts(url);
      if (method === 'POST' && url.pathname === '/v1/identities') {
        const body = await readJson(request, maxBodyBytes);
        const keyHeader = request.headers['idempotency-key'];
        const idempotencyKey = typeof keyHeader === 'string' ? keyHeader : undefined;
        writeJson(
          response,
          201,
          identityResponse(await options.service.createIdentity(createInput(body, idempotencyKey)))
        );
        return;
      }
      if (
        method === 'GET' &&
        parts.length === 3 &&
        parts[0] === 'v1' &&
        parts[1] === 'identities'
      ) {
        writeJson(
          response,
          200,
          identityResponse(await options.service.getIdentity(parts[2] ?? ''))
        );
        return;
      }
      if (method === 'POST' && url.pathname === '/v1/verifications/identity') {
        writeJson(
          response,
          200,
          await options.service.verifyIdentity(
            credentialFrom(await readJson(request, maxBodyBytes))
          )
        );
        return;
      }
      if (method === 'POST' && url.pathname === '/v1/delegations') {
        if (options.evidence === undefined)
          throw new ServiceError('INVALID_INPUT', 'delegation persistence is not configured');
        const submission = artifactSubmission(await readJson(request, maxBodyBytes), 'delegation');
        await authorizeDelegationStorage(
          options.service,
          submission.artifact,
          submission.evidence,
          now()
        );
        const saved = await options.evidence.createDelegation(submission.artifact);
        writeJson(response, 201, artifactResponse(saved, 'delegation'));
        return;
      }
      if (
        method === 'GET' &&
        parts.length === 3 &&
        parts[0] === 'v1' &&
        parts[1] === 'delegations'
      ) {
        if (options.evidence === undefined)
          throw new ServiceError('INVALID_INPUT', 'delegation persistence is not configured');
        const saved = await options.evidence.getDelegation(parts[2] ?? '');
        if (saved === undefined)
          throw new ServiceError('IDENTITY_NOT_FOUND', 'delegation was not found');
        writeJson(response, 200, artifactResponse(saved, 'delegation'));
        return;
      }
      if (method === 'GET' && url.pathname === '/v1/delegations') {
        if (options.evidence === undefined)
          throw new ServiceError('INVALID_INPUT', 'delegation persistence is not configured');
        const rawLimit = url.searchParams.get('limit');
        const page = await options.evidence.listDelegations(
          url.searchParams.get('cursor') ?? undefined,
          rawLimit === null ? 25 : Number(rawLimit)
        );
        writeJson(response, 200, {
          items: page.items.map((item) => artifactResponse(item, 'delegation')),
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor })
        });
        return;
      }
      if (method === 'POST' && url.pathname === '/v1/revocations') {
        if (options.evidence === undefined)
          throw new ServiceError('INVALID_INPUT', 'revocation persistence is not configured');
        await readJson(request, maxBodyBytes);
        throw new ServiceError(
          'STATUS_AUTHORITY_REQUIRED',
          'revocation persistence is unavailable until a separate configured status authority verifies the signed publisher stream'
        );
      }
      if (
        method === 'GET' &&
        parts.length === 3 &&
        parts[0] === 'v1' &&
        parts[1] === 'revocations'
      ) {
        if (options.evidence === undefined)
          throw new ServiceError('INVALID_INPUT', 'revocation persistence is not configured');
        const saved = await options.evidence.getRevocation(parts[2] ?? '');
        if (saved === undefined)
          throw new ServiceError('IDENTITY_NOT_FOUND', 'revocation was not found');
        writeJson(response, 200, artifactResponse(saved, 'revocation'));
        return;
      }
      if (method === 'GET' && url.pathname === '/v1/events') {
        if (options.evidence === undefined)
          throw new ServiceError('INVALID_INPUT', 'event persistence is not configured');
        const rawLimit = url.searchParams.get('limit');
        writeJson(
          response,
          200,
          await options.evidence.listEvents(
            url.searchParams.get('cursor') ?? undefined,
            rawLimit === null ? 25 : Number(rawLimit)
          )
        );
        return;
      }
      if (method === 'POST' && url.pathname === '/v1/verifications/request') {
        const input = verificationInput(await readJson(request, maxBodyBytes));
        const context = verificationContext(input.context);
        const trustSnapshot = await options.service.readTrustSnapshot();
        const requestArtifact = input.artifacts.find((artifact) => artifact.kind === 'request');
        const result: VerificationResult =
          options.requestVerifier !== undefined && requestArtifact !== undefined
            ? await options.requestVerifier.verifyRequest({
                request: requestArtifact as import('@agent-proof/protocol').ArtifactBase as never,
                trustSnapshot: trustSnapshot as never,
                context,
                now: now(),
                replayMode: input.replayMode
              })
            : verifyArtifacts({
                artifacts: input.artifacts,
                trustSnapshot: trustSnapshot as never,
                context,
                now: now(),
                replayMode: input.replayMode
              });
        writeJson(response, 200, result);
        return;
      }
      if (method === 'POST' && url.pathname === '/v1/verifications/delegation') {
        const input = verificationInput(await readJson(request, maxBodyBytes));
        const result: VerificationResult = verifyArtifacts({
          artifacts: input.artifacts,
          trustSnapshot: (await options.service.readTrustSnapshot()) as never,
          context: verificationContext(input.context),
          now: now(),
          replayMode: input.replayMode
        });
        writeJson(response, 200, result);
        return;
      }
      if (method === 'GET' && url.pathname === '/v1/agents') {
        const rawLimit = url.searchParams.get('limit');
        const limit = rawLimit === null ? undefined : Number(rawLimit);
        const page = await options.service.listAgents(
          url.searchParams.get('cursor') ?? undefined,
          limit
        );
        writeJson(response, 200, {
          items: page.items.map(identityResponse),
          ...(page.nextCursor === undefined ? {} : { nextCursor: page.nextCursor })
        });
        return;
      }
      if (method === 'GET' && url.pathname === '/v1/trust-anchors') {
        writeJson(response, 200, trustResponse(await options.service.readTrustSnapshot()));
        return;
      }
      if (method === 'POST' && url.pathname === '/v1/trust-snapshots:reload') {
        if (auth === undefined) {
          const peer = request.socket.remoteAddress ?? 'unknown';
          const previous = reloadFailures.get(peer);
          const current = Date.now();
          if (
            previous !== undefined &&
            previous.resetAt > current &&
            previous.count >= reloadFailureLimit
          ) {
            writeJson(
              response,
              429,
              errorPayload('TRUST_RELOAD_THROTTLED', 'trust reload is temporarily throttled', id)
            );
            return;
          }
          const supplied = request.headers['x-local-reload-token'];
          const token = typeof supplied === 'string' ? supplied : undefined;
          if (!constantTimeMatches(options.trustReloadToken, token)) {
            const window =
              previous !== undefined && previous.resetAt > current
                ? previous
                : { count: 0, resetAt: current + 60_000 };
            reloadFailures.set(peer, { count: window.count + 1, resetAt: window.resetAt });
            writeJson(
              response,
              403,
              errorPayload(
                'TRUST_RELOAD_FORBIDDEN',
                'configured local authorization is required to reload trust',
                id
              )
            );
            return;
          }
          reloadFailures.delete(peer);
        }
        writeJson(response, 200, trustResponse(await options.service.reloadTrustSnapshot()));
        return;
      }
      writeJson(response, 404, errorPayload('NOT_FOUND', 'route was not found', id));
    } catch (error) {
      if (error instanceof StrictJsonError) {
        writeJson(response, 400, errorPayload(error.code, 'request body is invalid', id));
      } else if (error instanceof ServiceError) {
        const status = error.code === 'IDENTITY_NOT_FOUND' ? 404 : 400;
        writeJson(response, status, errorPayload(error.code, error.message, id, error.details));
      } else {
        writeJson(response, 500, errorPayload('INTERNAL', 'internal server error', id));
      }
    }
  });

  return {
    host,
    port,
    listen: () =>
      new Promise((resolve, reject) =>
        server.listen(port, host, () => resolve()).once('error', reject)
      ),
    close: () =>
      new Promise((resolve, reject) =>
        server.close((error) => (error === undefined ? resolve() : reject(error)))
      )
  };
}

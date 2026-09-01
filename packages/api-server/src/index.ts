import { timingSafeEqual } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { parseApiJson, StrictJsonError, type ErrorEnvelope } from '@agent-proof/api-contract';
import type { JsonValue } from '@agent-proof/api-contract';
import {
  ServiceError,
  type CreateIdentityInput,
  type IdentityCredential,
  type IdentityRecord,
  type IdentityService,
  type TrustSnapshot
} from '@agent-proof/service';

export interface LocalApiServerOptions {
  readonly service: IdentityService;
  readonly host?: string;
  readonly port?: number;
  /** Required to enable the security-sensitive configured-trust reload endpoint. */
  readonly trustReloadToken?: string;
  readonly requestId?: () => string;
  readonly maxBodyBytes?: number;
  /** Per-peer limit for failed reload-token attempts within one minute. */
  readonly reloadFailureLimit?: number;
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
  if (!isLoopbackAddress(host))
    throw new Error('Local API refuses non-loopback binding. Remote exposure is not implemented.');
  const maxBodyBytes = options.maxBodyBytes ?? defaultMaxBodyBytes;
  const reloadFailureLimit = options.reloadFailureLimit ?? defaultReloadFailureLimit;
  const nextRequestId = options.requestId ?? requestId;
  const reloadFailures = new Map<string, { count: number; resetAt: number }>();

  const server = createServer(async (request, response) => {
    const id = nextRequestId();
    try {
      if (
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

import type {
  CreateIdentityRequest,
  ErrorEnvelope,
  IdentityResponse,
  ListAgentsResponse,
  ReloadTrustSnapshotResponse,
  TrustSnapshotResponse,
  VerificationResponse,
  VerifyIdentityRequest
} from '@agent-proof/api-contract';
import { isErrorEnvelope } from '@agent-proof/api-contract';

export class ApiClientError extends Error {
  public constructor(
    public readonly status: number,
    public readonly envelope: ErrorEnvelope
  ) {
    super(envelope.error.message);
    this.name = 'ApiClientError';
  }
}

export interface FetchLike {
  (
    input: string,
    init?: {
      readonly method?: string;
      readonly headers?: Record<string, string>;
      readonly body?: string;
    }
  ): Promise<{
    readonly ok: boolean;
    readonly status: number;
    json(): Promise<unknown>;
  }>;
}

export interface LocalApiClientOptions {
  /** Defaults to the loopback-only local API endpoint. */
  readonly baseUrl?: string;
  readonly fetch?: FetchLike;
  readonly trustReloadToken?: string;
}

function defaultFetch(): FetchLike {
  const candidate = globalThis.fetch;
  if (candidate === undefined) throw new Error('A fetch implementation is required');
  return candidate as FetchLike;
}

export class LocalApiClient {
  private readonly baseUrl: string;
  private readonly fetcher: FetchLike;

  public constructor(private readonly options: LocalApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? 'http://127.0.0.1:4318').replace(/\/$/, '');
    this.fetcher = options.fetch ?? defaultFetch();
  }

  public createIdentity(
    request: CreateIdentityRequest,
    idempotencyKey?: string
  ): Promise<IdentityResponse> {
    const headers: Record<string, string> = {};
    if (idempotencyKey !== undefined) headers['idempotency-key'] = idempotencyKey;
    return this.request('POST', '/v1/identities', request, headers);
  }

  public getIdentity(id: string): Promise<IdentityResponse> {
    return this.request('GET', `/v1/identities/${encodeURIComponent(id)}`);
  }

  public verifyIdentity(request: VerifyIdentityRequest): Promise<VerificationResponse> {
    return this.request('POST', '/v1/verifications/identity', request);
  }

  public listAgents(cursor?: string, limit?: number): Promise<ListAgentsResponse> {
    const parameters = new URLSearchParams();
    if (cursor !== undefined) parameters.set('cursor', cursor);
    if (limit !== undefined) parameters.set('limit', String(limit));
    const query = parameters.size === 0 ? '' : `?${parameters}`;
    return this.request('GET', `/v1/agents${query}`);
  }

  public readTrustSnapshot(): Promise<TrustSnapshotResponse> {
    return this.request('GET', '/v1/trust-anchors');
  }

  public reloadTrustSnapshot(): Promise<ReloadTrustSnapshotResponse> {
    const headers: Record<string, string> = {};
    if (this.options.trustReloadToken !== undefined)
      headers['x-local-reload-token'] = this.options.trustReloadToken;
    return this.request('POST', '/v1/trust-snapshots:reload', undefined, headers);
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    extraHeaders: Record<string, string> = {}
  ): Promise<T> {
    const response = await this.fetcher(`${this.baseUrl}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...extraHeaders
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    });
    const payload = await response.json();
    if (!response.ok) {
      const envelope = isErrorEnvelope(payload)
        ? payload
        : {
            error: {
              code: 'HTTP_ERROR',
              message: 'The local API returned an invalid error response',
              details: []
            },
            requestId: ''
          };
      throw new ApiClientError(response.status, envelope);
    }
    return payload as T;
  }
}

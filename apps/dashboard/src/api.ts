import { DEFAULT_API_BASE_URL } from './devConfig';

/** HTTP models are intentionally limited to publicly exposed API fields. */
export interface CredentialDto {
  readonly version: 'agent-proof/v1';
  readonly kind: 'credential';
  readonly [key: string]: unknown;
}
export interface Agent {
  readonly id: string;
  readonly createdAt: string;
  readonly credential: {
    readonly subject: { readonly id: string };
    readonly credential_purpose: string;
    readonly expires_at: string;
    readonly key_id: string;
  };
}
export interface ListAgentsResponse {
  readonly items: readonly Agent[];
}
export interface TrustSnapshotResponse {
  readonly snapshot: Record<string, unknown>;
}
export interface VerificationResponse {
  readonly valid: boolean;
  readonly code: string;
  readonly evidence_ids: readonly string[];
  readonly status_fresh: boolean;
  readonly replay_checked: boolean;
  readonly verifier_now: string;
  readonly warnings: readonly string[];
}
/** A relationship is rendered only when explicitly returned by a graph-capable API. */
export interface ProvenanceNode {
  readonly id: string;
  readonly label: string;
  readonly kind: string;
}
export interface ProvenanceEdge {
  readonly id: string;
  readonly source: string;
  readonly target: string;
  readonly relationship: string;
}
export interface ProvenanceGraph {
  readonly nodes: readonly ProvenanceNode[];
  readonly edges: readonly ProvenanceEdge[];
}

export type ApiState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly data: T; readonly updatedAt: Date }
  | { readonly status: 'error'; readonly message: string; readonly offline: boolean };

export interface DashboardApi {
  listAgents(): Promise<ListAgentsResponse>;
  readTrustSnapshot(): Promise<TrustSnapshotResponse>;
  verifyIdentity(credential: CredentialDto): Promise<VerificationResponse>;
}

interface ErrorEnvelope {
  readonly error?: { readonly message?: string };
}

/** Browser-safe adapter for the API's published HTTP contract. */
export class LocalDashboardApi implements DashboardApi {
  private authToken: string | null = null;

  public constructor(
    readonly baseUrl = import.meta.env.VITE_API_BASE_URL ?? DEFAULT_API_BASE_URL
  ) {}

  /** Attach (or clear) the bearer token used on every authenticated request. */
  public setAuthToken(token: string | null): void {
    this.authToken = token;
  }

  public listAgents(): Promise<ListAgentsResponse> {
    return this.request('/v1/agents');
  }
  public readTrustSnapshot(): Promise<TrustSnapshotResponse> {
    return this.request('/v1/trust-anchors');
  }
  public verifyIdentity(credential: CredentialDto): Promise<VerificationResponse> {
    return this.request('/v1/verifications/identity', {
      method: 'POST',
      body: JSON.stringify({ credential })
    });
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers: Record<string, string> = {
      accept: 'application/json',
      ...(init?.body ? { 'content-type': 'application/json' } : {})
    };
    if (this.authToken) {
      headers.authorization = `Bearer ${this.authToken}`;
    }
    let response: Response;
    try {
      response = await fetch(`${this.baseUrl}${path}`, { ...init, headers });
    } catch (error) {
      throw new DashboardApiError(
        error instanceof TypeError ? 'The API is unreachable.' : 'The API request failed.',
        true
      );
    }
    const payload: unknown = await response.json().catch(() => undefined);
    if (!response.ok) {
      const error = payload as ErrorEnvelope | undefined;
      throw new DashboardApiError(
        error?.error?.message ?? `API returned ${response.status}.`,
        false
      );
    }
    return payload as T;
  }
}
export class DashboardApiError extends Error {
  public constructor(
    message: string,
    public readonly offline: boolean
  ) {
    super(message);
    this.name = 'DashboardApiError';
  }
}
export function isDashboardApiError(error: unknown): error is DashboardApiError {
  return error instanceof DashboardApiError;
}
export function isOfflineError(error: unknown): boolean {
  return error instanceof DashboardApiError && error.offline;
}

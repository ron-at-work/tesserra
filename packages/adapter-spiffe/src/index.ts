/**
 * SPIFFE/SPIRE mapping ports for the pinned SPIFFE revision and SPIRE v1.15.3.
 * This adapter consumes validated Workload API material; it neither implements
 * Workload API, SVID/bundle validation, attestation, nor SPIRE registration.
 */
import type { Principal } from '@agent-proof/protocol';

export type SpiffeId = `spiffe://${string}`;
export type SvidKind = 'x509' | 'jwt';

export interface X509Svid {
  readonly kind: 'x509';
  readonly spiffeId: SpiffeId;
  readonly trustDomain: string;
  /** Leaf-first PEM chain supplied and validated by the SPIFFE implementation. */
  readonly certificateChainPem: readonly string[];
  readonly privateKeyReference: string;
  readonly expiresAt: Date;
}
export interface JwtSvid {
  readonly kind: 'jwt';
  readonly spiffeId: SpiffeId;
  readonly trustDomain: string;
  readonly token: string;
  readonly audience: readonly string[];
  readonly expiresAt: Date;
}
export type ValidatedSvid = X509Svid | JwtSvid;
export interface SpiffeBundle {
  readonly trustDomain: string;
  readonly bundlePem: string;
}

/** Fixture-friendly boundary over an SPIFFE Workload API client or test double. */
export interface WorkloadApiClient {
  fetchX509Svid(): Promise<X509Svid>;
  fetchJwtSvid(audience: readonly string[]): Promise<JwtSvid>;
  fetchBundles(): Promise<readonly SpiffeBundle[]>;
}

/** Maps a validated SVID to a workload principal without equating it to an agent. */
export interface IdentityProvider {
  workloadIdentity(): Promise<SpiffeWorkloadIdentity>;
}
/** Supplies only configured/validated SPIFFE trust material; never core trust discovery. */
export interface TrustProvider {
  bundles(): Promise<readonly SpiffeBundle[]>;
  isTrustedTrustDomain(trustDomain: string): Promise<boolean>;
}
export interface SpiffeWorkloadIdentity {
  readonly principal: Principal & { readonly type: 'workload' };
  readonly svid: ValidatedSvid;
  readonly channelIdentity: 'x509-svid' | 'jwt-svid';
}
export interface RuntimeEvidence {
  readonly kind: 'spiffe-runtime-evidence/v1';
  readonly spiffeId: SpiffeId;
  readonly trustDomain: string;
  readonly svidKind: SvidKind;
  readonly expiresAt: string;
  readonly audience?: readonly string[];
}

const trustDomainFor = (id: SpiffeId): string => new URL(id).hostname;
function workloadPrincipal(id: SpiffeId): Principal & { readonly type: 'workload' } {
  return { type: 'workload', id };
}
function assertTrusted(id: SpiffeId, trustDomain: string, allowed: ReadonlySet<string>): void {
  if (trustDomainFor(id) !== trustDomain || !allowed.has(trustDomain))
    throw new Error('SPIFFE trust domain is not configured');
}

/**
 * X.509-SVID is deliberately the default for channel identity. JWT-SVID is
 * obtained only for an explicit audience and remains a distinct bearer claim.
 */
export function createSpiffeIdentityProvider(
  workloadApi: WorkloadApiClient,
  trustedTrustDomains: readonly string[]
): IdentityProvider {
  const allowed = new Set(trustedTrustDomains);
  return {
    async workloadIdentity(): Promise<SpiffeWorkloadIdentity> {
      const svid = await workloadApi.fetchX509Svid();
      assertTrusted(svid.spiffeId, svid.trustDomain, allowed);
      return { principal: workloadPrincipal(svid.spiffeId), svid, channelIdentity: 'x509-svid' };
    }
  };
}
export function createSpiffeTrustProvider(
  workloadApi: WorkloadApiClient,
  trustedTrustDomains: readonly string[]
): TrustProvider {
  const allowed = new Set(trustedTrustDomains);
  return {
    async bundles(): Promise<readonly SpiffeBundle[]> {
      return (await workloadApi.fetchBundles()).filter((bundle) => allowed.has(bundle.trustDomain));
    },
    async isTrustedTrustDomain(trustDomain: string): Promise<boolean> {
      return allowed.has(trustDomain);
    }
  };
}
export async function jwtWorkloadIdentity(
  workloadApi: WorkloadApiClient,
  trustedTrustDomains: readonly string[],
  audience: readonly string[]
): Promise<SpiffeWorkloadIdentity> {
  if (audience.length === 0) throw new Error('JWT-SVID requires an explicit audience');
  const svid = await workloadApi.fetchJwtSvid(audience);
  assertTrusted(svid.spiffeId, svid.trustDomain, new Set(trustedTrustDomains));
  return { principal: workloadPrincipal(svid.spiffeId), svid, channelIdentity: 'jwt-svid' };
}
/** A serializable runtime observation, never an agent, task, or delegation grant. */
export function runtimeEvidenceFor(identity: SpiffeWorkloadIdentity): RuntimeEvidence {
  const { svid } = identity;
  return {
    kind: 'spiffe-runtime-evidence/v1',
    spiffeId: svid.spiffeId,
    trustDomain: svid.trustDomain,
    svidKind: svid.kind,
    expiresAt: svid.expiresAt.toISOString(),
    ...(svid.kind === 'jwt' ? { audience: svid.audience } : {})
  };
}

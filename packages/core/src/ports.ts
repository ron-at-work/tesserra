import type { ArtifactBase, JsonObject, Principal, PublicJwk } from '@agent-proof/protocol';
export interface Clock {
  now(): Date;
}
export interface RandomSource {
  bytes(length: number): Uint8Array;
}
export interface PublicKeyResolver {
  resolve(keyId: string): PublicJwk | undefined;
}
export interface ReplayStore {
  consume(input: {
    readonly audience: string;
    readonly signerKeyId: string;
    readonly requestId: string;
    readonly nonce: string;
    readonly expiresAt: Date;
  }): Promise<'consumed' | 'duplicate' | 'expired'>;
}
export interface VerificationContext {
  readonly audience: string;
  readonly action: string;
  readonly resource: { readonly type: string; readonly value: string };
  readonly task: string;
  readonly expectedSigner: Principal;
  readonly expectedPayloadDigest: string;
  readonly expectedTaskContextDigest: string;
  readonly replayRequired: boolean;
}
export interface VerificationInput {
  readonly artifacts: readonly ArtifactBase[];
  readonly trustSnapshot: JsonObject;
  readonly context: VerificationContext;
  readonly now: Date;
  readonly replayMode: 'online' | 'offline';
  readonly replay?: 'available' | 'duplicate';
  /** Explicit archived policy/status material enables RFC historical verification. */
  readonly archivedSnapshot?: JsonObject;
}
export interface KeyProvider {
  create(): Promise<{
    readonly reference: string;
    readonly keyId: string;
    readonly publicJwk: PublicJwk;
  }>;
  sign(reference: string, message: Uint8Array): Promise<Uint8Array>;
  publicKey(reference: string): Promise<PublicJwk | undefined>;
}

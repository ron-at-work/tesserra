#!/usr/bin/env node
import { chmod, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EncryptedFilesystemKeyProvider, SystemRandomSource } from '@agent-proof/crypto-local';
import {
  createDelegation,
  createProvenance,
  createRequest,
  signArtifact,
  verifyArtifacts,
  verifyDelegationChain
} from '@agent-proof/core';
import { SqliteStorage } from '@agent-proof/storage-sqlite';
import {
  artifactIdFor,
  canonicalize,
  isTimestamp,
  policyHashFor,
  sha256DigestFor,
  signingInputFor,
  type ArtifactKind,
  type AgentId,
  type ArtifactBase,
  type Constraints,
  type JsonObject,
  type JsonValue,
  type Principal,
  type PublicJwk,
  validAgentId
} from '@agent-proof/protocol';
import { formatAgentId, parseAgentId } from '@agent-proof/sdk';

const DEFAULT_HOME = '.agent-proof';
const DEFAULT_PRODUCT_NAME = 'ATTEST';
const CREDENTIAL_ID = /^urn:agent-proof:v1:sha256:[A-Za-z0-9_-]{43}$/;
const repositoryProductConfigs = [
  resolve(fileURLToPath(new URL('../../../config/product.json', import.meta.url))),
  resolve(fileURLToPath(new URL('../../../../config/product.json', import.meta.url)))
];

type JsonRecord = { readonly [key: string]: JsonValue };
type CliConfig = { readonly version: 1; readonly trustAnchors: readonly TrustAnchor[] };
type TrustAnchor = {
  readonly credentialId: string;
  readonly issuerAuthority: {
    readonly principal: Principal;
    readonly key_id: string;
    readonly public_jwk: PublicJwk;
  };
  readonly root: {
    readonly issuer: Principal;
    readonly root_subject: Principal;
    readonly credential_purpose: 'agent-root-authority';
  };
};
type IdentityRecord = {
  readonly credential: ArtifactBase;
  readonly issuerAuthority: TrustAnchor['issuerAuthority'];
  readonly issuerKeyReference: string;
  readonly subjectKeyReference?: string;
};

class CliError extends Error {
  public constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'CliError';
  }
}

const utc = (value: Date = new Date()): string => value.toISOString().replace(/\.\d{3}Z$/, 'Z');
const outputJson = (value: JsonValue): string => canonicalize(value);
const has = (args: readonly string[], flag: string): boolean => args.includes(flag);

function valueFor(args: readonly string[], flag: string): string | undefined {
  const index = args.indexOf(flag);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--'))
    throw new CliError('USAGE', `${flag} requires a value.`);
  return value;
}

function required(args: readonly string[], flag: string): string {
  return (
    valueFor(args, flag) ??
    (() => {
      throw new CliError('USAGE', `${flag} is required.`);
    })()
  );
}

function appHome(args: readonly string[]): string {
  return resolve(valueFor(args, '--home') ?? process.env['AGENTCTL_HOME'] ?? DEFAULT_HOME);
}

function identityFile(home: string, id: string): string {
  if (!CREDENTIAL_ID.test(id))
    throw new CliError('INVALID_ID', 'Identity ID must be a canonical Agent Proof credential ID.');
  return join(home, 'identities', `${id.slice(-43)}.json`);
}

function localDatabase(home: string): SqliteStorage {
  return new SqliteStorage({ path: join(home, 'state.sqlite') });
}

function artifactFile(home: string, id: string): string {
  if (!CREDENTIAL_ID.test(id))
    throw new CliError('INVALID_ID', 'Artifact ID must be a canonical Agent Proof artifact ID.');
  return join(home, 'artifacts', `${id.slice(-43)}.json`);
}

function asRecord(value: JsonValue | undefined): JsonObject {
  if (value === undefined || value === null || typeof value !== 'object' || Array.isArray(value))
    throw new CliError('CONFIG_INVALID', 'Local state has an invalid object shape.');
  return value as JsonObject;
}

function credentialRecord(home: string, id: string): Promise<IdentityRecord> {
  return readJson(identityFile(home, id), `Identity '${id}' was not found in ${home}.`).then(
    (value) => object(value) as unknown as IdentityRecord
  );
}

function principalFor(record: IdentityRecord): Principal {
  return record.credential['subject'] as unknown as Principal;
}

function resource(value: string): { readonly type: string; readonly value: string } {
  return { type: value.startsWith('https://') ? 'uri' : 'opaque', value };
}

function digest(value: string): string {
  return /^sha256:[A-Za-z0-9_-]{43}$/.test(value)
    ? value
    : sha256DigestFor(new TextEncoder().encode(value));
}

function uuidV7(): string {
  const bytes = Buffer.from(globalThis.crypto.getRandomValues(new Uint8Array(16)));
  bytes[6] = (bytes[6]! & 0x0f) | 0x70;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function readArtifact(home: string, id: string): Promise<ArtifactBase> {
  return readJson(artifactFile(home, id), `Artifact '${id}' was not found in ${home}.`).then(
    (value) => object(value) as unknown as ArtifactBase
  );
}

async function localCredentials(home: string): Promise<ArtifactBase[]> {
  const directory = join(home, 'identities');
  if (!existsSync(directory)) return [];
  const files = (await readdir(directory)).filter((file) => file.endsWith('.json')).sort();
  return Promise.all(
    files.map(async (file) => {
      const record = object(
        await readJson(join(directory, file), 'Identity file was not found.')
      ) as unknown as IdentityRecord;
      return record.credential;
    })
  );
}

async function saveArtifact(home: string, artifact: ArtifactBase): Promise<void> {
  await writeJson(artifactFile(home, artifact.id), artifact as unknown as JsonValue);
  const storage = localDatabase(home);
  try {
    if (
      !['delegation', 'request', 'provenance', 'key_status', 'revocation', 'key_rotation'].includes(
        artifact.kind
      )
    )
      throw new CliError('INVALID_INPUT', 'artifact kind is not persistable');
    storage.artifacts.put({
      id: artifact.id,
      kind: artifact.kind as Exclude<ArtifactKind, 'credential'>,
      artifact: artifact as unknown as import('@agent-proof/storage-sqlite').JsonValue,
      issuedAt: artifact.issued_at,
      createdAt: utc()
    });
    if (artifact.kind === 'revocation') {
      const targetType = artifact['target_type'];
      const targetId = artifact['target_id'];
      const effectiveAt = artifact['effective_at'];
      if (
        (targetType !== 'credential' && targetType !== 'key' && targetType !== 'delegation') ||
        typeof targetId !== 'string' ||
        typeof effectiveAt !== 'string'
      )
        throw new CliError('INVALID_INPUT', 'revocation target is invalid');
      storage.artifacts.revoke({
        id: artifact.id,
        targetType,
        targetId,
        effectiveAt,
        artifact: artifact as unknown as import('@agent-proof/storage-sqlite').JsonValue,
        createdAt: utc()
      });
    }
  } finally {
    storage.close();
  }
}

function trustSnapshot(current: CliConfig): JsonObject {
  const roots = current.trustAnchors.map((anchor) => anchor.root);
  const issuerAuthorities = current.trustAnchors.map((anchor) => anchor.issuerAuthority);
  const snapshot = {
    snapshot_id: 'agentctl-local',
    sequence: 1,
    issued_at: '2026-09-01T00:00:00Z',
    expires_at: '2099-01-01T00:00:00Z',
    policy_hash: '',
    max_clock_skew_seconds: 0,
    max_lifetime_seconds: 31_536_000,
    max_chain_depth: 8,
    replay_policy: 'offline-inspection-only',
    issuer_authorities: issuerAuthorities,
    // Local CLI supports offline inspection only; status authority is explicitly absent.
    status_publishers: [],
    roots,
    status_high_water: [],
    archival_policy: {
      historical_verification: 'explicit-snapshot-only',
      minimum_retention_seconds: 1
    }
  } as unknown as JsonObject;
  return { ...snapshot, policy_hash: policyHashFor(snapshot) } as JsonObject;
}

async function writeJson(path: string, value: JsonValue): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  await writeFile(path, `${outputJson(value)}\n`, { encoding: 'utf8', mode: 0o600 });
  await chmod(path, 0o600).catch(() => undefined);
}

async function readJson(path: string, message: string): Promise<JsonValue> {
  if (!existsSync(path)) throw new CliError('NOT_FOUND', message);
  try {
    return JSON.parse(await readFile(path, 'utf8')) as JsonValue;
  } catch {
    throw new CliError('CONFIG_INVALID', `${message} The file is not valid JSON.`);
  }
}

function object(value: JsonValue): JsonObject {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    throw new CliError('CONFIG_INVALID', 'Local state has an invalid object shape.');
  return value as JsonObject;
}

async function config(home: string): Promise<CliConfig> {
  const value = object(
    await readJson(
      join(home, 'config.json'),
      `No local state at ${home}. Run 'agentctl init' first.`
    )
  );
  if (value.version !== 1 || !Array.isArray(value['trustAnchors']))
    throw new CliError('CONFIG_INVALID', 'Local configuration has an unsupported shape.');
  return value as unknown as CliConfig;
}

function parseDuration(value: string): number {
  const match = /^(0|[1-9][0-9]*)(s|m|h|d|w)$/.exec(value);
  if (match === null)
    throw new CliError(
      'USAGE',
      `Invalid duration '${value}'. Use a whole number followed by s, m, h, d, or w.`
    );
  const multipliers: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  const seconds = Number(match[1]) * multipliers[match[2]!]!;
  if (!Number.isSafeInteger(seconds) || seconds > 315_360_000)
    throw new CliError('USAGE', 'Duration must be no more than ten years.');
  return seconds;
}

async function passphrase(args: readonly string[]): Promise<Uint8Array> {
  const file = valueFor(args, '--passphrase-file');
  const value =
    file === undefined
      ? process.env['AGENTCTL_PASSPHRASE']
      : (await readFile(file, 'utf8')).replace(/\r?\n$/, '');
  if (value === undefined || value.length === 0) {
    throw new CliError(
      'KEY_PROTECTION',
      'A passphrase is required. Set AGENTCTL_PASSPHRASE or pass --passphrase-file <path>; it is never logged or emitted.'
    );
  }
  return new TextEncoder().encode(value);
}

function authorityCeiling(args: readonly string[], now: string, expiresAt: string): Constraints {
  const capability = valueFor(args, '--capability') ?? 'identity.read';
  const audience = valueFor(args, '--audience') ?? 'local.agentctl';
  const task = valueFor(args, '--task') ?? '018f219a-3b72-7000-8000-000000000001';
  const resource = valueFor(args, '--resource') ?? 'https://example.invalid/';
  return {
    capabilities: [capability],
    resources: [{ type: resource.startsWith('https://') ? 'uri' : 'opaque', value: resource }],
    tasks: [task],
    audiences: [audience],
    not_before: now,
    expires_at: expiresAt,
    remaining_depth: 0
  };
}

function productName(home: string): string {
  const local = join(home, 'product.json');
  const file = [local, ...repositoryProductConfigs].find(existsSync);
  if (file === undefined) return DEFAULT_PRODUCT_NAME;
  try {
    const value = JSON.parse(requireText(file)) as { displayName?: unknown };
    return typeof value.displayName === 'string' && value.displayName.length > 0
      ? value.displayName
      : DEFAULT_PRODUCT_NAME;
  } catch {
    return DEFAULT_PRODUCT_NAME;
  }
}
function requireText(path: string): string {
  // Synchronous product metadata is public display configuration, not key material.
  return readFileSync(path, 'utf8');
}

function emit(args: readonly string[], value: JsonValue, human: string): void {
  process.stdout.write(has(args, '--json') ? `${outputJson(value)}\n` : `${human}\n`);
}

async function init(args: readonly string[]): Promise<void> {
  const home = appHome(args);
  const path = join(home, 'config.json');
  if (existsSync(path) && !has(args, '--force'))
    throw new CliError(
      'ALREADY_INITIALIZED',
      `Already initialized at ${home}. Use --force only if you intend to replace local configuration.`
    );
  const displayName = valueFor(args, '--product-name') ?? productName(home);
  await writeJson(join(home, 'product.json'), { displayName });
  await writeJson(path, { version: 1, trustAnchors: [] });
  emit(
    args,
    { home, initialized: true, productName: displayName },
    `Initialized ${displayName} local state at ${home}.`
  );
}

async function createDevIdentity(args: readonly string[]): Promise<void> {
  if (!has(args, '--dev-self-issue')) {
    throw new CliError(
      'ISSUER_REQUIRED',
      'identity create requires the configured local API issuer. For isolated fixtures only, pass --dev-self-issue; it never adds trust automatically.'
    );
  }
  const home = appHome(args);
  await config(home);
  const passphraseBytes = await passphrase(args);
  const now = utc();
  const expiresAt = utc(
    new Date(Date.now() + parseDuration(valueFor(args, '--expires-in') ?? '30d') * 1000)
  );
  let agentId: AgentId;
  try {
    agentId = parseAgentId(required(args, '--agent'));
  } catch (error) {
    throw new CliError(
      'INVALID_INPUT',
      error instanceof Error ? error.message : 'Agent ID is invalid.'
    );
  }
  const subject: Principal = { type: 'agent', id: agentId };
  const issuer: Principal = {
    type: 'service',
    id: valueFor(args, '--issuer') ?? 'dev-local-issuer'
  };
  const provider = new EncryptedFilesystemKeyProvider(
    join(home, 'keys'),
    passphraseBytes,
    new SystemRandomSource()
  );
  const issuerKey = await provider.create();
  const subjectKey = await provider.create();
  const unsigned = {
    version: 'agent-proof/v1',
    kind: 'credential',
    id: '',
    issued_at: now,
    proof: { alg: 'Ed25519', kid: issuerKey.keyId, sig: 'A'.repeat(86) },
    issuer,
    subject,
    public_jwk: subjectKey.publicJwk,
    key_id: subjectKey.keyId,
    not_before: now,
    expires_at: expiresAt,
    credential_purpose: 'agent-root-authority',
    authority_ceiling: {
      ...authorityCeiling(args, now, expiresAt),
      remaining_depth: Number(valueFor(args, '--depth') ?? '0')
    }
  } as unknown as ArtifactBase;
  const id = artifactIdFor(unsigned);
  const provisional = { ...unsigned, id } as ArtifactBase;
  const signature = Buffer.from(
    await provider.sign(issuerKey.reference, signingInputFor(provisional))
  ).toString('base64url');
  const credential = {
    ...provisional,
    proof: { alg: 'Ed25519', kid: issuerKey.keyId, sig: signature }
  } as ArtifactBase;
  const issuerAuthority = {
    principal: issuer,
    key_id: issuerKey.keyId,
    public_jwk: issuerKey.publicJwk
  };
  const record: IdentityRecord = {
    credential,
    issuerAuthority,
    issuerKeyReference: issuerKey.reference,
    subjectKeyReference: subjectKey.reference
  };
  await writeJson(identityFile(home, id), record as unknown as JsonValue);
  emit(
    args,
    { credential, issuerAuthority, identityFile: identityFile(home, id) } as unknown as JsonValue,
    `Created development-only identity ${formatAgentId(subject.id as AgentId)}\nCredential: ${id}\nKey: ${subjectKey.keyId}\nExpires: ${expiresAt}\nTrust: not added`
  );
}

async function inspectIdentity(args: readonly string[]): Promise<void> {
  const home = appHome(args);
  const id = required(args, '--id');
  const record = object(
    await readJson(identityFile(home, id), `Identity '${id}' was not found in ${home}.`)
  ) as unknown as IdentityRecord;
  const subject = record.credential['subject'] as unknown as Principal;
  if (subject.type !== 'agent' || !validAgentId(subject.id as JsonValue))
    throw new CliError('CONFIG_INVALID', 'Stored identity has an invalid agent subject.');
  emit(
    args,
    {
      credential: record.credential,
      issuerAuthority: record.issuerAuthority
    } as unknown as JsonValue,
    `Identity: ${formatAgentId(subject.id as AgentId)}\nCredential: ${record.credential.id}\nKey: ${String(record.credential['key_id'])}\nExpires: ${String(record.credential['expires_at'])}`
  );
}

async function delegateCreate(args: readonly string[]): Promise<void> {
  const home = appHome(args);
  await config(home);
  const identity = await credentialRecord(home, required(args, '--identity'));
  const delegate = { type: 'agent' as const, id: parseAgentId(required(args, '--delegate')) };
  const keyReference = identity.subjectKeyReference;
  if (keyReference === undefined)
    throw new CliError(
      'KEY_UNAVAILABLE',
      'Identity has no local signing key; it cannot create a delegation.'
    );
  const now = utc();
  const expiresAt = utc(
    new Date(Date.now() + parseDuration(valueFor(args, '--expires-in') ?? '1h') * 1000)
  );
  const provider = new EncryptedFilesystemKeyProvider(
    join(home, 'keys'),
    await passphrase(args),
    new SystemRandomSource()
  );
  const artifact = await createDelegation(provider, {
    issuedAt: now,
    delegator: principalFor(identity),
    delegate,
    parentRef: { id: identity.credential.id, kind: 'credential' },
    constraints: {
      ...authorityCeiling(args, now, expiresAt),
      expires_at: identity.credential['expires_at'] as string,
      remaining_depth: Number(valueFor(args, '--depth') ?? '0')
    },
    signingReference: keyReference
  });
  await saveArtifact(home, artifact);
  emit(args, { delegation: artifact } as unknown as JsonValue, `Delegation: ${artifact.id}`);
}

async function delegateInspect(args: readonly string[]): Promise<void> {
  const artifact = await readArtifact(appHome(args), required(args, '--id'));
  if (artifact.kind !== 'delegation')
    throw new CliError('INVALID_INPUT', 'Artifact is not a delegation.');
  emit(args, { delegation: artifact } as unknown as JsonValue, `Delegation: ${artifact.id}`);
}

async function requestSign(args: readonly string[]): Promise<void> {
  const home = appHome(args);
  await config(home);
  const delegation = await readArtifact(home, required(args, '--delegation'));
  if (delegation.kind !== 'delegation')
    throw new CliError('INVALID_INPUT', 'Artifact is not a delegation.');
  const delegateId = delegation['delegate'] as Principal;
  if (delegateId.type !== 'agent')
    throw new CliError('INVALID_INPUT', 'Delegation delegate must be an agent.');
  const identityId = valueFor(args, '--identity');
  if (identityId === undefined)
    throw new CliError(
      'USAGE',
      'request sign requires --identity for the delegate signing identity.'
    );
  const identity = await credentialRecord(home, identityId);
  const keyReference = identity.subjectKeyReference;
  if (keyReference === undefined)
    throw new CliError(
      'KEY_UNAVAILABLE',
      'Identity has no local signing key; it cannot sign a request.'
    );
  const now = utc();
  const expiresAt = utc(
    new Date(Date.now() + parseDuration(valueFor(args, '--expires-in') ?? '5m') * 1000)
  );
  const action = valueFor(args, '--action') ?? valueFor(args, '--capability') ?? 'identity.read';
  const provider = new EncryptedFilesystemKeyProvider(
    join(home, 'keys'),
    await passphrase(args),
    new SystemRandomSource()
  );
  const request = await createRequest(provider, new SystemRandomSource(), {
    issuedAt: now,
    requestId: uuidV7(),
    signer: principalFor(identity),
    delegationRef: { id: delegation.id, kind: 'delegation' },
    notBefore: now,
    expiresAt,
    action,
    resource: resource(valueFor(args, '--resource') ?? 'https://example.invalid/'),
    task: valueFor(args, '--task') ?? '018f219a-3b72-7000-8000-000000000001',
    audience: valueFor(args, '--audience') ?? 'local.agentctl',
    payloadDigest: digest(valueFor(args, '--payload') ?? ''),
    taskContextDigest: digest(valueFor(args, '--task-context') ?? ''),
    signingReference: keyReference
  });
  await saveArtifact(home, request);
  emit(args, { request } as unknown as JsonValue, `Request: ${request.id}`);
}

async function verifyArtifact(
  args: readonly string[],
  expectedKind: 'delegation' | 'request'
): Promise<void> {
  const home = appHome(args);
  const target = await readArtifact(home, required(args, '--id'));
  if (target.kind !== expectedKind)
    throw new CliError('INVALID_INPUT', `Artifact is not a ${expectedKind}.`);
  const storage = localDatabase(home);
  try {
    const stored = (
      storage.artifacts.list() as readonly {
        artifact: import('@agent-proof/storage-sqlite').JsonValue;
      }[]
    ).map((record) => record.artifact as unknown as ArtifactBase);
    if (expectedKind === 'delegation') {
      const parentRef = asRecord(target['parent_ref'] as JsonValue);
      const credentials = await localCredentials(home);
      const root = credentials.find((credential) => credential.id === parentRef['id']);
      if (root === undefined)
        throw new CliError('NOT_FOUND', 'Delegation credential evidence was not found.');
      const result = verifyDelegationChain({
        rootCredential: root,
        keyBindingCredentials: credentials.filter((credential) => credential.id !== root.id),
        delegations: [
          target,
          ...stored.filter(
            (artifact) => artifact.kind === 'delegation' && artifact.id !== target.id
          )
        ],
        statusEvidence: stored.filter(
          (artifact) =>
            artifact.kind === 'key_status' ||
            artifact.kind === 'revocation' ||
            artifact.kind === 'key_rotation'
        ),
        trustSnapshot: trustSnapshot(await config(home)),
        now: new Date(),
        offlineInspection: true
      });
      emit(args, result as unknown as JsonValue, `${result.code}: ${target.id}`);
      return;
    }
    if (expectedKind === 'request') {
      const delegationRef = asRecord(target['delegation_ref'] as JsonValue);
      const delegation = stored.find((artifact) => artifact.id === delegationRef['id']);
      if (delegation === undefined || delegation.kind !== 'delegation')
        throw new CliError('NOT_FOUND', 'Request delegation evidence was not found.');
      const parentRef = asRecord(delegation['parent_ref'] as JsonValue);
      const credentials = await localCredentials(home);
      const root = credentials.find((credential) => credential.id === parentRef['id']);
      const signer = credentials.find(
        (credential) =>
          canonicalize(credential['subject'] as JsonValue) ===
          canonicalize(target['signer'] as JsonValue)
      );
      if (root === undefined || signer === undefined)
        throw new CliError('NOT_FOUND', 'Request credential evidence was not found.');
      const artifacts = [
        root,
        ...(signer.id === root.id ? [] : [signer]),
        delegation,
        target,
        ...stored.filter(
          (artifact) => artifact.kind === 'key_status' || artifact.kind === 'revocation'
        )
      ];
      const result = verifyArtifacts({
        artifacts,
        trustSnapshot: trustSnapshot(await config(home)),
        context: {
          audience: String(target['audience']),
          action: String(target['action']),
          resource: target['resource'] as never,
          task: String(target['task']),
          expectedSigner: target['signer'] as never,
          expectedPayloadDigest: String(target['payload_digest']),
          expectedTaskContextDigest: String(target['task_context_digest']),
          replayRequired: false
        },
        now: new Date(),
        replayMode: 'offline'
      });
      emit(args, result as unknown as JsonValue, `${result.code}: ${target.id}`);
      return;
    }
    throw new CliError('INVALID_INPUT', 'Unsupported artifact verification target.');
  } finally {
    storage.close();
  }
}

async function revoke(args: readonly string[]): Promise<void> {
  await credentialRecord(appHome(args), required(args, '--identity'));
  required(args, '--type');
  required(args, '--target');
  throw new CliError(
    'STATUS_AUTHORITY_REQUIRED',
    'revoke requires a separately configured status authority. The local offline-inspection profile never treats an identity issuer key as a status publisher.'
  );
}

async function revoked(args: readonly string[]): Promise<void> {
  const home = appHome(args);
  const targetId = required(args, '--target');
  const storage = localDatabase(home);
  try {
    const records = storage.artifacts.listRevocations(targetId);
    emit(
      args,
      { revoked: records.length > 0, records } as unknown as JsonValue,
      records.length > 0 ? 'revoked' : 'not revoked'
    );
  } finally {
    storage.close();
  }
}

async function identityRotate(args: readonly string[]): Promise<void> {
  await credentialRecord(appHome(args), required(args, '--id'));
  throw new CliError(
    'LIFECYCLE_UNAVAILABLE',
    'identity rotate is disabled until it can atomically issue a new key-binding credential and preserve key-status history.'
  );
}

async function provenanceInspect(args: readonly string[]): Promise<void> {
  const home = appHome(args);
  const storage = localDatabase(home);
  try {
    const graph = storage.provenance.graph(valueFor(args, '--id'));
    emit(args, graph as unknown as JsonValue, `Provenance nodes: ${graph.nodes.length}`);
  } finally {
    storage.close();
  }
}

async function provenanceExport(args: readonly string[]): Promise<void> {
  const home = appHome(args);
  const storage = localDatabase(home);
  try {
    const graph = storage.provenance.graph(valueFor(args, '--id'));
    const output = required(args, '--output');
    await writeJson(resolve(output), graph as unknown as JsonValue);
    emit(
      args,
      { output: resolve(output), graph } as unknown as JsonValue,
      `Exported provenance to ${resolve(output)}`
    );
  } finally {
    storage.close();
  }
}

async function trustAdd(args: readonly string[]): Promise<void> {
  if (!has(args, '--dev-self-issue'))
    throw new CliError(
      'TRUST_POLICY_REQUIRED',
      'Trust anchors must come from configured policy. --dev-self-issue permits adding a locally generated fixture anchor only.'
    );
  const home = appHome(args);
  const current = await config(home);
  const id = required(args, '--identity');
  const record = object(
    await readJson(identityFile(home, id), `Identity '${id}' was not found in ${home}.`)
  ) as unknown as IdentityRecord;
  if (current.trustAnchors.some((anchor) => anchor.credentialId === id))
    throw new CliError('ALREADY_EXISTS', `Trust anchor '${id}' already exists.`);
  const credential = record.credential;
  const anchor: TrustAnchor = {
    credentialId: id,
    issuerAuthority: record.issuerAuthority,
    root: {
      issuer: credential['issuer'] as unknown as Principal,
      root_subject: credential['subject'] as unknown as Principal,
      credential_purpose: 'agent-root-authority'
    }
  };
  const trustAnchors = [...current.trustAnchors, anchor].sort((left, right) =>
    left.credentialId.localeCompare(right.credentialId)
  );
  await writeJson(join(home, 'config.json'), { version: 1, trustAnchors } as unknown as JsonValue);
  emit(
    args,
    { added: id, trustAnchors: trustAnchors.length },
    `Added development fixture trust anchor ${id}.`
  );
}

async function trustList(args: readonly string[]): Promise<void> {
  const anchors = (await config(appHome(args))).trustAnchors;
  emit(
    args,
    { trustAnchors: anchors } as unknown as JsonValue,
    anchors.length === 0
      ? 'No trust anchors configured.'
      : anchors.map((anchor) => anchor.credentialId).join('\n')
  );
}

function usage(): string {
  return `Usage: agentctl [--home <dir>] [--json] <command>\n\nCommands:\n  init [--product-name <name>]\n  identity create --agent agid:v1:<authority>/<path> --dev-self-issue [--expires-in 30d]\n  identity inspect|rotate --id <credential-id>\n  delegate create --identity <credential-id> --delegate agid:v1:<authority>/<path> [--capability <action>]\n  delegate inspect|verify --id <delegation-id>\n  request sign --identity <credential-id> --delegation <delegation-id> [--action <action>]\n  request verify --id <request-id>\n  revoke --identity <credential-id> --type credential|key|delegation --target <id>\n  revoked --target <id>\n  trust add --identity <credential-id> --dev-self-issue\n  trust list\n  provenance inspect [--id <artifact-id>]\n  provenance export [--id <artifact-id>] --output <file>`;
}

export async function run(argv: readonly string[] = process.argv.slice(2)): Promise<number> {
  const flagsWithValues = new Set([
    '--home',
    '--product-name',
    '--passphrase-file',
    '--expires-in',
    '--agent',
    '--issuer',
    '--task',
    '--resource',
    '--audience',
    '--capability',
    '--id',
    '--identity',
    '--delegate',
    '--delegation',
    '--action',
    '--payload',
    '--task-context',
    '--type',
    '--target',
    '--reason',
    '--depth',
    '--output'
  ]);
  const command: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index]!;
    if (flagsWithValues.has(token)) {
      index += 1;
      continue;
    }
    if (!token.startsWith('--')) command.push(token);
  }
  if (command.length === 0 || has(argv, '--help') || has(argv, '-h')) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  try {
    if (command[0] === 'init' && command.length === 1) await init(argv);
    else if (command[0] === 'identity' && command[1] === 'create') await createDevIdentity(argv);
    else if (command[0] === 'identity' && command[1] === 'inspect') await inspectIdentity(argv);
    else if (command[0] === 'identity' && command[1] === 'rotate') await identityRotate(argv);
    else if (command[0] === 'delegate' && command[1] === 'create') await delegateCreate(argv);
    else if (command[0] === 'delegate' && command[1] === 'inspect') await delegateInspect(argv);
    else if (command[0] === 'delegate' && command[1] === 'verify')
      await verifyArtifact(argv, 'delegation');
    else if (command[0] === 'request' && command[1] === 'sign') await requestSign(argv);
    else if (command[0] === 'request' && command[1] === 'verify')
      await verifyArtifact(argv, 'request');
    else if (command[0] === 'revoke' && command.length === 1) await revoke(argv);
    else if (command[0] === 'revoked' && command.length === 1) await revoked(argv);
    else if (command[0] === 'provenance' && command[1] === 'inspect') await provenanceInspect(argv);
    else if (command[0] === 'provenance' && command[1] === 'export') await provenanceExport(argv);
    else if (command[0] === 'trust' && command[1] === 'add') await trustAdd(argv);
    else if (command[0] === 'trust' && command[1] === 'list') await trustList(argv);
    else throw new CliError('USAGE', `Unknown command '${command.join(' ')}'.\n${usage()}`);
    return 0;
  } catch (error) {
    const known =
      error instanceof CliError ? error : new CliError('INTERNAL', 'Unexpected command failure.');
    if (has(argv, '--json'))
      process.stderr.write(
        `${outputJson({ error: { code: known.code, message: known.message, details: [] } })}\n`
      );
    else process.stderr.write(`agentctl: ${known.message}\n`);
    return known.code === 'INTERNAL' ? 1 : 2;
  }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void run().then((code) => {
    process.exitCode = code;
  });
}

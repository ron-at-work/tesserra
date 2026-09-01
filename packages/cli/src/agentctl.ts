#!/usr/bin/env node
import { chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { EncryptedFilesystemKeyProvider, SystemRandomSource } from '@agent-proof/crypto-local';
import {
  artifactIdFor,
  canonicalize,
  isTimestamp,
  signingInputFor,
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
  return value;
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
    authority_ceiling: authorityCeiling(args, now, expiresAt)
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
    issuerKeyReference: issuerKey.reference
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
  return `Usage: agentctl [--home <dir>] [--json] <command>\n\nCommands:\n  init [--product-name <name>]\n  identity create --agent agid:v1:<authority>/<path> --dev-self-issue [--expires-in 30d] [--passphrase-file <path>]\n  identity inspect --id <credential-id>\n  trust add --identity <credential-id> --dev-self-issue\n  trust list`;
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
    '--identity'
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
    else if (command[0] === 'identity' && command[1] === 'rotate')
      throw new CliError(
        'UNSUPPORTED',
        'identity rotate is unavailable until the Phase 4 lifecycle contract is implemented.'
      );
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

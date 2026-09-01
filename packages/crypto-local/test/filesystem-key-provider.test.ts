import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'vitest';
import { verify as verifySignature, createPublicKey, type JsonWebKey } from 'node:crypto';
import { EncryptedFilesystemKeyProvider, SystemRandomSource } from '../src/index.js';

test('encrypted filesystem provider signs without persisting plaintext private keys', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-proof-key-'));
  try {
    const provider = new EncryptedFilesystemKeyProvider(
      directory,
      new TextEncoder().encode('test unlock material'),
      new SystemRandomSource()
    );
    const created = await provider.create();
    const message = new TextEncoder().encode('message');
    const signature = await provider.sign(created.reference, message);
    assert(
      verifySignature(
        null,
        message,
        createPublicKey({ key: created.publicJwk as JsonWebKey, format: 'jwk' }),
        signature
      )
    );
    const sealed = await readFile(join(directory, `${created.reference}.key`), 'utf8');
    assert(!sealed.includes('"d"'));
    assert(!sealed.includes('test unlock material'));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('rejects tampered authenticated metadata and copied key references', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'agent-proof-key-'));
  try {
    const provider = new EncryptedFilesystemKeyProvider(
      directory,
      new TextEncoder().encode('test unlock material'),
      new SystemRandomSource()
    );
    const created = await provider.create();
    const source = join(directory, `${created.reference}.key`);
    const original = await readFile(source, 'utf8');
    const second = await provider.create();
    await writeFile(join(directory, `${second.reference}.key`), original, { mode: 0o600 });
    await assert.rejects(provider.publicKey(second.reference), /authenticate|match/i);

    const sealed = JSON.parse(original) as { public_jwk: { x: string } };
    sealed.public_jwk.x = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    await writeFile(source, `${JSON.stringify(sealed)}\n`, { mode: 0o600 });
    await assert.rejects(
      provider.sign(created.reference, new Uint8Array([1])),
      /authenticate|Unsupported|match/i
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

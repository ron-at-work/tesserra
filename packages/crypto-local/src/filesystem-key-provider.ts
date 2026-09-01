import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  generateKeyPairSync,
  randomBytes,
  scrypt as scryptCallback
} from 'node:crypto';
import { mkdir, readFile, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  canonicalBytes,
  encodeBase64Url,
  decodeBase64Url,
  keyIdFor,
  type PublicJwk
} from '@agent-proof/protocol';
import type { KeyProvider, RandomSource } from '@agent-proof/core';

const derive = (passphrase: Uint8Array, salt: Uint8Array): Promise<Buffer> =>
  new Promise((resolve, reject) =>
    scryptCallback(passphrase, salt, 32, SCRYPT, (error, key) =>
      error ? reject(error) : resolve(Buffer.from(key))
    )
  );
const FORMAT = 'agent-proof/local-key/v1' as const;
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;
interface SealedKey {
  readonly format: typeof FORMAT;
  readonly kdf: 'scrypt';
  readonly salt: string;
  readonly nonce: string;
  readonly ciphertext: string;
  readonly tag: string;
  readonly public_jwk: PublicJwk;
}
interface PrivateJwk {
  readonly kty: 'OKP';
  readonly crv: 'Ed25519';
  readonly x: string;
  d: string;
  [key: string]: string | undefined;
}

/** Node's system CSPRNG, supplied explicitly to preserve the RandomSource boundary. */
export class SystemRandomSource implements RandomSource {
  bytes(length: number): Uint8Array {
    return randomBytes(length);
  }
}

/** Encrypted filesystem provider. It never exports or logs private key bytes. */
export class EncryptedFilesystemKeyProvider implements KeyProvider {
  constructor(
    private readonly directory: string,
    private readonly passphrase: Uint8Array,
    private readonly random: RandomSource
  ) {}

  async create(): Promise<{
    readonly reference: string;
    readonly keyId: string;
    readonly publicJwk: PublicJwk;
  }> {
    await this.ensureDirectory();
    const pair = generateKeyPairSync('ed25519');
    const privateJwk = pair.privateKey.export({ format: 'jwk' }) as PrivateJwk;
    const publicJwk = pair.publicKey.export({ format: 'jwk' }) as PublicJwk;
    const reference = encodeBase64Url(this.random.bytes(32));
    await this.writeSealed(reference, privateJwk, publicJwk);
    return { reference, keyId: keyIdFor(publicJwk), publicJwk };
  }

  async sign(reference: string, message: Uint8Array): Promise<Uint8Array> {
    const sealed = await this.readSealed(reference);
    const privateJwk = await this.unseal(reference, sealed);
    const { sign } = await import('node:crypto');
    try {
      return sign(null, message, createPrivateKey({ key: privateJwk, format: 'jwk' }));
    } finally {
      zeroPrivateJwk(privateJwk);
    }
  }

  async publicKey(reference: string): Promise<PublicJwk | undefined> {
    try {
      const sealed = await this.readSealed(reference);
      const privateJwk = await this.unseal(reference, sealed);
      zeroPrivateJwk(privateJwk);
      return sealed.public_jwk;
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }

  async rotate(reference: string): Promise<{
    readonly retiredReference: string;
    readonly reference: string;
    readonly keyId: string;
    readonly publicJwk: PublicJwk;
  }> {
    await this.readSealed(reference); // Refuse rotation from an unknown reference.
    const created = await this.create();
    return { retiredReference: reference, ...created };
  }

  private async writeSealed(
    reference: string,
    privateJwk: PrivateJwk,
    publicJwk: PublicJwk
  ): Promise<void> {
    const salt = this.random.bytes(16);
    const nonce = this.random.bytes(12);
    const key = await deriveKey(this.passphrase, salt);
    const plaintext = Buffer.from(JSON.stringify(privateJwk), 'utf8');
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    cipher.setAAD(aad(reference, publicJwk));
    try {
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const sealed: SealedKey = {
        format: FORMAT,
        kdf: 'scrypt',
        salt: encodeBase64Url(salt),
        nonce: encodeBase64Url(nonce),
        ciphertext: encodeBase64Url(ciphertext),
        tag: encodeBase64Url(cipher.getAuthTag()),
        public_jwk: publicJwk
      };
      await atomicWrite(this.pathFor(reference), `${JSON.stringify(sealed)}\n`, this.random);
    } finally {
      key.fill(0);
      plaintext.fill(0);
      zeroPrivateJwk(privateJwk);
    }
  }

  private async unseal(reference: string, sealed: SealedKey): Promise<PrivateJwk> {
    const salt = decodeBase64Url(sealed.salt, 16);
    const nonce = decodeBase64Url(sealed.nonce, 12);
    const tag = decodeBase64Url(sealed.tag, 16);
    const ciphertext = decodeBase64Url(sealed.ciphertext);
    const key = await deriveKey(this.passphrase, salt);
    let plaintext: Buffer | undefined;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, nonce);
      decipher.setAAD(aad(reference, sealed.public_jwk));
      decipher.setAuthTag(tag);
      plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
      const value = JSON.parse(plaintext.toString('utf8')) as PrivateJwk;
      if (
        value.kty !== 'OKP' ||
        value.crv !== 'Ed25519' ||
        typeof value.x !== 'string' ||
        typeof value.d !== 'string'
      )
        throw new Error('Invalid encrypted private key');
      if (
        value.x !== sealed.public_jwk.x ||
        keyIdFor({ kty: 'OKP', crv: 'Ed25519', x: value.x }) !== keyIdFor(sealed.public_jwk)
      )
        throw new Error('Encrypted private key does not match public key');
      return value;
    } finally {
      key.fill(0);
      plaintext?.fill(0);
    }
  }

  private async readSealed(reference: string): Promise<SealedKey> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(reference)) throw new Error('Invalid key reference');
    const path = this.pathFor(reference);
    const metadata = await stat(path);
    if (!metadata.isFile() || (metadata.mode & 0o077) !== 0)
      throw new Error('Unsafe key file permissions');
    const value = JSON.parse(await readFile(path, 'utf8')) as SealedKey;
    if (value.format !== FORMAT || value.kdf !== 'scrypt' || !value.public_jwk)
      throw new Error('Unsupported encrypted key format');
    decodeBase64Url(value.salt, 16);
    decodeBase64Url(value.nonce, 12);
    decodeBase64Url(value.tag, 16);
    decodeBase64Url(value.ciphertext);
    return value;
  }
  private pathFor(reference: string): string {
    return join(this.directory, `${reference}.key`);
  }
  private async ensureDirectory(): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const metadata = await stat(this.directory);
    if (!metadata.isDirectory() || (metadata.mode & 0o077) !== 0)
      throw new Error('Unsafe key directory permissions');
  }
}
async function deriveKey(passphrase: Uint8Array, salt: Uint8Array): Promise<Buffer> {
  return derive(passphrase, salt);
}
async function atomicWrite(path: string, content: string, random: RandomSource): Promise<void> {
  const temporary = join(
    dirname(path),
    `.${basename(path)}.${encodeBase64Url(random.bytes(12))}.tmp`
  );
  try {
    await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await rename(temporary, path);
  } finally {
    await unlink(temporary).catch(() => undefined);
  }
}
function aad(reference: string, publicJwk: PublicJwk): Uint8Array {
  return canonicalBytes({
    format: FORMAT,
    kdf: 'scrypt',
    reference,
    public_jwk: publicJwk as unknown as import('@agent-proof/protocol').JsonObject
  });
}
function zeroPrivateJwk(value: PrivateJwk): void {
  value.d = '';
}
function isNotFound(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

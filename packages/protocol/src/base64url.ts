const BASE64URL = /^[A-Za-z0-9_-]*$/;
export function decodeBase64Url(value: string, expectedLength?: number): Uint8Array {
  if (!BASE64URL.test(value) || value.includes('=') || value.length % 4 === 1)
    throw new TypeError('Invalid base64url');
  const bytes = Uint8Array.from(Buffer.from(value, 'base64url'));
  if (encodeBase64Url(bytes) !== value) throw new TypeError('Non-canonical base64url');
  if (expectedLength !== undefined && bytes.length !== expectedLength)
    throw new TypeError('Unexpected base64url length');
  return bytes;
}
export function encodeBase64Url(value: Uint8Array): string {
  return Buffer.from(value).toString('base64url');
}
export function isCanonicalBase64Url(value: unknown, expectedLength?: number): value is string {
  try {
    return typeof value === 'string' && (decodeBase64Url(value, expectedLength), true);
  } catch {
    return false;
  }
}

import type { JsonObject, JsonValue } from './types.js';

/** RFC 8785 canonical JSON for already validated I-JSON values. */
export function canonicalize(value: JsonValue): string {
  if (value === null) return 'null';
  switch (typeof value) {
    case 'boolean':
      return value ? 'true' : 'false';
    case 'string':
      assertUnicodeScalars(value);
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value) || (!Number.isSafeInteger(value) && Number.isInteger(value)))
        throw new TypeError('Non-I-JSON number');
      return Object.is(value, -0) ? '0' : JSON.stringify(value);
    case 'object': {
      if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
      const object = value as { readonly [key: string]: JsonValue | readonly JsonValue[] };
      return `{${Object.keys(object)
        .sort()
        .map((key) => {
          assertUnicodeScalars(key);
          return `${JSON.stringify(key)}:${canonicalize(object[key]! as JsonValue)}`;
        })
        .join(',')}}`;
    }
  }
}
export function canonicalBytes(value: JsonValue): Uint8Array {
  return new TextEncoder().encode(canonicalize(value));
}
export function assertUnicodeScalars(value: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const low = value.charCodeAt(index + 1);
      if (Number.isNaN(low) || low < 0xdc00 || low > 0xdfff)
        throw new TypeError('Unpaired surrogate');
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new TypeError('Unpaired surrogate');
  }
}
export function omit<T extends JsonObject>(value: T, keys: readonly string[]): JsonObject {
  const omitted = new Set(keys);
  return Object.fromEntries(
    Object.entries(value).filter(([key]) => !omitted.has(key))
  ) as JsonObject;
}

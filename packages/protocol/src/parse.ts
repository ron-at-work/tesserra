import { assertUnicodeScalars } from './canonical.js';
import type { JsonValue } from './types.js';

export type ParseFailure =
  'MALFORMED_UTF8' | 'MALFORMED_JSON' | 'DUPLICATE_MEMBER' | 'SCHEMA_INVALID';
export class StrictJsonError extends Error {
  constructor(
    readonly code: ParseFailure,
    message: string
  ) {
    super(message);
  }
}

/** Decodes exactly one BOM-free UTF-8 JSON value and rejects duplicate object members. */
export function parseStrictJson(input: Uint8Array): JsonValue {
  let source: string;
  try {
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
  } catch {
    throw new StrictJsonError('MALFORMED_UTF8', 'Input is not UTF-8');
  }
  if (source.charCodeAt(0) === 0xfeff)
    throw new StrictJsonError('MALFORMED_UTF8', 'UTF-8 BOM is forbidden');
  try {
    scanForDuplicateMembers(source);
  } catch (error) {
    if (error instanceof StrictJsonError) throw error;
    throw new StrictJsonError('MALFORMED_JSON', 'Malformed JSON');
  }
  let result: JsonValue;
  try {
    result = JSON.parse(source) as JsonValue;
  } catch {
    throw new StrictJsonError('MALFORMED_JSON', 'Malformed JSON');
  }
  try {
    assertIJson(result);
  } catch (error) {
    if (error instanceof Error && error.message.includes('surrogate'))
      throw new StrictJsonError('MALFORMED_JSON', 'Unpaired surrogate');
    throw new StrictJsonError('MALFORMED_JSON', 'Value is not I-JSON');
  }
  return result;
}

function assertIJson(value: JsonValue): void {
  if (typeof value === 'string') assertUnicodeScalars(value);
  else if (
    typeof value === 'number' &&
    (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
  )
    throw new TypeError('Non-I-JSON number');
  else if (Array.isArray(value)) value.forEach(assertIJson);
  else if (value !== null && typeof value === 'object')
    Object.entries(value).forEach(([key, nested]) => {
      assertUnicodeScalars(key);
      assertIJson(nested);
    });
}

function scanForDuplicateMembers(source: string): void {
  let position = 0;
  const whitespace = /[ \n\r\t]/;
  const skip = (): void => {
    while (position < source.length && whitespace.test(source[position]!)) position += 1;
  };
  const string = (): string => {
    if (source[position] !== '"') throw new StrictJsonError('MALFORMED_JSON', 'Expected string');
    const start = position++;
    let escaped = false;
    while (position < source.length) {
      const char = source[position++]!;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === '\\') {
        escaped = true;
        continue;
      }
      if (char === '"') {
        try {
          return JSON.parse(source.slice(start, position)) as string;
        } catch {
          throw new StrictJsonError('MALFORMED_JSON', 'Invalid string');
        }
      }
      if (char.charCodeAt(0) < 0x20)
        throw new StrictJsonError('MALFORMED_JSON', 'Control character in string');
    }
    throw new StrictJsonError('MALFORMED_JSON', 'Unterminated string');
  };
  const literal = (): void => {
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(
      source.slice(position)
    );
    if (!match) throw new StrictJsonError('MALFORMED_JSON', 'Invalid literal');
    position += match[0].length;
  };
  const value = (): void => {
    skip();
    if (source[position] === '{') {
      position += 1;
      skip();
      const members = new Set<string>();
      if (source[position] === '}') {
        position += 1;
        return;
      }
      while (true) {
        skip();
        const key = string();
        assertUnicodeScalars(key);
        if (members.has(key))
          throw new StrictJsonError('DUPLICATE_MEMBER', `Duplicate member ${key}`);
        members.add(key);
        skip();
        if (source[position++] !== ':')
          throw new StrictJsonError('MALFORMED_JSON', 'Expected colon');
        value();
        skip();
        if (source[position] === '}') {
          position += 1;
          return;
        }
        if (source[position++] !== ',')
          throw new StrictJsonError('MALFORMED_JSON', 'Expected comma');
      }
    }
    if (source[position] === '[') {
      position += 1;
      skip();
      if (source[position] === ']') {
        position += 1;
        return;
      }
      while (true) {
        value();
        skip();
        if (source[position] === ']') {
          position += 1;
          return;
        }
        if (source[position++] !== ',')
          throw new StrictJsonError('MALFORMED_JSON', 'Expected comma');
      }
    }
    if (source[position] === '"') {
      string();
      return;
    }
    literal();
  };
  skip();
  value();
  skip();
  if (position !== source.length) throw new StrictJsonError('MALFORMED_JSON', 'Trailing content');
}

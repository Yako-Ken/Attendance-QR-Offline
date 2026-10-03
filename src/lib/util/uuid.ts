/**
 * RFC 4122 version 4 identifiers.
 *
 * `crypto.randomUUID()` is only exposed in secure contexts, and `crypto` itself
 * is only guaranteed in secure contexts in some engines. We therefore fall back
 * to `crypto.getRandomValues`, which has a much wider support baseline. If even
 * that is unavailable we refuse rather than emit a weak or predictable value.
 */

const HEX = '0123456789abcdef';

/** Canonical UUID with version nibble 1-8 and RFC variant. */
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function getCrypto(): Crypto | null {
  const candidate = globalThis.crypto;
  return candidate && typeof candidate.getRandomValues === 'function' ? candidate : null;
}

export function randomUuid(): string {
  const cryptoRef = getCrypto();
  if (cryptoRef === null) {
    throw new Error('No cryptographic random source is available in this browser.');
  }

  if (typeof cryptoRef.randomUUID === 'function') {
    const value = cryptoRef.randomUUID();
    if (isUuid(value)) return value;
  }

  const bytes = new Uint8Array(16);
  cryptoRef.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;

  let out = '';
  for (let i = 0; i < bytes.length; i += 1) {
    const byte = bytes[i] ?? 0;
    out += HEX[byte >> 4] ?? '0';
    out += HEX[byte & 0x0f] ?? '0';
    if (i === 3 || i === 5 || i === 7 || i === 9) out += '-';
  }
  return out;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value);
}

/**
 * Non-narrowing variant, for callers that already hold a `string`. Using the
 * type predicate there would collapse the negative branch to `never`, because
 * `string` minus `string` is empty.
 */
export function isUuidFormat(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Short, human-comparable form used in the UI. Never used as an identifier. */
export function shortId(value: string, keep = 6): string {
  if (!isUuidFormat(value)) return value.slice(0, keep);
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}
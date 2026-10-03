/**
 * Top-level QR encoder (byte mode, error correction level M).
 *
 * Byte mode is the correct choice here: the payload is UTF-8 JSON, which is
 * already a byte stream, so no mode-switching is needed and non-Latin student
 * names encode correctly.
 */

import { BitBuffer, rsEncode } from './galois';
import { buildMatrix, type QrMatrix } from './matrix';
import {
  MAX_VERSION,
  MIN_VERSION,
  blockCount,
  characterCountBits,
  dataCodewords,
  eccCodewordsPerBlock,
} from './spec';

const MODE_BYTE = 4;
const PAD_BYTES: readonly number[] = [0xec, 0x11];

/** Exact byte capacity of a version in byte mode. */
export function byteCapacity(version: number): number {
  const availableBits = dataCodewords(version) * 8 - 4 - characterCountBits(version);
  return Math.max(0, Math.floor(availableBits / 8));
}

export function smallestVersionFor(byteLength: number): number {
  for (let version = MIN_VERSION; version <= MAX_VERSION; version += 1) {
    if (byteCapacity(version) >= byteLength) return version;
  }
  throw new RangeError(`Payload of ${byteLength} bytes exceeds the supported QR range.`);
}

export interface EncodeOptions {
  /**
   * Pin a mask (0-7) instead of evaluating all eight. Useful for tests that
   * need a deterministic symbol; production passes -1.
   */
  readonly mask?: number;
  /**
   * Pin a version instead of choosing the smallest that fits. Used by the
   * differential tests, which must compare like for like.
   */
  readonly version?: number;
}

export function encodeQr(text: string, options: EncodeOptions = {}): QrMatrix {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length === 0) throw new RangeError('Cannot encode an empty payload.');

  const version = options.version ?? smallestVersionFor(bytes.length);
  if (bytes.length > byteCapacity(version)) {
    throw new RangeError(`Payload of ${bytes.length} bytes does not fit QR version ${version}.`);
  }

  const codewords = buildCodewords(bytes, version);
  return buildMatrix(version, codewords, options.mask ?? -1);
}

function buildCodewords(bytes: Uint8Array, version: number): Uint8Array {
  const capacityBits = dataCodewords(version) * 8;
  const buffer = new BitBuffer();

  buffer.append(MODE_BYTE, 4);
  buffer.append(bytes.length, characterCountBits(version));
  for (const byte of bytes) buffer.append(byte, 8);

  if (buffer.length > capacityBits) {
    throw new RangeError('Payload does not fit the selected QR version.');
  }

  // Terminator: up to four zero bits, then pad to a byte boundary.
  buffer.append(0, Math.min(4, capacityBits - buffer.length));
  if (buffer.length % 8 !== 0) buffer.append(0, 8 - (buffer.length % 8));

  const data = buffer.toCodewords();
  const out = new Uint8Array(dataCodewords(version));
  out.set(data.subarray(0, Math.min(data.length, out.length)));

  for (let i = data.length; i < out.length; i += 1) {
    out[i] = PAD_BYTES[(i - data.length) % PAD_BYTES.length] ?? 0;
  }

  return interleaveWithEcc(out, version);
}

/**
 * Split the data codewords into blocks, compute each block's Reed-Solomon
 * parity, then interleave data and parity as the specification requires.
 *
 * ISO/IEC 18004 Table 9 splits the blocks into two groups: group 1 holds the
 * blocks with `floor(total / blocks)` data codewords and comes first, group 2
 * holds the one-codeword-longer blocks. Getting this order wrong is invisible
 * for versions whose blocks are all the same length (1-7 at level M) and
 * corrupts every symbol from version 8 upwards, because the reader reassembles
 * blocks from fixed stream positions.
 */
function interleaveWithEcc(data: Uint8Array, version: number): Uint8Array {
  const totalData = dataCodewords(version);
  const blocks = blockCount(version);
  const eccLength = eccCodewordsPerBlock(version);
  const shortBlockLength = Math.floor(totalData / blocks);
  const longBlockCount = totalData % blocks;
  const shortBlockCount = blocks - longBlockCount;

  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];
  let offset = 0;

  for (let i = 0; i < blocks; i += 1) {
    const length = shortBlockLength + (i < shortBlockCount ? 0 : 1);
    const block = data.slice(offset, offset + length);
    offset += length;
    dataBlocks.push(block);
    eccBlocks.push(rsEncode(block, eccLength));
  }

  const out = new Uint8Array(totalData + blocks * eccLength);
  let index = 0;

  const longestBlock = dataBlocks.reduce((max, block) => Math.max(max, block.length), 0);
  for (let i = 0; i < longestBlock; i += 1) {
    for (const block of dataBlocks) {
      if (i >= block.length) continue;
      out[index] = block[i] ?? 0;
      index += 1;
    }
  }
  for (let i = 0; i < eccLength; i += 1) {
    for (const block of eccBlocks) {
      if (i >= block.length) continue;
      out[index] = block[i] ?? 0;
      index += 1;
    }
  }

  return out;
}

/* -------------------------------------------------------------------------- */
/* Memoisation                                                                 */
/* -------------------------------------------------------------------------- */

const CACHE_LIMIT = 8;
const cache = new Map<string, QrMatrix>();

/**
 * The student pass re-renders on every layout change. Rebuilding the symbol
 * eight times per render is wasteful, so identical payloads reuse a symbol.
 */
export function encodeQrCached(text: string, options: EncodeOptions = {}): QrMatrix {
  const key = `${options.mask ?? -1}:${text}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;

  const matrix = encodeQr(text, options);
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, matrix);
  return matrix;
}

export function clearQrCache(): void {
  cache.clear();
}

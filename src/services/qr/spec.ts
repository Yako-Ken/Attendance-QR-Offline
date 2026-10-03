/**
 * QR specification tables.
 *
 * Only error-correction level M (~15% recovery) is offered. For phone-screen to
 * phone-screen scanning that is the right trade: smaller symbols than L, far
 * more tolerance to glare, smudges and angled screens than Q or H, and a symbol
 * small enough to stay crisp on a modest display.
 *
 * Alignment pattern coordinates are *computed* rather than tabulated, following
 * the placement rule in ISO/IEC 18004 clause 6.3.2.2, which removes a large
 * table of error-prone constants.
 */

/** Total codewords per symbol, indexed by version - 1. */
const TOTAL_CODEWORDS = [
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991,
  1085,
] as const;

/** Unused remainder bits appended after the interleaved codewords. */
const REMAINDER_BITS = [
  0, 7, 7, 7, 7, 7, 0, 0, 0, 0, 0, 0, 0, 3, 3, 3, 3, 3, 3, 3,
] as const;

/** Error correction codewords per block, level M, indexed by version - 1. */
const ECC_PER_BLOCK_M = [
  10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26,
] as const;

/** Number of error correction blocks, level M, indexed by version - 1. */
const BLOCK_COUNT_M = [
  1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
] as const;

export const MIN_VERSION = 1;
export const MAX_VERSION = TOTAL_CODEWORDS.length;

/** Format-info bit pattern for error correction level M. */
const EC_LEVEL_M_BITS = 0b00;

export function sizeForVersion(version: number): number {
  return version * 4 + 17;
}

export function totalCodewords(version: number): number {
  const value = TOTAL_CODEWORDS[version - 1];
  if (value === undefined) throw new RangeError(`Unsupported QR version: ${version}`);
  return value;
}

export function remainderBits(version: number): number {
  const value = REMAINDER_BITS[version - 1];
  if (value === undefined) throw new RangeError(`Unsupported QR version: ${version}`);
  return value;
}

export function eccCodewordsPerBlock(version: number): number {
  const value = ECC_PER_BLOCK_M[version - 1];
  if (value === undefined) throw new RangeError(`Unsupported QR version: ${version}`);
  return value;
}

export function blockCount(version: number): number {
  const value = BLOCK_COUNT_M[version - 1];
  if (value === undefined) throw new RangeError(`Unsupported QR version: ${version}`);
  return value;
}

export function dataCodewords(version: number): number {
  return totalCodewords(version) - blockCount(version) * eccCodewordsPerBlock(version);
}

/** Bit length of the character-count indicator in byte mode. */
export function characterCountBits(version: number): number {
  return version <= 9 ? 8 : 16;
}

export function alignmentPatternPositions(version: number): number[] {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step =
    version === 32 ? 26 : Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const positions: number[] = [];
  for (let position = sizeForVersion(version) - 7; positions.length < count - 1; position -= step) {
    positions.unshift(position);
  }
  positions.unshift(6);
  return positions;
}

/** 15-bit format information: 5 data bits, BCH(15,5), masked with 0x5412. */
export function formatInformationBits(mask: number): number {
  if (mask < 0 || mask > 7) throw new RangeError('Mask must be 0-7.');
  const data = (EC_LEVEL_M_BITS << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  }
  return (((data << 10) | remainder) ^ 0x5412) & 0x7fff;
}

/** 18-bit version information, required from version 7 upwards. */
export function versionInformationBits(version: number): number {
  if (version < 7 || version > MAX_VERSION) {
    throw new RangeError('Version information only exists for versions 7-40.');
  }
  let remainder = version;
  for (let i = 0; i < 12; i += 1) {
    remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  }
  return (version << 12) | remainder;
}
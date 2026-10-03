/**
 * QR symbol construction: function patterns, data placement, masking.
 *
 * Module coordinates are `[row][column]`. Internal helpers follow the ISO
 * placement order (finders, separators, alignment, timing, format, version)
 * so the result matches any conformant decoder.
 */

import { getBit } from './galois';
import {
  alignmentPatternPositions,
  formatInformationBits,
  sizeForVersion,
  versionInformationBits,
} from './spec';

export interface QrMatrix {
  readonly version: number;
  readonly size: number;
  readonly modules: readonly (readonly boolean[])[];
}

export function isDark(matrix: QrMatrix, row: number, column: number): boolean {
  return matrix.modules[row]?.[column] ?? false;
}

interface MutableMatrix {
  size: number;
  modules: boolean[][];
  isFunction: boolean[][];
}

function createMutable(size: number): MutableMatrix {
  return {
    size,
    modules: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
    isFunction: Array.from({ length: size }, () => new Array<boolean>(size).fill(false)),
  };
}

function setFunction(mx: MutableMatrix, row: number, column: number, dark: boolean): void {
  if (row < 0 || column < 0 || row >= mx.size || column >= mx.size) return;
  const modulesRow = mx.modules[row];
  const functionRow = mx.isFunction[row];
  if (modulesRow === undefined || functionRow === undefined) return;
  modulesRow[column] = dark;
  functionRow[column] = true;
}

function drawFinder(mx: MutableMatrix, row: number, column: number): void {
  for (let dy = -1; dy <= 7; dy += 1) {
    for (let dx = -1; dx <= 7; dx += 1) {
      const r = row + dy;
      const c = column + dx;
      if (r < 0 || c < 0 || r >= mx.size || c >= mx.size) continue;
      const inRing = dy >= 0 && dy <= 6 && dx >= 0 && dx <= 6;
      const dark =
        inRing &&
        ((dy === 0 || dy === 6 || dx === 0 || dx === 6) ||
          (dy >= 2 && dy <= 4 && dx >= 2 && dx <= 4));
      setFunction(mx, r, c, dark);
    }
  }
}

function drawAlignment(mx: MutableMatrix, row: number, column: number): void {
  for (let dy = -2; dy <= 2; dy += 1) {
    for (let dx = -2; dx <= 2; dx += 1) {
      const dark = Math.max(Math.abs(dx), Math.abs(dy)) !== 1;
      setFunction(mx, row + dy, column + dx, dark);
    }
  }
}

function drawFunctionPatterns(mx: MutableMatrix, version: number): void {
  const size = mx.size;

  // Timing patterns first so finder/alignment overwrites stay authoritative.
  for (let i = 0; i < size; i += 1) {
    setFunction(mx, 6, i, i % 2 === 0);
    setFunction(mx, i, 6, i % 2 === 0);
  }

  drawFinder(mx, 0, 0);
  drawFinder(mx, 0, size - 7);
  drawFinder(mx, size - 7, 0);

  const positions = alignmentPatternPositions(version);
  const last = positions.length - 1;
  positions.forEach((row, rowIndex) => {
    positions.forEach((column, columnIndex) => {
      const nearFinder =
        (rowIndex === 0 && columnIndex === 0) ||
        (rowIndex === 0 && columnIndex === last) ||
        (rowIndex === last && columnIndex === 0);
      if (!nearFinder) drawAlignment(mx, row, column);
    });
  });

  drawFormatInformation(mx, 0);
  if (version >= 7) drawVersionInformation(mx, version);

  // The module immediately above the bottom-left format strip is always dark.
  setFunction(mx, size - 8, 8, true);
}

function drawFormatInformation(mx: MutableMatrix, mask: number): void {
  const bits = formatInformationBits(mask);
  const size = mx.size;

  for (let i = 0; i <= 5; i += 1) setFunction(mx, i, 8, getBit(bits, i));
  setFunction(mx, 7, 8, getBit(bits, 6));
  setFunction(mx, 8, 8, getBit(bits, 7));
  setFunction(mx, 8, 7, getBit(bits, 8));
  for (let i = 9; i < 15; i += 1) setFunction(mx, 8, 14 - i, getBit(bits, i));

  for (let i = 0; i < 8; i += 1) setFunction(mx, 8, size - 1 - i, getBit(bits, i));
  for (let i = 8; i < 15; i += 1) setFunction(mx, size - 15 + i, 8, getBit(bits, i));

  // Dark module: column 8, row size - 8. It is always dark, whatever the mask.
  setFunction(mx, size - 8, 8, true);
}

function drawVersionInformation(mx: MutableMatrix, version: number): void {
  const bits = versionInformationBits(version);
  for (let i = 0; i < 18; i += 1) {
    const dark = getBit(bits, i);
    const a = mx.size - 11 + (i % 3);
    const b = Math.floor(i / 3);
    setFunction(mx, b, a, dark);
    setFunction(mx, a, b, dark);
  }
}

/** Zig-zag data placement: two-module columns, right to left, skipping column 6. */
function placeCodewords(mx: MutableMatrix, codewords: Uint8Array): void {
  let bitIndex = 0;
  const totalBits = codewords.length * 8;

  for (let right = mx.size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < mx.size; vertical += 1) {
      for (let column = 0; column < 2; column += 1) {
        const x = right - column;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? mx.size - 1 - vertical : vertical;
        const row = mx.modules[y];
        if (row === undefined) continue;
        if (mx.isFunction[y]?.[x] === true) continue;
        if (bitIndex >= totalBits) continue;
        const byte = codewords[bitIndex >>> 3] ?? 0;
        row[x] = getBit(byte, 7 - (bitIndex & 7));
        bitIndex += 1;
      }
    }
  }
}

/**
 * Data mask patterns (ISO/IEC 18004 clause 6.8.3), written as
 * `(row, column) => shouldBeInverted`.
 *
 * The specification states these in terms of (column, row); three of the eight
 * are asymmetric, so the coordinate order is converted explicitly here rather
 * than assumed to be interchangeable.
 */
const MASK_FUNCTIONS: readonly ((row: number, column: number) => boolean)[] = [
  (r, c) => (r + c) % 2 === 0,
  (r) => r % 2 === 0,
  (_r, c) => c % 3 === 0,
  (r, c) => (r + c) % 3 === 0,
  (r, c) => (Math.floor(c / 3) + Math.floor(r / 2)) % 2 === 0,
  (r, c) => ((r * c) % 2) + ((r * c) % 3) === 0,
  (r, c) => (((r * c) % 2) + ((r * c) % 3)) % 2 === 0,
  (r, c) => (((r + c) % 2) + ((r * c) % 3)) % 2 === 0,
];

function applyMask(mx: MutableMatrix, mask: number): void {
  const invert = MASK_FUNCTIONS[mask];
  if (invert === undefined) throw new RangeError('Mask must be 0-7.');
  for (let row = 0; row < mx.size; row += 1) {
    for (let column = 0; column < mx.size; column += 1) {
      if (mx.isFunction[row]?.[column] === true) continue;
      const line = mx.modules[row];
      if (line === undefined) continue;
      if (invert(row, column)) {
        line[column] = line[column] !== true;
      }
    }
  }
}

const FINDER_LIKE = [true, false, true, true, true, false, true, false, false, false, false];

/**
 * Penalty score used to choose the mask that is easiest to decode.
 * Implements the four ISO/IEC 18004 mask evaluation rules.
 */
export function penaltyScore(mx: MutableMatrix): number {
  const size = mx.size;
  let score = 0;

  const lineScore = (getter: (index: number) => boolean): void => {
    let runLength = 1;
    let previous = getter(0);
    for (let i = 1; i < size; i += 1) {
      const current = getter(i);
      if (current === previous) {
        runLength += 1;
      } else {
        if (runLength >= 5) score += 3 + (runLength - 5);
        runLength = 1;
        previous = current;
      }
    }
    if (runLength >= 5) score += 3 + (runLength - 5);
  };

  for (let i = 0; i < size; i += 1) {
    const row = i;
    const column = i;
    lineScore((index) => mx.modules[row]?.[index] === true);
    lineScore((index) => mx.modules[index]?.[column] === true);
  }

  // Rule 2: 2x2 blocks of one colour.
  for (let row = 0; row < size - 1; row += 1) {
    for (let column = 0; column < size - 1; column += 1) {
      const value = mx.modules[row]?.[column] === true;
      if (
        mx.modules[row]?.[column + 1] === value &&
        mx.modules[row + 1]?.[column] === value &&
        mx.modules[row + 1]?.[column + 1] === value
      ) {
        score += 3;
      }
    }
  }

  // Rule 3: finder-like 1:1:3:1:1 patterns with four light modules on a side.
  const patternScore = (getter: (index: number) => boolean): void => {
    for (let i = 0; i + FINDER_LIKE.length <= size; i += 1) {
      let matchesForward = true;
      let matchesReverse = true;
      for (let k = 0; k < FINDER_LIKE.length; k += 1) {
        const value = getter(i + k);
        if (value !== FINDER_LIKE[k]) matchesForward = false;
        if (value !== FINDER_LIKE[FINDER_LIKE.length - 1 - k]) matchesReverse = false;
      }
      if (matchesForward || matchesReverse) score += 40;
    }
  };
  for (let i = 0; i < size; i += 1) {
    const row = i;
    const column = i;
    patternScore((index) => mx.modules[row]?.[index] === true);
    patternScore((index) => mx.modules[index]?.[column] === true);
  }

  // Rule 4: deviation from an even 50/50 light-dark split.
  let dark = 0;
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      if (mx.modules[row]?.[column] === true) dark += 1;
    }
  }
  const percent = (dark * 100) / (size * size);
  score += Math.floor(Math.abs(percent - 50) / 5) * 10;

  return score;
}

export function buildMatrix(version: number, codewords: Uint8Array, forcedMask: number): QrMatrix {
  const size = sizeForVersion(version);
  const mx = createMutable(size);

  drawFunctionPatterns(mx, version);
  placeCodewords(mx, codewords);

  let bestMask = forcedMask;
  if (forcedMask < 0) {
    let bestScore = Number.POSITIVE_INFINITY;
    for (let mask = 0; mask < 8; mask += 1) {
      const candidate = createMutable(size);
      drawFunctionPatterns(candidate, version);
      placeCodewords(candidate, codewords);
      applyMask(candidate, mask);
      drawFormatInformation(candidate, mask);
      const score = penaltyScore(candidate);
      if (score < bestScore) {
        bestScore = score;
        bestMask = mask;
      }
    }
  }

  applyMask(mx, bestMask);
  drawFormatInformation(mx, bestMask);

  return {
    version,
    size,
    modules: mx.modules.map((row) => [...row]),
  };
}
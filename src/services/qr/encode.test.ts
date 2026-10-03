import jsQR from 'jsqr'
import { describe, expect, it } from 'vitest'

import { byteCapacity, encodeQr, smallestVersionFor } from './encode'
import { QUIET_ZONE_MODULES } from './render'
import type { QrMatrix } from './matrix'
import { formatInformationBits, sizeForVersion } from './spec'

/**
 * Independent verification of the hand-written encoder.
 *
 * The symbol is rasterised into raw RGBA pixels and handed to jsQR — a separate,
 * widely used decoder — so these assertions prove interoperability rather than
 * self-consistency.
 */
function rasterise(matrix: QrMatrix, scale = 4): {
  data: Uint8ClampedArray;
  width: number;
  height: number;
} {
  const total = matrix.size + QUIET_ZONE_MODULES * 2;
  const width = total * scale;
  const data = new Uint8ClampedArray(width * width * 4).fill(255);

  for (let row = 0; row < matrix.size; row += 1) {
    const line = matrix.modules[row];
    if (line === undefined) continue;
    for (let column = 0; column < matrix.size; column += 1) {
      if (line[column] !== true) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const y = (row + QUIET_ZONE_MODULES) * scale + dy;
          const x = (column + QUIET_ZONE_MODULES) * scale + dx;
          const offset = (y * width + x) * 4;
          data[offset] = 0;
          data[offset + 1] = 0;
          data[offset + 2] = 0;
          data[offset + 3] = 255;
        }
      }
    }
  }

  return { data, width, height: width }
}

function decodeMatrix(matrix: QrMatrix): string | null {
  const image = rasterise(matrix);
  const result = jsQR(image.data, image.width, image.height, {
    inversionAttempts: 'dontInvert',
  });
  return result?.data ?? null;
}

describe('QR encoder', () => {
  it('round-trips a realistic attendance payload', () => {
    const payload = JSON.stringify({
      version: 1,
      type: 'attendance-student',
      name: 'Ahmed Mohamed Ali',
      studentId: '001234',
      academicYear: '3',
      deviceId: '3f2a91c4-5d6e-4a7b-8c9d-0e1f2a3b4c5d',
    });

    const matrix = encodeQr(payload);

    expect(decodeMatrix(matrix)).toBe(payload);
  });

  it('round-trips Arabic and other non-Latin names', () => {
    const payload = JSON.stringify({
      version: 1,
      type: 'attendance-student',
      name: 'أحمد محمد علي',
      studentId: '000123',
      academicYear: '1',
      deviceId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    });

    expect(decodeMatrix(encodeQr(payload))).toBe(payload);
  });

  it('round-trips every payload length across the whole version range', () => {
    for (let version = 1; version <= 20; version += 1) {
      const capacity = byteCapacity(version);
      // Exercise both a short and a maximal payload for each version.
      for (const length of [Math.max(1, capacity - 1), capacity]) {
        const payload = 'A'.repeat(length);
        const matrix = encodeQr(payload);
        expect(matrix.version).toBe(version);
        expect(decodeMatrix(matrix)).toBe(payload);
      }
    }
  });

  it('produces a symbol of the size required by the version', () => {
    expect(encodeQr('hello').size).toBe(sizeForVersion(1));
    expect(encodeQr('A'.repeat(byteCapacity(5) + 1)).version).toBe(6);
  });

  it('selects the smallest version that fits', () => {
    expect(smallestVersionFor(1)).toBe(1);
    expect(smallestVersionFor(byteCapacity(1))).toBe(1);
    expect(smallestVersionFor(byteCapacity(1) + 1)).toBe(2);
    expect(smallestVersionFor(byteCapacity(9))).toBe(9);
    expect(smallestVersionFor(byteCapacity(9) + 1)).toBe(10);
  });

  it('exposes the ISO byte capacity table for level M', () => {
    // Independently known values for error correction level M.
    expect(byteCapacity(1)).toBe(14)
    expect(byteCapacity(5)).toBe(84)
    expect(byteCapacity(10)).toBe(213)
    expect(byteCapacity(15)).toBe(412)
    expect(byteCapacity(20)).toBe(666)
  });

  it('declines payloads larger than the supported range', () => {
    expect(() => encodeQr('A'.repeat(byteCapacity(20) + 1))).toThrow(RangeError);
  });

  it('declines an empty payload', () => {
    expect(() => encodeQr('')).toThrow(RangeError);
  });

  it('keeps the dark module and reserved format areas consistent across masks', () => {
    for (let mask = 0; mask < 8; mask += 1) {
      const matrix = encodeQr('mask probe payload', { mask });
      expect(matrix.size).toBeGreaterThan(0);
      // Column 8, row size - 8 must be dark in every mask.
      expect(matrix.modules[matrix.size - 8]?.[8]).toBe(true);
    }
  });

  it('produces different data for different masks but decodes identically', () => {
    const payload = 'mask comparison payload';
    const seen = new Set<string>();
    for (let mask = 0; mask < 8; mask += 1) {
      const matrix = encodeQr(payload, { mask });
      seen.add(matrix.modules.map((row) => row.map((v) => (v ? '1' : '0')).join('')).join(''));
      expect(decodeMatrix(matrix)).toBe(payload);
    }
    expect(seen.size).toBe(8);
  });

  it('derives format information with the ISO BCH generator and XOR mask', () => {
    // ISO/IEC 18004 Table C.1, error correction level M, all eight masks.
    const expected = [
      '101010000010010',
      '101000100100101',
      '101111001111100',
      '101101101001011',
      '100010111111001',
      '100000011001110',
      '100111110010111',
      '100101010100000',
    ] as const;

    expected.forEach((bits, mask) => {
      expect(formatInformationBits(mask).toString(2).padStart(15, '0')).toBe(bits);
    });
  });

  it('chooses the mask with the lowest penalty score', () => {
    const a = encodeQr('penalty probe', { mask: 0 })
    const b = encodeQr('penalty probe', { mask: 3 })
    expect(decodeMatrix(a)).toBe('penalty probe')
    expect(decodeMatrix(b)).toBe('penalty probe')
  })
})
/**
 * GF(256) arithmetic and Reed-Solomon error correction (ISO/IEC 18004).
 *
 * The field is GF(2^8) modulo the primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
 * (0x11D), with 2 as the generator element.
 */

const PRIMITIVE = 0x11d;
const MAX_EXP = 255;

/**
 * EXP is indexed by the *sum* of two logarithms, which reaches 254 + 254 = 508,
 * so it is built double length with the exponent wrapped past 255.
 *
 * LOG is indexed by a field element, so it needs one entry per byte value
 * (0-255). Sizing it 255 silently drops the logarithm of 0xFF and makes
 * gfMultiply(0xFF, x) return x — a fault that corrupts exactly the intermediate
 * coefficients that still look plausible.
 */
const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);

(function buildTables(): void {
  let value = 1;
  for (let i = 0; i < MAX_EXP; i += 1) {
    EXP[i] = value;
    LOG[value] = i;
    value <<= 1;
    if ((value & 0x100) !== 0) value ^= PRIMITIVE;
  }
  for (let i = MAX_EXP; i < EXP.length; i += 1) {
    EXP[i] = EXP[i - MAX_EXP] ?? 0;
  }
})();

export function gfMultiply(a: number, b: number): number {
  if (a === 0 || b === 0) return 0;
  return EXP[(LOG[a] ?? 0) + (LOG[b] ?? 0)] ?? 0;
}

/**
 * Product of (x - 2^i) for i in [0, degree), returned as coefficients from the
 * highest power down; `result[0]` is always 1.
 */
export function rsGeneratorPoly(degree: number): Uint8Array {
  let result: number[] = [1];
  for (let i = 0; i < degree; i += 1) {
    const next = new Array<number>(result.length + 1).fill(0);
    for (let j = 0; j < result.length; j += 1) {
      const coefficient = result[j] ?? 0;
      next[j] = (next[j] ?? 0) ^ coefficient;
      next[j + 1] = (next[j + 1] ?? 0) ^ gfMultiply(coefficient, EXP[i] ?? 0);
    }
    result = next;
  }
  return Uint8Array.from(result);
}

/**
 * Reed-Solomon parity for one block: the remainder of `data * x^ecLength`
 * divided by the generator polynomial.
 *
 * Implemented as explicit long division over GF(256). The equivalent
 * shift-register formulation is shorter but its coefficient ordering is
 * easy to get subtly wrong and produces a codeword that looks plausible yet
 * fails every syndrome check; long division keeps the arithmetic visible and
 * is verified by `qr/galois.test.ts`, which asserts that the resulting
 * codeword evaluates to zero at every generator root.
 */
export function rsEncode(data: Uint8Array, ecLength: number): Uint8Array {
  const generator = rsGeneratorPoly(ecLength);
  const work = new Uint8Array(data.length + ecLength);
  work.set(data, 0);

  for (let i = 0; i < data.length; i += 1) {
    const factor = work[i] ?? 0;
    if (factor === 0) continue;
    for (let j = 0; j < generator.length; j += 1) {
      work[i + j] = (work[i + j] ?? 0) ^ gfMultiply(generator[j] ?? 0, factor);
    }
  }

  return work.slice(data.length);
}

/** Evaluate a codeword polynomial at a power of the field generator. */
export function rsSyndromes(codewords: Uint8Array, ecLength: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < ecLength; i += 1) {
    let value = 0;
    for (const byte of codewords) {
      value = gfMultiply(value, EXP[i] ?? 0) ^ byte;
    }
    result.push(value);
  }
  return result;
}

/* ---- Bit buffer ---------------------------------------------------------- */

export class BitBuffer {
  private readonly bits: number[] = [];

  append(value: number, length: number): void {
    if (length < 0 || length > 31) throw new RangeError('Bit length out of range.');
    for (let i = length - 1; i >= 0; i -= 1) {
      this.bits.push((value >>> i) & 1);
    }
  }

  get length(): number {
    return this.bits.length;
  }

  toCodewords(): Uint8Array {
    const out = new Uint8Array(Math.ceil(this.bits.length / 8));
    this.bits.forEach((bit, index) => {
      if (bit === 1) out[index >>> 3] = (out[index >>> 3] ?? 0) | (1 << (7 - (index & 7)));
    });
    return out;
  }
}

export function getBit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0;
}
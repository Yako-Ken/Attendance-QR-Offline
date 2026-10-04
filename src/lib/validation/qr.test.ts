/**
 * QR payload contract: generation, serialisation, and hostile-input rejection.
 */

import { describe, expect, it } from 'vitest'
import {
  QR_CLOCK_SKEW_THRESHOLD_MS,
  QR_MAX_AGE_MS,
  QR_ROTATION_MS,
} from '../../types/qr'
import {
  QR_MAX_BYTES,
  buildAttendanceQr,
  parseAttendanceQr,
  serialiseAttendanceQr,
  validateScannedQr,
} from './qr'

const DEVICE = '3f2a91c4-5d6e-4a7b-8c9d-0e1f2a3b4c5d';
const NOW = Date.parse('2026-10-01T09:00:00.000Z');

const VALID = {
  version: 1,
  type: 'attendance-student',
  name: 'Ahmed Mohamed Ali',
  studentId: '001234',
  academicYear: '3',
  deviceId: DEVICE,
  issuedAt: NOW,
} as const;

describe('QR payload generation', () => {
  it('produces a payload with a pinned schema version and type', () => {
    const payload = buildAttendanceQr({
      name: 'Sara Ibrahim',
      studentId: '0099',
      academicYear: '2',
      deviceId: DEVICE,
      issuedAt: NOW,
    });

    expect(payload.version).toBe(1);
    expect(payload.type).toBe('attendance-student');
  });

  it('carries every field the scanner needs and nothing else', () => {
    const serialised = serialiseAttendanceQr(buildAttendanceQr(VALID));

    expect(Object.keys(JSON.parse(serialised) as object).sort()).toEqual([
      'academicYear',
      'deviceId',
      'issuedAt',
      'name',
      'studentId',
      'type',
      'version',
    ]);
  });

  it('preserves leading zeros in the student ID', () => {
    const payload = buildAttendanceQr({ ...VALID, studentId: '000123' });

    expect(payload.studentId).toBe('000123');
    expect(JSON.parse(serialiseAttendanceQr(payload))).toMatchObject({ studentId: '000123' });
  });

  it('preserves Arabic names through serialisation', () => {
    const payload = buildAttendanceQr({ ...VALID, name: 'أحمد محمد علي' });

    expect(parseAttendanceQr(serialiseAttendanceQr(payload))).toMatchObject({
      ok: true,
      payload: { name: 'أحمد محمد علي' },
    });
  });

  it('lower-cases the device ID for a stable comparison key', () => {
    const payload = buildAttendanceQr({ ...VALID, deviceId: DEVICE.toUpperCase() });

    expect(payload.deviceId).toBe(DEVICE);
  });

  it('round-trips through JSON unchanged', () => {
    const result = parseAttendanceQr(serialiseAttendanceQr(buildAttendanceQr(VALID)));

    expect(result.ok).toBe(true);
  });
});

describe('QR payload validation', () => {
  it('accepts a well-formed payload', () => {
    const result = parseAttendanceQr(JSON.stringify(VALID));

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.payload.studentId).toBe('001234');
  });

  it.each([
    ['a URL', 'https://example.com'],
    ['plain text', 'HELLO WORLD'],
    ['a Wi-Fi config', 'WIFI:T:WPA;S:net;P:secret;;'],
    ['an empty string', ''],
    ['whitespace only', '   '],
    ['a JSON array', '[1,2,3]'],
    ['a JSON string', '"attendance-student"'],
    ['a JSON number', '42'],
    ['JSON null', 'null'],
  ])('rejects %s as not an attendance code', (_label, raw) => {
    const result = parseAttendanceQr(raw);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toBe('This QR code is not a valid student attendance code.');
  });

  it('rejects malformed JSON without throwing', () => {
    const result = parseAttendanceQr('{"version":1,');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-json');
  });

  it('rejects an unsupported schema version with a distinct message', () => {
    for (const version of [0, 2, 99]) {
      const result = parseAttendanceQr(JSON.stringify({ ...VALID, version }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('unsupported-version');
        expect(result.message).toMatch(/unsupported format/i);
      }
    }
  });

  it('rejects a non-integer or non-numeric version', () => {
    for (const version of ['1', 1.5, null, undefined, {}]) {
      const result = parseAttendanceQr(JSON.stringify({ ...VALID, version }));

      expect(result.ok).toBe(false);
    }
  });

  it('rejects a foreign QR type', () => {
    const result = parseAttendanceQr(JSON.stringify({ ...VALID, type: 'library-book' }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('wrong-type');
  });

  it.each(['name', 'studentId', 'academicYear', 'deviceId'])(
    'rejects a payload missing %s',
    (field) => {
      const record: Record<string, unknown> = { ...VALID };
      Reflect.deleteProperty(record, field);
      const result = parseAttendanceQr(JSON.stringify(record));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('missing-field');
    },
  );

  it.each(['name', 'studentId', 'academicYear', 'deviceId'])(
    'rejects %s with the wrong type',
    (field) => {
      const result = parseAttendanceQr(JSON.stringify({ ...VALID, [field]: { toString: () => 'x' } }));

      expect(result.ok).toBe(false);
    },
  );

  it('rejects a non-numeric student ID', () => {
    for (const id of ['12a45', '001234x', '1.5', '١٢٣']) {
      const result = parseAttendanceQr(JSON.stringify({ ...VALID, studentId: id }));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('bad-student-id');
    }
  });

  it('rejects an out-of-range academic year', () => {
    for (const year of ['0', '8', 'first', '', '  ']) {
      const result = parseAttendanceQr(JSON.stringify({ ...VALID, academicYear: year }));

      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.reason).toBe('bad-academic-year');
    }
  });

  it('rejects an invalid device identifier with a specific message', () => {
    for (const id of ['not-a-uuid', '', '12345', '3f2a91c4-5d6e-4a7b-8c9d']) {
      const result = parseAttendanceQr(JSON.stringify({ ...VALID, deviceId: id }));

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe('bad-device-id');
        expect(result.message).toMatch(/device identifier/i);
      }
    }
  });

  it('rejects an oversized payload before parsing it', () => {
    const result = parseAttendanceQr('x'.repeat(QR_MAX_BYTES + 1));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('oversized');
  });

  it('rejects a prototype-pollution attempt', () => {
    const result = parseAttendanceQr('{"__proto__":{"admin":true},"version":1}');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('not-object');
    expect(({} as Record<string, unknown>)['admin']).toBeUndefined();
  });

  it('never throws, whatever it is given', () => {
    const inputs: unknown[] = [
      undefined,
      null,
      42,
      true,
      Symbol('x'),
      () => null,
      { version: 1 },
      new Uint8Array([1, 2, 3]),
    ];

    for (const input of inputs) {
      expect(() => parseAttendanceQr(input)).not.toThrow();
      expect(parseAttendanceQr(input).ok).toBe(false);
    }
  });

  it('rejects an over-long name', () => {
    const result = parseAttendanceQr(JSON.stringify({ ...VALID, name: 'a'.repeat(500) }));

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('bad-name');
  });

  it('returns no stack traces or technical detail in user messages', () => {
    const inputs = ['{', 'null', '[]', JSON.stringify({ ...VALID, version: 7 })];

    for (const raw of inputs) {
      const result = parseAttendanceQr(raw);
      if (result.ok) continue;
      expect(result.message).not.toMatch(/Error|at |\.ts:|undefined|null/i);
      expect(result.message.length).toBeLessThan(120);
    }
  });
});

describe('QR freshness', () => {
  const issuedNow = () => serialiseAttendanceQr(buildAttendanceQr({ ...VALID, issuedAt: NOW }));

  it('accepts a code issued just now', () => {
    expect(validateScannedQr(issuedNow(), NOW).ok).toBe(true);
  });

  it('carries the payload back so the scanner can record it', () => {
    const result = validateScannedQr(issuedNow(), NOW);

    expect(result.ok && result.payload.studentId).toBe('001234');
  });

  it('still accepts a code just inside the age limit', () => {
    expect(validateScannedQr(issuedNow(), NOW + QR_MAX_AGE_MS - 1000).ok).toBe(true);
  });

  it('refuses a code at the age limit', () => {
    expect(validateScannedQr(issuedNow(), NOW + QR_MAX_AGE_MS).ok).toBe(false);
  });

it('tolerates ordinary clock drift between two phones', () => {
    expect(validateScannedQr(issuedNow(), NOW - 1000).ok).toBe(true);
  });

  it('refuses a code whose timestamp is too far in the future', () => {
    expect(validateScannedQr(issuedNow(), NOW - QR_CLOCK_SKEW_THRESHOLD_MS - 1000).ok).toBe(false);
  });

  it('refuses a legacy payload that carries no timestamp', () => {
    const text = JSON.stringify({
      version: VALID.version,
      type: VALID.type,
      name: VALID.name,
      studentId: VALID.studentId,
      academicYear: VALID.academicYear,
      deviceId: VALID.deviceId,
    });

    expect(validateScannedQr(text, NOW).ok).toBe(false);
  });

  it('refuses an empty string', () => {
    expect(validateScannedQr('', NOW).ok).toBe(false);
  });
});

describe('a rotating code window', () => {
  it('lets a code outlive one refresh, so no gap opens between codes', () => {
    expect(QR_MAX_AGE_MS).toBeGreaterThan(QR_ROTATION_MS);
  });

  it('yields a different payload on each rotation', () => {
    const first = buildAttendanceQr({ ...VALID, issuedAt: NOW });
    const second = buildAttendanceQr({ ...VALID, issuedAt: NOW + QR_ROTATION_MS });

    expect(serialiseAttendanceQr(first)).not.toBe(serialiseAttendanceQr(second));
  });

  it('keeps the same student identity across a rotation', () => {
    const first = buildAttendanceQr({ ...VALID, issuedAt: NOW });
    const second = buildAttendanceQr({ ...VALID, issuedAt: NOW + QR_ROTATION_MS });

    expect(second.studentId).toBe(first.studentId);
    expect(second.deviceId).toBe(first.deviceId);
  });
});
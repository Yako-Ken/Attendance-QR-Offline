/**
 * QR payload validation and freshness.
 *
 * Two independent gates, because they fail for different reasons and the
 * teaching assistant needs different messages:
 *
 *   1. `parseAttendanceQr` — structure. Is this even an attendance code?
 *   2. `checkQrFreshness`   — age. Was it still live when the camera saw it?
 *
 * Everything arriving from the scanner is untrusted: the string may be an
 * arbitrary QR code (a URL, a Wi-Fi config, another app's ticket), truncated
 * text, or hostile JSON. Nothing here throws.
 */

import {
  QR_CLOCK_SKEW_THRESHOLD_MS,
  QR_MAX_AGE_MS,
  QR_PAYLOAD_TYPE,
  QR_SCHEMA_VERSION,
  type AttendanceQrPayload,
  type QrParseResult,
  type QrRejectionReason,
} from '../../types/qr';
import { isUuidFormat } from '../util/uuid';
import { normalizeName, normalizeStudentId, validateAcademicYear } from './student';

export const QR_MAX_BYTES = 8192;

const NAME_MAX = 80;
const STUDENT_ID_MAX = 20;

/** Plausible epoch bounds: 2020-01-01 to 2100-01-01. */
const MIN_TIMESTAMP = 1577836800000;
const MAX_TIMESTAMP = 4102444800000;

const MESSAGE_INVALID = 'This QR code is not a valid student attendance code.';
const MESSAGE_VERSION =
  'This QR code uses an unsupported format. Ask the student to regenerate it.';
const MESSAGE_DEVICE = 'This QR code has an invalid device identifier. Ask for a new QR code.';
const MESSAGE_NO_TIMESTAMP =
  'This QR code is out of date. Ask the student to refresh their QR code.';
const MESSAGE_EXPIRED =
  'This QR code has expired. The student should show the code that is on their screen now.';
const MESSAGE_CLOCK =
  'This QR code was rejected because the phone clocks are out of sync. Check the date and time on both phones.';

type Rejection = Extract<QrParseResult, { ok: false }>;

function fail(reason: QrRejectionReason, message: string): Rejection {
  return { ok: false, reason, message };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseAttendanceQr(raw: unknown): QrParseResult {
  if (typeof raw !== 'string') return fail('empty', MESSAGE_INVALID);
  const text = raw.trim();
  if (text.length === 0) return fail('empty', MESSAGE_INVALID);
  if (text.length > QR_MAX_BYTES) return fail('oversized', MESSAGE_INVALID);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fail('not-json', MESSAGE_INVALID);
  }

  if (!isPlainObject(parsed)) return fail('not-object', MESSAGE_INVALID);

  // Prototype-pollution guard: never merge attacker keys onto our objects.
  // `hasOwnProperty` is used rather than `in`, because `in` also sees
  // `Object.prototype` members and would narrow the record type incorrectly.
  const record = parsed;
  if (
    Object.prototype.hasOwnProperty.call(record, '__proto__') ||
    Object.prototype.hasOwnProperty.call(record, 'constructor') ||
    Object.prototype.hasOwnProperty.call(record, 'prototype')
  ) {
    return fail('not-object', MESSAGE_INVALID);
  }

  const version = record['version'];
  if (typeof version !== 'number' || !Number.isInteger(version)) {
    return fail('missing-field', MESSAGE_INVALID);
  }
  if (version !== QR_SCHEMA_VERSION) {
    return fail('unsupported-version', MESSAGE_VERSION);
  }

  if (record['type'] !== QR_PAYLOAD_TYPE) return fail('wrong-type', MESSAGE_INVALID);

  const rawName = record['name'];
  const rawStudentId = record['studentId'];
  const rawYear = record['academicYear'];
  const rawDeviceId = record['deviceId'];

  if (
    typeof rawName !== 'string' ||
    typeof rawStudentId !== 'string' ||
    typeof rawYear !== 'string' ||
    typeof rawDeviceId !== 'string'
  ) {
    return fail('missing-field', MESSAGE_INVALID);
  }

  const fullName = normalizeName(rawName);
  if (fullName.length === 0 || fullName.length > NAME_MAX) {
    return fail('bad-name', MESSAGE_INVALID);
  }

  const studentId = normalizeStudentId(rawStudentId);
  if (studentId.length === 0 || studentId.length > STUDENT_ID_MAX || !/^[0-9]+$/u.test(studentId)) {
    return fail('bad-student-id', MESSAGE_INVALID);
  }

  if (validateAcademicYear(rawYear) !== null) {
    return fail('bad-academic-year', MESSAGE_INVALID);
  }

  if (!isUuidFormat(rawDeviceId)) return fail('bad-device-id', MESSAGE_DEVICE);

  // A symbol issued before this field existed, or a hand-crafted one, cannot be
  // shown to be live, so it is refused rather than trusted.
  const issuedAt = record['issuedAt'];
  if (issuedAt === undefined || issuedAt === null) {
    return fail('no-timestamp', MESSAGE_NO_TIMESTAMP);
  }
  if (typeof issuedAt !== 'number' || !Number.isFinite(issuedAt) || !Number.isInteger(issuedAt)) {
    return fail('bad-timestamp', MESSAGE_NO_TIMESTAMP);
  }
  if (issuedAt < MIN_TIMESTAMP || issuedAt > MAX_TIMESTAMP) {
    return fail('bad-timestamp', MESSAGE_NO_TIMESTAMP);
  }

  const payload: AttendanceQrPayload = {
    version: QR_SCHEMA_VERSION,
    type: QR_PAYLOAD_TYPE,
    name: fullName,
    studentId,
    academicYear: rawYear,
    deviceId: rawDeviceId.toLowerCase(),
    issuedAt,
  };

  return { ok: true, payload };
}

export type FreshnessResult =
  | { readonly ok: true; readonly ageMs: number }
  | { readonly ok: false; readonly reason: QrRejectionReason; readonly message: string };
/**
 * Decide whether a structurally valid symbol was still live when it was read.
 *
 * A small negative age means the student's clock is slightly behind, which is
 * normal and is accepted. A large one means the clocks are out of sync, which
 * gets its own message so the assistant does not blame a student whose code is
 * perfectly current.
 */
export function checkQrFreshness(
  payload: AttendanceQrPayload,
  now: number,
  maxAgeMs: number = QR_MAX_AGE_MS,
): FreshnessResult {
  const ageMs = now - payload.issuedAt;

  // A small negative age is just clock drift between the two phones and is
  // tolerated; a large one means a timestamp we cannot trust, so the code is
  // refused rather than silently recording an unverified student.
  if (ageMs >= maxAgeMs) {
    return { ok: false, reason: 'expired', message: MESSAGE_EXPIRED };
  }
  if (ageMs < -QR_CLOCK_SKEW_THRESHOLD_MS) {
    return { ok: false, reason: 'clock-skew', message: MESSAGE_CLOCK };
  }
  return { ok: true, ageMs };
}

/**
 * What the scanner receives: a payload to record, or a reason to refuse.
 * Both gates are folded together so a single discriminated union drives the
 * scanner loop.
 */
export type ScannedQrResult =
  | { readonly ok: true; readonly payload: AttendanceQrPayload; readonly ageMs: number }
  | { readonly ok: false; readonly reason: QrRejectionReason; readonly message: string };

/** Structure plus freshness in one call, which is what the scanner needs. */
export function validateScannedQr(raw: unknown, now: number): ScannedQrResult {
  const parsed = parseAttendanceQr(raw);
  if (!parsed.ok) return parsed;
  const fresh = checkQrFreshness(parsed.payload, now);
  return fresh.ok ? { ok: true, payload: parsed.payload, ageMs: fresh.ageMs } : fresh;
}

/** Serialise in a stable key order so the same profile always yields the same code. */
export function serialiseAttendanceQr(payload: AttendanceQrPayload): string {
  return JSON.stringify({
    version: payload.version,
    type: payload.type,
    name: payload.name,
    studentId: payload.studentId,
    academicYear: payload.academicYear,
    deviceId: payload.deviceId,
    issuedAt: payload.issuedAt,
  });
}

export function buildAttendanceQr(
  input: Omit<AttendanceQrPayload, 'version' | 'type'>,
): AttendanceQrPayload {
  return {
    version: QR_SCHEMA_VERSION,
    type: QR_PAYLOAD_TYPE,
    name: normalizeName(input.name),
    studentId: normalizeStudentId(input.studentId),
    academicYear: input.academicYear,
    deviceId: input.deviceId.toLowerCase(),
    issuedAt: input.issuedAt,
  };
}
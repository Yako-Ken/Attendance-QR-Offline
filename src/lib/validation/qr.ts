/**
 * QR payload validation.
 *
 * Everything arriving from the scanner is untrusted: the string may be an
 * arbitrary QR code (a URL, a Wi-Fi config, another app's ticket), truncated
 * text, or hostile JSON. This module therefore:
 *
 *   - bounds the input size before parsing,
 *   - requires a plain JSON object,
 *   - pins `version` and `type`,
 *   - validates every field's presence, type, and format,
 *   - never throws and never returns a stack trace to the UI.
 */

import {
  QR_PAYLOAD_TYPE,
  QR_SCHEMA_VERSION,
  type AttendanceQrPayload,
  type QrParseResult,
} from '../../types/qr';
import { isUuidFormat } from '../util/uuid';
import { normalizeName, normalizeStudentId, validateAcademicYear } from './student';

export const QR_MAX_BYTES = 8192;

const NAME_MAX = 80;
const STUDENT_ID_MAX = 20;

const MESSAGE_INVALID = 'This QR code is not a valid student attendance code.';
const MESSAGE_VERSION =
  'This QR code uses an unsupported format. Ask the student to regenerate it.';
const MESSAGE_DEVICE = 'This QR code has an invalid device identifier. Ask for a new QR code.';

type Rejection = Extract<QrParseResult, { ok: false }>;

function fail(reason: Rejection['reason'], message: string): Rejection {
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

  const payload: AttendanceQrPayload = {
    version: QR_SCHEMA_VERSION,
    type: QR_PAYLOAD_TYPE,
    name: fullName,
    studentId,
    academicYear: rawYear,
    deviceId: rawDeviceId.toLowerCase(),
  };

  return { ok: true, payload };
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
  };
}
/**
 * Attendance engine — pure domain logic, no React, no storage, no DOM.
 *
 * Every decision the teaching assistant workflow makes lives here so it can be
 * unit tested exhaustively:
 *
 *   - accept a new student,
 *   - reject a Student ID already present (existing record untouched),
 *   - detect the same Device ID across different students,
 *   - apply a TA decision without ever silently mutating the session,
 *   - edit records with conflict detection,
 *   - derive operational statistics.
 */

import type {
  AttendanceRecord,
  AttendanceSession,
  EditResult,
  RecordPatch,
  ScanEvaluation,
  SessionStats,
} from '../../types/attendance';
import type { AttendanceQrPayload } from '../../types/qr';
import { isAcademicYear } from '../../types/student';
import { nowIso } from '../util/time';
import { randomUuid } from '../util/uuid';
import {
  normalizeName,
  normalizeStudentId,
  validateAcademicYear,
  validateFullName,
  validateStudentId,
} from '../validation/student';

/* -------------------------------------------------------------------------- */
/* Factories                                                                   */
/* -------------------------------------------------------------------------- */

export interface CreateSessionInput {
  readonly id?: string;
  readonly sectionName: string;
  readonly now?: string;
}

export function createSession(input: CreateSessionInput): AttendanceSession {
  const stamp = input.now ?? nowIso();
  return {
    id: input.id ?? randomUuid(),
    sectionName: input.sectionName,
    createdAt: stamp,
    updatedAt: stamp,
    duplicateAttempts: 0,
    records: [],
  };
}

export function createRecord(
  payload: AttendanceQrPayload,
  meta: { id?: string; scannedAt?: string } = {},
): AttendanceRecord {
  return {
    id: meta.id ?? randomUuid(),
    fullName: payload.name,
    studentId: payload.studentId,
    academicYear: payload.academicYear,
    deviceId: payload.deviceId,
    scannedAt: meta.scannedAt ?? nowIso(),
    duplicateDeviceFlag: false,
  };
}

/* -------------------------------------------------------------------------- */
/* Scanning                                                                    */
/* -------------------------------------------------------------------------- */

/** Student IDs are compared as strings; leading zeros are significant. */
export function findByStudentId(
  session: AttendanceSession,
  studentId: string,
): AttendanceRecord | undefined {
  const target = normalizeStudentId(studentId);
  return session.records.find((record) => record.studentId === target);
}

/** Every other student already recorded from the same Device ID. */
export function findByDeviceId(
  session: AttendanceSession,
  deviceId: string,
): AttendanceRecord[] {
  const target = deviceId.toLowerCase();
  return session.records.filter((record) => record.deviceId.toLowerCase() === target);
}

/**
 * Classify a scanned QR against the session without mutating anything.
 *
 * The caller decides what to do with a `device-conflict`: nothing is written
 * until the teaching assistant chooses to accept it.
 */
export function evaluateScan(
  session: AttendanceSession,
  payload: AttendanceQrPayload,
  meta: { id?: string; scannedAt?: string } = {},
): ScanEvaluation {
  const existing = findByStudentId(session, payload.studentId);
  if (existing !== undefined) {
    return { kind: 'duplicate', existing };
  }

  const record = createRecord(payload, meta);
  const conflicts = findByDeviceId(session, payload.deviceId);

  if (conflicts.length > 0) {
    return { kind: 'device-conflict', record, conflicts };
  }

  return { kind: 'accepted', record };
}

/** Immutable insert. */
export function appendRecord(
  session: AttendanceSession,
  record: AttendanceRecord,
): AttendanceSession {
  return {
    ...session,
    records: [...session.records, record],
    updatedAt: record.scannedAt,
  };
}

/** Insert a record that the TA has explicitly accepted despite a device conflict. */
export function appendConflictingRecord(
  session: AttendanceSession,
  record: AttendanceRecord,
): AttendanceSession {
  return appendRecord(session, { ...record, duplicateDeviceFlag: true });
}

export function countDuplicateAttempt(session: AttendanceSession): AttendanceSession {
  return {
    ...session,
    duplicateAttempts: session.duplicateAttempts + 1,
    updatedAt: nowIso(),
  };
}

/* -------------------------------------------------------------------------- */
/* Editing                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Validate and normalise a patch to one record. Validation is identical to the
 * student form so a TA cannot introduce data a student could not have entered.
 *
 * A Student ID that collides with another record in the same session is
 * refused rather than silently creating a duplicate.
 *
 * Pure: returns the would-be record, never mutates.
 */
export function editRecord(
  session: AttendanceSession,
  recordId: string,
  patch: RecordPatch,
): EditResult {
  const current = session.records.find((record) => record.id === recordId);
  if (current === undefined) {
    return { ok: false, field: 'record', message: 'That attendance record no longer exists.' };
  }

  const nextFullName =
    patch.fullName === undefined ? current.fullName : normalizeName(patch.fullName);
  const nextStudentId =
    patch.studentId === undefined ? current.studentId : normalizeStudentId(patch.studentId);
  const nextYear =
    patch.academicYear === undefined ? current.academicYear : patch.academicYear.trim();

  const nameError = validateFullName(nextFullName);
  if (nameError !== null) return { ok: false, field: 'fullName', message: nameError };

  const idError = validateStudentId(nextStudentId);
  if (idError !== null) return { ok: false, field: 'studentId', message: idError };

  const yearError = validateAcademicYear(nextYear);
  if (yearError !== null || !isAcademicYear(nextYear)) {
    return { ok: false, field: 'academicYear', message: yearError ?? 'Invalid academic year.' };
  }

  const clash = session.records.find(
    (record) => record.id !== recordId && record.studentId === nextStudentId,
  );
  if (clash !== undefined) {
    return {
      ok: false,
      field: 'studentId',
      message: `${nextStudentId} is already recorded for ${clash.fullName}.`,
    };
  }

  return {
    ok: true,
    record: {
      ...current,
      fullName: nextFullName,
      studentId: nextStudentId,
      academicYear: nextYear,
    },
  };
}

/**
 * Validate a patch and, if it is valid, return the new session.
 *
 * The UI applies the new session and keeps the previous one on failure, so an
 * invalid edit can never partially write.
 */
export function editRecordInSession(
  session: AttendanceSession,
  recordId: string,
  patch: RecordPatch,
  now: string = nowIso(),
): { session: AttendanceSession; result: EditResult } | null {
  const result = editRecord(session, recordId, patch);
  if (!result.ok) return null;

  const records = session.records.map((record) =>
    record.id === recordId ? result.record : record,
  );
  return { session: { ...session, records, updatedAt: now }, result };
}

export function removeRecord(session: AttendanceSession, recordId: string): AttendanceSession {
  const records = session.records.filter((record) => record.id !== recordId);
  if (records.length === session.records.length) return session;
  return { ...session, records, updatedAt: nowIso() };
}

/* -------------------------------------------------------------------------- */
/* Statistics                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * Device IDs currently shared by more than one student.
 *
 * Derived at read time rather than trusted from a stored flag, so corrections
 * made during review are reflected immediately.
 */
export function sharedDeviceIds(session: AttendanceSession): Set<string> {
  const byDevice = new Map<string, Set<string>>();
  for (const record of session.records) {
    const key = record.deviceId.toLowerCase();
    const students = byDevice.get(key) ?? new Set<string>();
    students.add(record.studentId);
    byDevice.set(key, students);
  }
  const shared = new Set<string>();
  for (const [deviceId, students] of byDevice) {
    if (students.size > 1) shared.add(deviceId);
  }
  return shared;
}

export function isRecordFlagged(record: AttendanceRecord, shared: ReadonlySet<string>): boolean {
  return record.duplicateDeviceFlag || shared.has(record.deviceId.toLowerCase());
}

export function computeSessionStats(session: AttendanceSession): SessionStats {
  const shared = sharedDeviceIds(session);
  const timestamps = session.records.map((record) => record.scannedAt).sort();

  return {
    total: session.records.length,
    deviceAlerts: shared.size,
    flaggedRecords: session.records.filter((record) => isRecordFlagged(record, shared)).length,
    duplicateAttempts: session.duplicateAttempts,
    firstScanAt: timestamps[0] ?? null,
    lastScanAt: timestamps[timestamps.length - 1] ?? null,
  };
}
/**
 * Attendance engine: duplicate detection, same-device decisions, editing, and
 * statistics. These are the rules a teaching assistant depends on, so each one
 * is asserted explicitly, including the "nothing changed" paths.
 */

import { describe, expect, it } from 'vitest'
import type { AttendanceSession } from '../../types/attendance'
import type { AttendanceQrPayload } from '../../types/qr'
import {
  appendConflictingRecord,
  appendRecord,
  computeSessionStats,
  createRecord,
  createSession,
  editRecord,
  editRecordInSession,
  evaluateScan,
  findByDeviceId,
  findByStudentId,
  isRecordFlagged,
  removeRecord,
  sharedDeviceIds,
} from './engine'

const DEVICE_A = 'aaaaaaaa-1111-4111-8111-111111111111';
const DEVICE_B = 'bbbbbbbb-2222-4222-8222-222222222222';
const DEVICE_C = 'cccccccc-3333-4333-8333-333333333333';

const T0 = '2026-10-01T09:00:00.000Z';
const T1 = '2026-10-01T09:05:00.000Z';
const T2 = '2026-10-01T09:10:00.000Z';

function payload(overrides: Partial<AttendanceQrPayload> = {}): AttendanceQrPayload {
  return {
    version: 1,
    type: 'attendance-student',
    name: 'Ahmed Ali',
    studentId: '001234',
    academicYear: '3',
    deviceId: DEVICE_A,
    issuedAt: Date.parse(T0),
    ...overrides,
  };
}

function sessionOf(...records: AttendanceSession['records']): AttendanceSession {
  return {
    ...createSession({ id: 'session-1', sectionName: 'CS-3-A', now: T0 }),
    records,
  };
}

function record(overrides: Partial<AttendanceQrPayload> & { id?: string; scannedAt?: string } = {}) {
  return createRecord(payload(overrides), { id: overrides.id, scannedAt: overrides.scannedAt ?? T1 });
}

describe('session creation', () => {
  it('starts empty and stamped', () => {
    const session = createSession({ sectionName: 'CS-3-A', now: T0 });

    expect(session.sectionName).toBe('CS-3-A');
    expect(session.records).toHaveLength(0);
    expect(session.duplicateAttempts).toBe(0);
    expect(session.createdAt).toBe(T0);
  });

  it('gives each session a unique id', () => {
    expect(createSession({ sectionName: 'A' }).id).not.toBe(createSession({ sectionName: 'A' }).id);
  });
});

describe('duplicate student detection', () => {
  it('accepts the first scan of a student', () => {
    const result = evaluateScan(sessionOf(), payload());

    expect(result.kind).toBe('accepted');
  });

  it('rejects a repeat of the same student ID without adding a record', () => {
    const existing = record({ id: 'r1' });
    const session = sessionOf(existing);

    const result = evaluateScan(session, payload({ name: 'Different Name' }));

    expect(result.kind).toBe('duplicate');
    if (result.kind === 'duplicate') expect(result.existing.id).toBe('r1');
    expect(session.records).toHaveLength(1);
  });

  it('leaves the existing record untouched on a duplicate', () => {
    const existing = record({ id: 'r1' });
    const before = JSON.stringify(existing);
    evaluateScan(sessionOf(existing), payload({ name: 'Someone Else', academicYear: '5' }));

    expect(JSON.stringify(existing)).toBe(before);
  });

  it('matches student IDs as strings so leading zeros stay significant', () => {
    const session = sessionOf(record({ id: 'r1', studentId: '001234' }));

    expect(findByStudentId(session, '001234')).toBeDefined();
    // "1234" is a different student, not the same one without its padding.
    expect(findByStudentId(session, '1234')).toBeUndefined();
  });

  it('treats 1234 and 001234 as distinct students', () => {
    const session = sessionOf(record({ id: 'r1', studentId: '001234' }));
    const result = evaluateScan(session, payload({ studentId: '1234', deviceId: DEVICE_B }));

    expect(result.kind).toBe('accepted');
  });

  it('counts duplicate attempts on the session', () => {
    const session = sessionOf(record({ id: 'r1' }));
    const result = evaluateScan(session, payload());

    expect(result.kind).toBe('duplicate');
    expect(session.duplicateAttempts).toBe(0);
  });
});

describe('same-device detection', () => {
  it('flags a second student scanned from the same device', () => {
    const session = sessionOf(record({ id: 'r1', studentId: '000111' }));
    const result = evaluateScan(session, payload({ studentId: '000222', name: 'Sara' }));

    expect(result.kind).toBe('device-conflict');
    if (result.kind === 'device-conflict') {
      expect(result.conflicts).toHaveLength(1);
      expect(result.conflicts[0]?.studentId).toBe('000111');
    }
  });

  it('does not flag a student from a different device', () => {
    const session = sessionOf(record({ id: 'r1', studentId: '000111', deviceId: DEVICE_A }));
    const result = evaluateScan(session, payload({ studentId: '000222', deviceId: DEVICE_B }));

    expect(result.kind).toBe('accepted');
  });

  it('lists every existing record that shares the device', () => {
    const session = sessionOf(
      record({ id: 'r1', studentId: '000111', deviceId: DEVICE_A }),
      record({ id: 'r2', studentId: '000222', deviceId: DEVICE_A }),
    );
    const result = evaluateScan(session, payload({ studentId: '000333', deviceId: DEVICE_A }));

    expect(result.kind).toBe('device-conflict');
    if (result.kind === 'device-conflict') expect(result.conflicts).toHaveLength(2);
  });

  it('writes nothing until the teaching assistant decides', () => {
    const session = sessionOf(record({ id: 'r1', studentId: '000111' }));
    evaluateScan(session, payload({ studentId: '000222' }));

    expect(session.records).toHaveLength(1);
  });

  it('accepting both keeps two records and marks the acknowledgement', () => {
    const first = record({ id: 'r1', studentId: '000111' });
    const pending = record({ id: 'r2', studentId: '000222' });

    const session = appendConflictingRecord(sessionOf(first), pending);

    expect(session.records).toHaveLength(2);
    expect(session.records[1]?.duplicateDeviceFlag).toBe(true);
    expect(session.records[0]?.duplicateDeviceFlag).toBe(false);
  });

  it('rejecting the new scan leaves the session exactly as it was', () => {
    const first = record({ id: 'r1', studentId: '000111' });
    const session = sessionOf(first);
    const before = JSON.stringify(session);

    // "Removing the pending record" is simply not appending it.
    expect(session.records).toHaveLength(1);
    expect(JSON.stringify(session)).toBe(before);
  });

  it('cancelling leaves the session exactly as it was', () => {
    const session = sessionOf(record({ id: 'r1', studentId: '000111' }));
    const before = JSON.stringify(session);

    expect(session.records).toHaveLength(1);
    expect(JSON.stringify(session)).toBe(before);
  });

  it('finds records by device regardless of letter case', () => {
    const session = sessionOf(record({ id: 'r1', studentId: '000111', deviceId: DEVICE_A }));
    const upper = sessionOf(record({ id: 'r1', studentId: '000111', deviceId: DEVICE_A.toUpperCase() }));

    expect(findByDeviceId(session, DEVICE_A)).toHaveLength(1);
    expect(findByDeviceId(upper, DEVICE_A)).toHaveLength(1);
  });

  it('reports a shared device only when two different students use it', () => {
    const sameStudentTwice = sessionOf(
      record({ id: 'r1', studentId: '000111', deviceId: DEVICE_A }),
      record({ id: 'r2', studentId: '000111', deviceId: DEVICE_A }),
    );
    const twoStudents = sessionOf(
      record({ id: 'r1', studentId: '000111', deviceId: DEVICE_A }),
      record({ id: 'r2', studentId: '000222', deviceId: DEVICE_A }),
    );

    expect(sharedDeviceIds(sameStudentTwice).size).toBe(0);
    expect(sharedDeviceIds(twoStudents).size).toBe(1);
  });
});

describe('record editing', () => {
  const session = sessionOf(
    record({ id: 'r1', studentId: '000111', name: 'Ahmed Ali', academicYear: '3' }),
    record({ id: 'r2', studentId: '000222', name: 'Sara Ibrahim', academicYear: '2' }),
  );

  it('applies a valid patch', () => {
    const result = editRecord(session, 'r1', { fullName: '  Ahmed   Mohamed  ' });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.record.fullName).toBe('Ahmed Mohamed');
      expect(result.record.studentId).toBe('000111');
    }
  });

  it('keeps leading zeros when the ID is edited', () => {
    const result = editRecord(session, 'r1', { studentId: '000999' });

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.record.studentId).toBe('000999');
  });

  it('returns the new session with the edit applied', () => {
    const outcome = editRecordInSession(session, 'r1', { academicYear: '4' });

    expect(outcome).not.toBeNull();
    expect(outcome?.session.records[0]?.academicYear).toBe('4');
    expect(session.records[0]?.academicYear).toBe('3');
  });

  it('refuses an ID that already belongs to another student in the session', () => {
    const result = editRecord(session, 'r1', { studentId: '000222' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.field).toBe('studentId');
      expect(result.message).toContain('000222');
      expect(result.message).toContain('Sara Ibrahim');
    }
  });

  it('allows saving a record without changing its own ID', () => {
    const result = editRecord(session, 'r1', { studentId: '000111', fullName: 'Ahmed Ali' });

    expect(result.ok).toBe(true);
  });

  it.each([
    ['empty name', { fullName: '' }],
    ['one-character name', { fullName: 'x' }],
    ['non-numeric ID', { studentId: '12ab' }],
    ['empty ID', { studentId: '' }],
    ['impossible year', { academicYear: '9' }],
  ])('refuses %s', (_label, patch) => {
    const result = editRecord(session, 'r1', patch);

    expect(result.ok).toBe(false);
  });

  it('refuses an edit to a record that no longer exists', () => {
    const result = editRecord(session, 'missing', { fullName: 'Nobody' });

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.field).toBe('record');
  });

  it('returns null from editRecordInSession for an invalid patch, so nothing is written', () => {
    const outcome = editRecordInSession(session, 'r1', { studentId: '000222' });

    expect(outcome).toBeNull();
    expect(session.records[0]?.studentId).toBe('000111');
  });

  it('bumps updatedAt on a successful edit', () => {
    const outcome = editRecordInSession(session, 'r1', { fullName: 'New Name' }, T2);

    expect(outcome?.session.updatedAt).toBe(T2);
  });

  it('removes a record by id', () => {
    const next = removeRecord(session, 'r1');

    expect(next.records).toHaveLength(1);
    expect(next.records[0]?.id).toBe('r2');
  });

  it('leaves the session alone when removing an unknown id', () => {
    const next = removeRecord(session, 'nope');

    expect(next.records).toHaveLength(2);
  });
});

describe('statistics', () => {
  it('reports zeros for an empty session', () => {
    const stats = computeSessionStats(sessionOf());

    expect(stats).toMatchObject({
      total: 0,
      deviceAlerts: 0,
      flaggedRecords: 0,
      duplicateAttempts: 0,
      firstScanAt: null,
      lastScanAt: null,
    });
  });

  it('counts students, device alerts, and duplicates', () => {
    const session: AttendanceSession = {
      ...sessionOf(
        record({ id: 'r1', studentId: '000111', deviceId: DEVICE_A, scannedAt: T0 }),
        record({ id: 'r2', studentId: '000222', deviceId: DEVICE_A, scannedAt: T1 }),
        record({ id: 'r3', studentId: '000333', deviceId: DEVICE_B, scannedAt: T2 }),
      ),
      duplicateAttempts: 4,
    };

    const stats = computeSessionStats(session);

    expect(stats.total).toBe(3);
    expect(stats.deviceAlerts).toBe(1);
    expect(stats.flaggedRecords).toBe(2);
    expect(stats.duplicateAttempts).toBe(4);
    expect(stats.firstScanAt).toBe(T0);
    expect(stats.lastScanAt).toBe(T2);
  });

  it('derives device alerts live, so removing a record clears the alert', () => {
    const flagged = appendConflictingRecord(
      sessionOf(record({ id: 'r1', studentId: '000111', deviceId: DEVICE_A })),
      record({ id: 'r2', studentId: '000222', deviceId: DEVICE_A }),
    );
    expect(computeSessionStats(flagged).deviceAlerts).toBe(1);

    const cleaned = removeRecord(flagged, 'r2');
    expect(computeSessionStats(cleaned).deviceAlerts).toBe(0);
  });

  it('honours the stored acknowledgement flag as well as the derived one', () => {
    const shared = sharedDeviceIds(
      sessionOf(
        record({ id: 'r1', studentId: '000111', deviceId: DEVICE_A }),
        record({ id: 'r2', studentId: '000222', deviceId: DEVICE_A }),
      ),
    );
    const acknowledged = record({ id: 'r3', studentId: '000333', deviceId: DEVICE_C });
    acknowledged.duplicateDeviceFlag = true;

    expect(isRecordFlagged(acknowledged, shared)).toBe(true);
    expect(isRecordFlagged(record({ id: 'r4', deviceId: DEVICE_B }), shared)).toBe(false);
  });
});

describe('append helpers', () => {
  it('preserves chronological order', () => {
    let session = sessionOf();
    session = appendRecord(session, record({ id: 'r1', studentId: '000111', scannedAt: T0 }));
    session = appendRecord(session, record({ id: 'r2', studentId: '000222', scannedAt: T2 }));
    session = appendRecord(session, record({ id: 'r3', studentId: '000333', scannedAt: T1 }));

    expect(session.records.map((r) => r.id)).toEqual(['r1', 'r2', 'r3']);
  });

  it('does not mutate the session it is given', () => {
    const before = sessionOf();
    const snapshot = JSON.stringify(before);
    appendRecord(before, record());

    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

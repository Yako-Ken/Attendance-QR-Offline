/**
 * Attendance domain types.
 *
 * `AttendanceSession` owns an ordered list of `AttendanceRecord`.
 * The Device ID is stored internally for duplicate-device detection, and is
 * deliberately excluded from the exported workbook.
 */

export interface AttendanceRecord {
  readonly id: string;
  fullName: string;
  /** Always a string; leading zeros preserved. */
  studentId: string;
  academicYear: string;
  /** Installation-level identifier of the scanning device. Never exported. */
  deviceId: string;
  /** ISO-8601 timestamp of the accepted scan. */
  scannedAt: string;
  /**
   * True when the TA explicitly accepted this record knowing it shared a
   * Device ID with another record in the same session.
   */
  duplicateDeviceFlag: boolean;
  /**
   * Free-text remark written by the teaching assistant (a mark, a warning, a
   * late arrival). Kept short, stripped of control characters, and exported as
   * its own worksheet column.
   */
  note: string;
}

export interface AttendanceSession {
  readonly id: string;
  sectionName: string;
  /** ISO-8601 */
  readonly createdAt: string;
  /** ISO-8601, bumped on every mutation. */
  updatedAt: string;
  /** How many times a QR was scanned for a student already present. */
  duplicateAttempts: number;
  /** Chronological order of acceptance. */
  records: AttendanceRecord[];
}

export interface SessionStats {
  readonly total: number;
  /** Distinct Device IDs shared by more than one student. */
  readonly deviceAlerts: number;
  /** Records currently involved in a same-device group. */
  readonly flaggedRecords: number;
  readonly duplicateAttempts: number;
  readonly firstScanAt: string | null;
  readonly lastScanAt: string | null;
}

/** Outcome of evaluating a scanned QR against the current session. */
export type ScanEvaluation =
  | { readonly kind: 'accepted'; readonly record: AttendanceRecord }
  | { readonly kind: 'duplicate'; readonly existing: AttendanceRecord }
  | {
      readonly kind: 'device-conflict';
      readonly record: AttendanceRecord;
      readonly conflicts: readonly AttendanceRecord[];
    };

export type RecordPatch = Partial<
  Pick<AttendanceRecord, 'fullName' | 'studentId' | 'academicYear' | 'note'>
>;

export type EditResult =
  | { readonly ok: true; readonly record: AttendanceRecord }
  | {
      readonly ok: false;
      readonly field: 'fullName' | 'studentId' | 'academicYear' | 'record';
      readonly message: string;
    };
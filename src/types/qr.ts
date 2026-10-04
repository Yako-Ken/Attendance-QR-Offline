/**
 * QR contract.
 *
 * The payload is a small, versioned JSON document. It is *untrusted input*:
 * `parseAttendanceQr` treats everything as hostile (size limits, type checks,
 * strict field formats) and never throws.
 *
 * Schema version 1 also carries `issuedAt`, the moment the student's device
 * generated the code. The symbol on screen is regenerated every
 * `QR_ROTATION_MS`, and a scanner rejects anything older than `QR_MAX_AGE_MS`,
 * which means a screenshot taken minutes ago no longer scans.
 */

export const QR_SCHEMA_VERSION = 1;
export const QR_PAYLOAD_TYPE = 'attendance-student';

/** How often the student screen reissues its symbol. */
export const QR_ROTATION_MS = 5000;

/** Longest a displayed symbol may be scanned for and still be accepted. */
export const QR_MAX_AGE_MS = 6000;

/**
 * Above this age the problem is almost certainly an unsynchronised device
 * clock rather than a stale symbol, and the message says so instead of
 * blaming the student.
 */
export const QR_CLOCK_SKEW_THRESHOLD_MS = 5 * 60 * 1000;

/** Serialised form written into the QR code. */
export interface AttendanceQrPayload {
  readonly version: typeof QR_SCHEMA_VERSION;
  readonly type: typeof QR_PAYLOAD_TYPE;
  readonly name: string;
  readonly studentId: string;
  readonly academicYear: string;
  readonly deviceId: string;
  /** Epoch milliseconds, from the student's own device clock. */
  readonly issuedAt: number;
}

export type QrRejectionReason =
  | 'empty'
  | 'oversized'
  | 'not-json'
  | 'not-object'
  | 'unsupported-version'
  | 'wrong-type'
  | 'missing-field'
  | 'bad-name'
  | 'bad-student-id'
  | 'bad-academic-year'
  | 'bad-device-id'
  | 'bad-timestamp'
  | 'no-timestamp'
  | 'expired'
  | 'clock-skew';

export type QrParseResult =
  | { readonly ok: true; readonly payload: AttendanceQrPayload }
  | { readonly ok: false; readonly reason: QrRejectionReason; readonly message: string };
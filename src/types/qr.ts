/**
 * QR contract.
 *
 * The payload is a small, versioned JSON document. It is *untrusted input*:
 * `parseAttendanceQr` treats everything as hostile (size limits, type checks,
 * strict field formats) and never throws.
 */

export const QR_SCHEMA_VERSION = 1;
export const QR_PAYLOAD_TYPE = 'attendance-student';

/** Serialised form written into the QR code. */
export interface AttendanceQrPayload {
  readonly version: typeof QR_SCHEMA_VERSION;
  readonly type: typeof QR_PAYLOAD_TYPE;
  readonly name: string;
  readonly studentId: string;
  readonly academicYear: string;
  readonly deviceId: string;
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
  | 'bad-device-id';

export type QrParseResult =
  | { readonly ok: true; readonly payload: AttendanceQrPayload }
  | { readonly ok: false; readonly reason: QrRejectionReason; readonly message: string };
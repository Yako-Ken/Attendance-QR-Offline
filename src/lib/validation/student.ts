/**
 * Student input validation.
 *
 * Rules are explicit and return field-level messages so the form can show
 * accessible, specific errors instead of a single generic failure.
 *
 * `studentId` is validated as a string and is never parsed as a number, so
 * leading zeros such as "001234" survive everywhere.
 */

import { ACADEMIC_YEARS, isAcademicYear, type AcademicYear } from '../../types/student';

export interface StudentDraft {
  fullName: string;
  studentId: string;
  academicYear: string;
}

export interface NormalizedStudent {
  fullName: string;
  studentId: string;
  academicYear: AcademicYear;
}

export type StudentField = keyof StudentDraft;
export type StudentFieldErrors = Partial<Record<StudentField, string>>;

export type StudentValidation =
  | { readonly ok: true; readonly value: NormalizedStudent }
  | { readonly ok: false; readonly errors: StudentFieldErrors };

export const NAME_MIN = 2;
export const NAME_MAX = 80;
export const STUDENT_ID_MIN = 2;
export const STUDENT_ID_MAX = 20;

/** Arabic, Latin, or any other letter — a name must contain at least one. */
const LETTER = /\p{L}/u;
/** C0/C1 control characters are never legitimate in a name. */
const CONTROL = /[\p{Cc}\p{Cf}]/u;

export function normalizeName(input: string): string {
  return input.normalize('NFC').replace(/\s+/gu, ' ').trim();
}

export function normalizeStudentId(input: string): string {
  let out = '';
  for (const char of input.normalize('NFC')) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    // Drop whitespace, hyphens and the unicode dash variants that some
    // keyboards and copy-paste insert into IDs.
    const isDash = code === 0x2d || (code >= 0x2010 && code <= 0x2015) || code === 0x2212;
    const isSpace = code <= 0x20 || code === 0xa0 || code === 0x2007 || code === 0x202f;
    if (isDash || isSpace) continue;
    out += char;
  }
  return out;
}

export function validateFullName(input: string): string | null {
  const value = normalizeName(input);
  if (value.length === 0) return 'Enter your full name.';
  if (CONTROL.test(value)) return 'Remove any invisible or control characters.';
  if (value.length < NAME_MIN) return `Use at least ${NAME_MIN} characters.`;
  if (value.length > NAME_MAX) return `Keep the name under ${NAME_MAX} characters.`;
  if (!LETTER.test(value)) return 'Enter a real name.';
  return null;
}

export function validateStudentId(input: string): string | null {
  const value = normalizeStudentId(input);
  if (value.length === 0) return 'Enter your student ID.';
  if (!/^[0-9]+$/u.test(value)) return 'Use digits only.';
  if (value.length < STUDENT_ID_MIN) return `Use at least ${STUDENT_ID_MIN} digits.`;
  if (value.length > STUDENT_ID_MAX) return `Use at most ${STUDENT_ID_MAX} digits.`;
  return null;
}

/**
 * Academic years arrive as free text now, so normalise what a phone keyboard
 * might produce: Arabic-Indic digits are folded to ASCII, so typing "٣" on an
 * Arabic keyboard still yields a valid year instead of a confusing error.
 */
export function normalizeAcademicYear(input: string): string {
  let out = '';
  for (const char of input.normalize('NFKC').trim()) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if (code >= 0x0660 && code <= 0x0669) {
      out += String(code - 0x0660);
      continue;
    }
    if (code >= 0x06f0 && code <= 0x06f9) {
      out += String(code - 0x06f0);
      continue;
    }
    out += char;
  }
  return out;
}

export function validateAcademicYear(input: string): string | null {
  const value = normalizeAcademicYear(input);
  if (value.length === 0) return 'Enter your academic year.';
  if (!isAcademicYear(value)) {
    const allowed = ACADEMIC_YEARS.join(', ');
    return `Use a year between ${allowed}.`;
  }
  return null;
}

export function validateStudentDraft(draft: StudentDraft): StudentValidation {
  const errors: StudentFieldErrors = {};

  const nameError = validateFullName(draft.fullName);
  if (nameError !== null) errors.fullName = nameError;

  const idError = validateStudentId(draft.studentId);
  if (idError !== null) errors.studentId = idError;

  const yearError = validateAcademicYear(draft.academicYear);
  if (yearError !== null) errors.academicYear = yearError;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  const year = normalizeAcademicYear(draft.academicYear);
  if (!isAcademicYear(year)) return { ok: false, errors: { academicYear: 'Invalid year.' } };

  return {
    ok: true,
    value: {
      fullName: normalizeName(draft.fullName),
      studentId: normalizeStudentId(draft.studentId),
      academicYear: year,
    },
  };
}

/** Section names are free text; keep them short and printable. */
export const SECTION_MAX = 40;

export function validateSectionName(input: string): string | null {
  const value = input.normalize('NFC').replace(/\s+/gu, ' ').trim();
  if (value.length === 0) return 'Enter the section name.';
  if (CONTROL.test(value)) return 'Remove any invisible or control characters.';
  if (value.length > SECTION_MAX) return `Keep the section name under ${SECTION_MAX} characters.`;
  return null;
}

export function normalizeSectionName(input: string): string {
  return input.normalize('NFC').replace(/\s+/gu, ' ').trim();
}
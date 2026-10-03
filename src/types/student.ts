/**
 * Student domain types.
 *
 * `studentId` is deliberately typed as `string` and must never be coerced to a
 * number: university IDs such as "001234" must survive round-tripping through
 * storage, the QR payload, and the exported workbook.
 *
 * The Device ID is intentionally *not* part of this model. It is an
 * installation-level identifier owned by `services/device`, and must stay
 * independent of the editable student profile.
 */
export interface StudentProfile {
  readonly id: string;
  fullName: string;
  /** Always a string. Leading zeros are significant and preserved. */
  studentId: string;
  /** Study year, 1-7. */
  academicYear: AcademicYear;
  readonly createdAt: string;
  updatedAt: string;
}

export const ACADEMIC_YEARS = ['1', '2', '3', '4', '5', '6', '7'] as const;

export type AcademicYear = (typeof ACADEMIC_YEARS)[number];

export function isAcademicYear(value: unknown): value is AcademicYear {
  return typeof value === 'string' && (ACADEMIC_YEARS as readonly string[]).includes(value);
}

export function academicYearLabel(year: AcademicYear): string {
  return `${year} — ${ACADEMIC_YEAR_NAMES_AR[year]} · Year ${year}`;
}

export const ACADEMIC_YEAR_NAMES_AR: Record<AcademicYear, string> = {
  '1': 'السنة الأولى',
  '2': 'السنة الثانية',
  '3': 'السنة الثالثة',
  '4': 'السنة الرابعة',
  '5': 'السنة الخامسة',
  '6': 'السنة السادسة',
  '7': 'السنة السابعة',
};
/**
 * Filename sanitisation for locally generated downloads.
 *
 * Windows forbids `< > : " / \ | ? *` and ASCII control characters, reserves
 * trailing dots and spaces, and treats a handful of device names as special.
 * Arabic input is normalised to NFC; zero-width, bidirectional and combining
 * marks are removed so the produced name is stable across platforms.
 *
 * Implemented with explicit code-point tests rather than regular expressions so
 * the intent is readable and no invisible character ever appears in source.
 */

const FORBIDDEN_CHARS = new Set(['<', '>', ':', '"', '/', '\\', '|', '?', '*']);

const RESERVED = new Set([
  'con',
  'prn',
  'aux',
  'nul',
  ...Array.from({ length: 9 }, (_, index) => `com${index + 1}`),
  ...Array.from({ length: 9 }, (_, index) => `lpt${index + 1}`),
]);

const MAX_PART_LENGTH = 64;

function isControl(code: number): boolean {
  return code < 0x20 || code === 0x7f;
}

/**
 * Whitespace-like, dash, underscore, and Arabic formatting marks.
 *
 * The Arabic ranges are deliberately narrow: combining harakat and tatweel are
 * removed, but letters (U+0621-U+064A, U+066E-U+06D3) are preserved so a
 * section named in Arabic stays readable in the download list.
 */
function isSeparator(code: number): boolean {
  if (code === 0x20 || code === 0xa0 || code === 0x2d || code === 0x5f) return true;
  if (code >= 0x200b && code <= 0x200f) return true;
  if (code >= 0x202a && code <= 0x202e) return true;
  if (code >= 0x2060 && code <= 0x206f) return true;
  if (code === 0x0640) return true; // ARABIC TATWEEL
  if (code >= 0x064b && code <= 0x065f) return true; // harakat
  if (code === 0x0670) return true; // superscript alef
  if (code >= 0x06d6 && code <= 0x06ed) return true; // Quranic annotation signs
  return false;
}

export function sanitizeFilePart(input: string, fallback = 'session'): string {
  // NFKC folds full-width Latin into ASCII so "ＣＳ-３-Ａ" and "CS-3-A" agree.
  let out = '';
  for (const char of input.normalize('NFKC')) {
    const code = char.codePointAt(0);
    if (code === undefined) continue;
    if (isControl(code) || FORBIDDEN_CHARS.has(char)) {
      out += '-';
      continue;
    }
    out += isSeparator(code) ? '-' : char;
  }

  const cleaned = out
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+/, '')
    .replace(/[-.]+$/, '')
    .slice(0, MAX_PART_LENGTH)
    .replace(/[-.]+$/, '');

  if (cleaned === '' || RESERVED.has(cleaned.toLowerCase())) return fallback;
  return cleaned;
}

/** e.g. `attendance_cs-3-a_2026-10-01.xlsx` */
export function attendanceFileName(sectionName: string, dateStamp: string): string {
  const section = sanitizeFilePart(sectionName);
  const date = sanitizeFilePart(dateStamp, '1970-01-01');
  return `attendance_${section}_${date}.xlsx`;
}

/** e.g. `attendance_cs-3-a_2026-10-01_1432.xlsx` */
export function attendanceFileNameWithTime(
  sectionName: string,
  dateStamp: string,
  timeStamp: string,
): string {
  const section = sanitizeFilePart(sectionName);
  const date = sanitizeFilePart(dateStamp, '1970-01-01');
  const time = sanitizeFilePart(timeStamp, '0000');
  return `attendance_${section}_${date}_${time}.xlsx`;
}
/**
 * Export file names.
 *
 * An assistant types a name like `March attendance: week 3 / section A`, and that
 * has to become something Windows, macOS, and every browser download will accept
 * without complaint. The rules are applied here rather than in the panel so they
 * can be tested on their own and reused without dragging a component along.
 */

const EXTENSION = '.xlsx';

/** Long enough for a real description, short enough for every filesystem. */
const MAX_STEM = 96;

/**
 * Characters no filesystem accepts, plus anything that would be read as a path.
 * Control characters are handled separately in {@link stripControlCharacters},
 * because they cannot be written as a readable regex.
 */
const FORBIDDEN = /[<>:"/\\|?* -]/gu;

/**
 * Replace control characters with a dash.
 *
 * They can reach a file name by copy-and-paste and would otherwise be invisible
 * in the download list while still breaking the file on some systems.
 */
function stripControlCharacters(value: string): string {
  let result = '';
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0;
    result += code < 0x20 || code === 0x7f ? '-' : character;
  }

  return result;
}

/**
 * Reduce a user-typed name to something every filesystem accepts, always keeping
 * the `.xlsx` extension exactly once. Returns `null` when nothing usable is left,
 * which lets the caller explain the problem instead of saving a broken file.
 */
export function sanitizeExportName(input: string): string | null {
  const stem = stripControlCharacters(input.replace(/\.xlsx$/iu, '').trim().normalize('NFKC'));

  const cleaned = stem
    .replace(FORBIDDEN, '-')
    .replace(/-{2,}/gu, '-')
    .replace(/^[.-]+/u, '')
    .slice(0, MAX_STEM)
    .replace(/[.-]+$/u, '');

  if (cleaned === '') return null;

  return `${cleaned}${EXTENSION}`;
}
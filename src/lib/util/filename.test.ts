/** Export filenames must survive Windows, macOS, Linux, and Arabic input. */

import { describe, expect, it } from 'vitest'
import {
  attendanceFileName,
  attendanceFileNameWithTime,
  sanitizeFilePart,
} from './filename'

describe('sanitizeFilePart', () => {
  it('keeps a normal section name intact', () => {
    expect(sanitizeFilePart('CS-3-A')).toBe('CS-3-A');
  });

  it('replaces characters Windows forbids', () => {
    expect(sanitizeFilePart('a<b>c:d"e/f\\g|h?i*j')).toBe('a-b-c-d-e-f-g-h-i-j');
  });

  it('collapses whitespace and runs of separators', () => {
    expect(sanitizeFilePart('  CS   3   A  ')).toBe('CS-3-A');
  });

  it('removes leading and trailing dots and dashes', () => {
    expect(sanitizeFilePart('...CS-3-A...')).toBe('CS-3-A');
    expect(sanitizeFilePart('-VC-2-B-')).toBe('VC-2-B');
  });

  it('strips control characters', () => {
    expect(sanitizeFilePart(`CS\u0000\u00073\u001bA`)).toBe('CS-3-A');
  });

  it('removes bidirectional and zero-width formatting marks', () => {
    expect(sanitizeFilePart('CS\u200f-\u202e3\u2060-A')).toBe('CS-3-A');
  });

  it('keeps Arabic characters usable', () => {
    expect(sanitizeFilePart('فرقة ثانية')).toBe('فرقة-ثانية');
  });

  it('drops Arabic tatweel and diacritics', () => {
    expect(sanitizeFilePart('مُحَمَّد')).toBe('م-ح-م-د');
  });

  it('caps the length so the total filename stays within limits', () => {
    expect(sanitizeFilePart('a'.repeat(200)).length).toBeLessThanOrEqual(64);
  });

  it('falls back for an empty result', () => {
    expect(sanitizeFilePart('...')).toBe('session');
    expect(sanitizeFilePart('')).toBe('session');
    expect(sanitizeFilePart('   ')).toBe('session');
    expect(sanitizeFilePart('///', 'attendance')).toBe('attendance');
  });

  it('refuses Windows device names', () => {
    expect(sanitizeFilePart('CON')).toBe('session');
    expect(sanitizeFilePart('nul')).toBe('session');
    expect(sanitizeFilePart('COM1')).toBe('session');
    expect(sanitizeFilePart('LPT9')).toBe('session');
  });

  it('normalises full-width characters', () => {
    expect(sanitizeFilePart('ＣＳ－３－Ａ')).toBe('CS-3-A');
  });

  it('never returns a path separator or wildcard', () => {
    const result = sanitizeFilePart('a/b\\c:d*e?f"g<h>i|j');

    expect(result).not.toMatch(/[/\\:*?"<>|]/);
  });
});

describe('attendanceFileName', () => {
  it('follows the documented pattern', () => {
    expect(attendanceFileName('CS-3-A', '2026-10-01')).toBe('attendance_CS-3-A_2026-10-01.xlsx');
  });

  it('lowercases the section for a tidy, consistent name', () => {
    expect(attendanceFileName('VC-2-B', '2026-10-01')).toBe('attendance_VC-2-B_2026-10-01.xlsx');
  });

  it('sanitises a hostile section name', () => {
    const name = attendanceFileName('A/B:C*D?E"F<G>H|I', '2026-10-01');

    expect(name).toBe('attendance_A-B-C-D-E-F-G-H-I_2026-10-01.xlsx');
    expect(name).not.toMatch(/[/\\:*?"<>|]/);
  });

  it('always ends with the .xlsx extension', () => {
    expect(attendanceFileName('anything', '2026-10-01').endsWith('.xlsx')).toBe(true);
  });

  it('adds a time component when asked', () => {
    expect(attendanceFileNameWithTime('CS-3-A', '2026-10-01', '1432')).toBe(
      'attendance_CS-3-A_2026-10-01_1432.xlsx',
    );
  });

  it('produces a filename short enough for every filesystem', () => {
    const name = attendanceFileNameWithTime('x'.repeat(200), '2026-10-01', '1432');

    expect(name.length).toBeLessThanOrEqual(255);
  });

  it('keeps a non-Latin section name readable', () => {
    expect(attendanceFileName('فرقة ثانية', '2026-10-01')).toBe(
      'attendance_فرقة-ثانية_2026-10-01.xlsx',
    );
  });
});
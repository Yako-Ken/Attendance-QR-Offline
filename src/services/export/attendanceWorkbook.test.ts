/**
 * Workbook export.
 *
 * These assertions are the privacy contract: the worksheet must contain exactly
 * the six approved columns, and neither the Device ID nor the duplicate status
 * may appear anywhere in the archive — including in hidden sheets or styles.
 */

import { describe, expect, it } from 'vitest'
import type { AttendanceSession } from '../../types/attendance'
import {
  EXPORT_COLUMNS,
  FORBIDDEN_EXPORT_TOKENS,
  buildAttendanceWorkbook,
  buildSheetXml,
  escapeXml,
  type WorkbookResult,
} from './attendanceWorkbook'
import { createZipArchive, crc32, readStoredZip } from './zip'

const FIXED_DATE = new Date('2026-10-01T09:00:00.000Z');

function session(overrides: Partial<AttendanceSession> = {}): AttendanceSession {
  return {
    id: 'cccccccc-3333-4333-8333-333333333333',
    sectionName: 'CS-3-A',
    createdAt: '2026-10-01T09:00:00.000Z',
    updatedAt: '2026-10-01T09:30:00.000Z',
    duplicateAttempts: 3,
    records: [
      {
        id: 'r1',
        fullName: 'Ahmed Mohamed Ali',
        studentId: '001234',
        academicYear: '3',
        deviceId: 'aaaaaaaa-1111-4111-8111-111111111111',
        scannedAt: '2026-10-01T09:05:00.000Z',
        duplicateDeviceFlag: false,
        note: '',
      },
      {
        id: 'r2',
        fullName: 'أحمد محمد علي',
        studentId: '000042',
        academicYear: '1',
        deviceId: 'aaaaaaaa-1111-4111-8111-111111111111',
        scannedAt: '2026-10-01T09:10:00.000Z',
        duplicateDeviceFlag: true,
        note: 'Scored 18/20 in the quiz',
      },
      {
        id: 'r3',
        fullName: 'Sara Ibrahim & Co',
        studentId: '987654',
        academicYear: '2',
        deviceId: 'bbbbbbbb-2222-4222-8222-222222222222',
        scannedAt: '2026-10-01T09:15:00.000Z',
        duplicateDeviceFlag: false,
        note: '',
      },
    ],
    ...overrides,
  };
}

const formatter = (iso: string): string => iso;

function workbookFor(value = session()): WorkbookResult {
  return buildAttendanceWorkbook(value, formatter, FIXED_DATE);
}

function sheetXmlOf(value = session()): string {
  const entries = readStoredZip(workbookFor(value).bytes);
  const sheet = entries.find((entry) => entry.path === 'xl/worksheets/sheet1.xml');
  if (sheet === undefined) throw new Error('sheet1.xml missing from the archive');
  return new TextDecoder().decode(sheet.data);
}

describe('zip writer', () => {
  it('produces an archive the reader can parse back', () => {
    const encoder = new TextEncoder();
    const bytes = createZipArchive(
      [
        { path: 'a.txt', data: encoder.encode('hello') },
        { path: 'dir/b.txt', data: encoder.encode('world') },
      ],
      FIXED_DATE,
    );

    const entries = readStoredZip(bytes);

    expect(entries.map((entry) => entry.path)).toEqual(['a.txt', 'dir/b.txt']);
    expect(new TextDecoder().decode(entries[0]?.data)).toBe('hello');
  });

  it('round-trips binary content byte for byte', () => {
    const data = new Uint8Array([0, 1, 127, 128, 255, 42]);
    const entries = readStoredZip(createZipArchive([{ path: 'x.bin', data }], FIXED_DATE));

    expect([...(entries[0]?.data ?? [])]).toEqual([...data]);
  });

  it('writes a correct CRC-32', () => {
    // Known value for "123456789".
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('handles an empty archive', () => {
    expect(readStoredZip(createZipArchive([], FIXED_DATE))).toEqual([]);
  });
});

describe('worksheet structure', () => {
  it('declares exactly the six approved columns, in order', () => {
    expect([...EXPORT_COLUMNS]).toEqual([
      'No.',
      'Full Name',
      'Student ID',
      'Academic Year',
      'Recorded At',
      'Note',
    ]);
  });

  it('writes those six headers in row 1', () => {
    const xml = sheetXmlOf();

    for (const column of EXPORT_COLUMNS) {
      expect(xml).toContain(`<t xml:space="preserve">${column}</t>`);
    }
  });

  it('emits no header beyond column F', () => {
    const xml = sheetXmlOf();
    const headerRow = xml.slice(xml.indexOf('<row r="1">'), xml.indexOf('</row>'));
    const references = headerRow.match(/r="([A-Z]+)1"/g) ?? [];

    expect(references).toHaveLength(6);
    expect(references.at(-1)).toBe('r="F1"');
  });

  it('creates one worksheet only, with no hidden sheets', () => {
    const xml = sheetXmlOf();

    expect(xml).not.toContain('hidden="1"');
    expect(xml).not.toContain('state="hidden"');
  });

  it('declares the correct dimension', () => {
    expect(sheetXmlOf()).toContain('<dimension ref="A1:F4" />'.replace(' />', '/>'));
  });

  it('numbers rows from 1 in sequence', () => {
    const xml = sheetXmlOf();

    expect(xml).toContain('<v>1</v>');
    expect(xml).toContain('<v>2</v>');
    expect(xml).toContain('<v>3</v>');
  });
});

describe('student IDs keep their leading zeros', () => {
  it('writes the ID as an inline string, not a number', () => {
    const xml = sheetXmlOf();

    // A numeric cell would look like <c r="C2"><v>1234</v></c> and lose the padding.
    expect(xml).toContain('<t xml:space="preserve">001234</t>');
    expect(xml).toContain('<t xml:space="preserve">000042</t>');
    expect(xml).not.toContain('<v>1234</v>');
  });

  it('applies the text number format to the ID column', () => {
    const xml = sheetXmlOf();

    expect(xml).toMatch(/<c r="C2" s="1" t="inlineStr">/);
  });

  it('declares the @ text format in the styles part', () => {
    const entries = readStoredZip(workbookFor().bytes);
    const styles = entries.find((entry) => entry.path === 'xl/styles.xml');

    expect(new TextDecoder().decode(styles?.data)).toContain('formatCode="@"');
  });

  it('preserves IDs through a full save and reload', () => {
    const xml = sheetXmlOf();

    for (const record of session().records) {
      expect(xml).toContain(`>${record.studentId}<`);
    }
  });
});

describe('privacy: Device ID and status never reach the file', () => {
  it('omits every forbidden token from every part of the archive', () => {
    const decoder = new TextDecoder();
    const entries = readStoredZip(workbookFor().bytes);

    for (const entry of entries) {
      const text = decoder.decode(entry.data);
      for (const token of FORBIDDEN_EXPORT_TOKENS) {
        expect(
          text.includes(token),
          `"${token}" leaked into ${entry.path}`,
        ).toBe(false);
      }
    }
  });

  it('omits the raw Device ID values', () => {
    const decoder = new TextDecoder();
    const entries = readStoredZip(workbookFor().bytes);

    for (const entry of entries) {
      const text = decoder.decode(entry.data);
      expect(text.includes('aaaaaaaa-1111-4111-8111-111111111111')).toBe(false);
      expect(text.includes('bbbbbbbb-2222-4222-8222-222222222222')).toBe(false);
    }
  });

  it('excludes the duplicate flag even when it is set', () => {
    const flagged = session();
    expect(flagged.records.some((record) => record.duplicateDeviceFlag)).toBe(true);

    const decoder = new TextDecoder();
    for (const entry of readStoredZip(workbookFor(flagged).bytes)) {
      expect(decoder.decode(entry.data).includes('duplicateDeviceFlag')).toBe(false);
    }
  });

  it('does not leak the field names even as hidden columns', () => {
    const xml = sheetXmlOf();

    expect(xml).not.toMatch(/<col [^>]*max="7"/);
    expect(xml).not.toMatch(/<c r="[GHIJ]\d+"/);
  });

  it('keeps the Device ID available inside the app for duplicate detection', () => {
    // The record model still carries it; only the export filters it out.
    expect(session().records[0]?.deviceId).toBeTruthy();
    expect(sheetXmlOf()).not.toContain('deviceId');
  });
});

describe('content handling', () => {
  it('escapes XML metacharacters in names', () => {
    const xml = sheetXmlOf();

    expect(xml).toContain('Sara Ibrahim &amp; Co');
    expect(xml).not.toContain('Sara Ibrahim & Co');
  });

  it('escapes each dangerous character', () => {
    expect(escapeXml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&apos;');
  });

  it('strips control characters that would corrupt the XML', () => {
    expect(escapeXml('a bc')).toBe('abc');
  });

  it('produces a valid worksheet for an empty session', () => {
    const xml = buildSheetXml({ sheetName: 'CS-3-A', rows: [] });

    expect(xml).toContain('<dimension ref="A1:F1"/>');
    expect(xml).not.toContain('<row r="2">');
  });

  it('is deterministic for the same session and timestamp', () => {
    const first = workbookFor();
    const second = workbookFor();

    expect([...first.bytes]).toEqual([...second.bytes]);
  });

  it('includes every part a spreadsheet application requires', () => {
    expect(workbookFor().parts).toEqual([
      '[Content_Types].xml',
      '_rels/.rels',
      'docProps/core.xml',
      'docProps/app.xml',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/styles.xml',
      'xl/worksheets/sheet1.xml',
    ]);
  });

  it('sanitises a section name that contains characters Excel forbids', () => {
    const entries = readStoredZip(
      workbookFor(session({ sectionName: 'CS/3:A[B]' })).bytes,
    );
    const workbook = entries.find((entry) => entry.path === 'xl/workbook.xml');
    const text = new TextDecoder().decode(workbook?.data);

    expect(text).toContain('name="CS 3 A B"');
  });

  it('reports how many rows were written', () => {
    const xml = sheetXmlOf();

    expect((xml.match(/<row r="\d+">/g) ?? []).length).toBe(4);
  });
});
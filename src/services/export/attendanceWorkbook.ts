/**
 * Attendance workbook generation.
 *
 * The exported worksheet is deliberately minimal and fixed: five columns,
 * `No.`, `Full Name`, `Student ID`, `Academic Year`, `Recorded At`. The Device
 * ID and the duplicate flag are internal detection signals and must never reach
 * the file the university receives.
 *
 * Student IDs are written as inline text cells, not numbers, so Excel keeps the
 * leading zeros of values such as "001234" instead of silently coercing them.
 */

import type { AttendanceSession } from '../../types/attendance';
import { createZipArchive, type ZipEntry } from './zip';

/** The only columns that appear in the exported worksheet, in order. */
export const EXPORT_COLUMNS = [
  'No.',
  'Full Name',
  'Student ID',
  'Academic Year',
  'Recorded At',
  'Note',
] as const;

export type ExportColumn = (typeof EXPORT_COLUMNS)[number];

/**
 * Substrings that must never appear anywhere in the workbook. Asserted by the
 * test suite and used to build a defence-in-depth check in the generator.
 */
export const FORBIDDEN_EXPORT_TOKENS = [
  'Device ID',
  'DeviceId',
  'deviceId',
  'device_id',
  'Status',
  'status',
] as const;

const XML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&apos;',
};

/** Escape text for XML content. Control characters are dropped. */
export function escapeXml(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) continue;
    const replacement = XML_ESCAPES[char];
    out += replacement ?? char;
  }
  return out;
}

function columnName(index: number): string {
  let name = '';
  let remaining = index + 1;
  while (remaining > 0) {
    const digit = (remaining - 1) % 26;
    name = String.fromCharCode(65 + digit) + name;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return name;
}

interface Cell {
  readonly reference: string;
  readonly type: 'number' | 'inlineStr';
  readonly value: number | string;
}

interface Row {
  readonly cells: readonly Cell[];
}

function textCell(row: number, column: number, value: string): Cell {
  return {
    reference: `${columnName(column)}${row}`,
    type: 'inlineStr',
    value,
  };
}

function numberCell(row: number, column: number, value: number): Cell {
  return { reference: `${columnName(column)}${row}`, type: 'number', value };
}

export interface WorkbookRow {
  readonly fullName: string;
  readonly studentId: string;
  readonly academicYear: string;
  readonly recordedAt: string;
  readonly note: string;
}

export interface BuildWorkbookInput {
  readonly sheetName: string;
  readonly rows: readonly WorkbookRow[];
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;

const WORKBOOK_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;

/**
 * Style index 1 is a text format (`@`). Applying it to the Student ID column
 * makes Excel treat it as text, which is what preserves leading zeros even if a
 * user retypes the cell.
 */
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="@"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs></styleSheet>`;

function coreProperties(sectionName: string, generatedAt: Date): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Attendance — ${escapeXml(sectionName)}</dc:title><dc:creator>Attendance QR</dc:creator><cp:lastModifiedBy>Attendance QR</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${generatedAt.toISOString()}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${generatedAt.toISOString()}</dcterms:modified></cp:coreProperties>`;
}

const APP_PROPERTIES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Attendance QR</Application></Properties>`;

/** Excel rejects sheet names longer than 31 characters or containing []:*?/\ */
function safeSheetName(input: string): string {
  const cleaned = input.replace(/[[\]:*?/\\]/g, ' ').trim();
  return cleaned.slice(0, 31) || 'Attendance';
}

function renderRow(row: Row, rowIndex: number, headerStyle: boolean): string {
  const cells = row.cells
    .map((cell) => {
      const style = headerStyle ? (cell.type === 'inlineStr' ? ' s="3"' : ' s="2"') : '';
      if (cell.type === 'number') return `<c r="${cell.reference}"${style}><v>${cell.value}</v></c>`;
      return `<c r="${cell.reference}"${style} t="inlineStr"><is><t xml:space="preserve">${escapeXml(String(cell.value))}</t></is></c>`;
    })
    .join('');
  return `<row r="${rowIndex}">${cells}</row>`;
}

/** Style index 1 is the text number format, applied only to Student ID. */
const TEXT_FORMAT_STYLE = ' s="1"';

export function buildSheetXml(input: BuildWorkbookInput): string {
  const header: Row = {
    cells: EXPORT_COLUMNS.map((column, index) => textCell(1, index, column)),
  };

  const bodyRows = input.rows.map((row, index): string => {
    const rowIndex = index + 2;
    const cells: Cell[] = [
      numberCell(rowIndex, 0, index + 1),
      textCell(rowIndex, 1, row.fullName),
      textCell(rowIndex, 2, row.studentId),
      textCell(rowIndex, 3, row.academicYear),
      textCell(rowIndex, 4, row.recordedAt),
      textCell(rowIndex, 5, row.note),
    ];
    const body: Row = { cells };
    return renderRow(body, rowIndex, false).replace(
      /(<c r="C\d+")/,
      `$1${TEXT_FORMAT_STYLE}`,
    );
  });

  const lastColumn = columnName(EXPORT_COLUMNS.length - 1);
  const lastRow = input.rows.length + 1;

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${lastColumn}${Math.max(1, lastRow)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="6" customWidth="1"/><col min="2" max="2" width="34" customWidth="1"/><col min="3" max="3" width="16" customWidth="1"/><col min="4" max="4" width="15" customWidth="1"/><col min="5" max="5" width="22" customWidth="1"/><col min="6" max="6" width="30" customWidth="1"/></cols><sheetData>${renderRow(header, 1, true)}${bodyRows.join('')}</sheetData><autoFilter ref="A1:${lastColumn}${Math.max(1, lastRow)}"/></worksheet>`;
}

export function buildWorkbookXml(sectionName: string): string {
  const sheetName = safeSheetName(sectionName);
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`;
}

export interface WorkbookResult {
  readonly bytes: Uint8Array;
  readonly parts: readonly string[];
}

/**
 * Build the `.xlsx` bytes for one session.
 *
 * `new Date()` is injected so the archive is deterministic in tests.
 */
export function buildAttendanceWorkbook(
  session: AttendanceSession,
  recordedAtFormatter: (iso: string) => string,
  now: Date = new Date(),
): WorkbookResult {
  const rows: WorkbookRow[] = session.records.map((record) => ({
    fullName: record.fullName,
    studentId: record.studentId,
    academicYear: record.academicYear,
    recordedAt: recordedAtFormatter(record.scannedAt),
    note: record.note ?? '',
  }));

  const encoder = new TextEncoder();
  const entries: ZipEntry[] = [
    { path: '[Content_Types].xml', data: encoder.encode(CONTENT_TYPES) },
    { path: '_rels/.rels', data: encoder.encode(ROOT_RELS) },
    { path: 'docProps/core.xml', data: encoder.encode(coreProperties(session.sectionName, now)) },
    { path: 'docProps/app.xml', data: encoder.encode(APP_PROPERTIES) },
    { path: 'xl/workbook.xml', data: encoder.encode(buildWorkbookXml(session.sectionName)) },
    { path: 'xl/_rels/workbook.xml.rels', data: encoder.encode(WORKBOOK_RELS) },
    { path: 'xl/styles.xml', data: encoder.encode(STYLES) },
    {
      path: 'xl/worksheets/sheet1.xml',
      data: encoder.encode(buildSheetXml({ sheetName: session.sectionName, rows })),
    },
  ];

  return {
    bytes: createZipArchive(entries, now),
    parts: entries.map((entry) => entry.path),
  };
}
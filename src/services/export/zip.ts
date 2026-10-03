/**
 * Minimal ZIP writer.
 *
 * An `.xlsx` file is a ZIP archive of OOXML parts. Only the *stored* (method 0)
 * compression is used, which needs no deflate implementation and produces an
 * archive every consumer — Excel, LibreOffice, Numbers, Google Sheets — reads
 * happily. The resulting file is a little larger than a deflated one, which is
 * irrelevant for a single worksheet, and it keeps the export path completely
 * dependency-free and instant.
 */

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL = 0x06054b50;
const UTF8_FLAG = 0x0800;
const VERSION = 20;

export interface ZipEntry {
  readonly path: string;
  readonly data: Uint8Array;
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable !== null) return crcTable;
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  crcTable = table;
  return table;
}

export function crc32(bytes: Uint8Array): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (table[((crc ^ byte) & 0xff)] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * MS-DOS packed date/time. Excel ignores the value but the fields must be
 * present and must not encode a year before 1980.
 */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (Math.floor(date.getSeconds() / 2) & 0x1f) |
      ((date.getMinutes() & 0x3f) << 5) |
      ((date.getHours() & 0x1f) << 11),
    date:
      (date.getDate() & 0x1f) |
      (((date.getMonth() + 1) & 0x0f) << 5) |
      (((year - 1980) & 0x7f) << 9),
  };
}

class ByteWriter {
  private buffer: Uint8Array;
  private view: DataView;
  length = 0;

  constructor(capacity = 8192) {
    this.buffer = new Uint8Array(capacity);
    this.view = new DataView(this.buffer.buffer);
  }

  private ensure(extra: number): void {
    if (this.length + extra <= this.buffer.length) return;
    let size = this.buffer.length * 2;
    while (size < this.length + extra) size *= 2;
    const grown = new Uint8Array(size);
    grown.set(this.buffer.subarray(0, this.length));
    this.buffer = grown;
    this.view = new DataView(grown.buffer);
  }

  u16(value: number): void {
    this.ensure(2);
    this.view.setUint16(this.length, value & 0xffff, true);
    this.length += 2;
  }

  u32(value: number): void {
    this.ensure(4);
    this.view.setUint32(this.length, value >>> 0, true);
    this.length += 4;
  }

  bytes(value: Uint8Array): void {
    this.ensure(value.length);
    this.buffer.set(value, this.length);
    this.length += value.length;
  }

  result(): Uint8Array {
    return this.buffer.slice(0, this.length);
  }
}

export function createZipArchive(entries: readonly ZipEntry[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);
  const writer = new ByteWriter();
  const central: { name: Uint8Array; crc: number; size: number; offset: number }[] = [];

  for (const entry of entries) {
    const name = encoder.encode(entry.path);
    const crc = crc32(entry.data);
    const offset = writer.length;

    writer.u32(LOCAL_HEADER);
    writer.u16(VERSION);
    writer.u16(UTF8_FLAG);
    writer.u16(0); // stored
    writer.u16(time);
    writer.u16(date);
    writer.u32(crc);
    writer.u32(entry.data.length);
    writer.u32(entry.data.length);
    writer.u16(name.length);
    writer.u16(0);
    writer.bytes(name);
    writer.bytes(entry.data);

    central.push({ name, crc, size: entry.data.length, offset });
  }

  const centralStart = writer.length;
  for (const entry of central) {
    writer.u32(CENTRAL_HEADER);
    writer.u16(VERSION);
    writer.u16(VERSION);
    writer.u16(UTF8_FLAG);
    writer.u16(0);
    writer.u16(time);
    writer.u16(date);
    writer.u32(entry.crc);
    writer.u32(entry.size);
    writer.u32(entry.size);
    writer.u16(entry.name.length);
    writer.u16(0);
    writer.u16(0);
    writer.u16(0);
    writer.u16(0);
    writer.u32(0);
    writer.u32(entry.offset);
    writer.bytes(entry.name);
  }
  const centralSize = writer.length - centralStart;

  writer.u32(END_OF_CENTRAL);
  writer.u16(0);
  writer.u16(0);
  writer.u16(central.length);
  writer.u16(central.length);
  writer.u32(centralSize);
  writer.u32(centralStart);
  writer.u16(0);

  return writer.result();
}

/* -------------------------------------------------------------------------- */
/* Reader — used by the export tests to prove the archive is well formed       */
/* -------------------------------------------------------------------------- */

export interface ReadZipEntry {
  readonly path: string;
  readonly data: Uint8Array;
}

/** Parses a stored-method archive. Throws on any structural inconsistency. */
export function readStoredZip(archive: Uint8Array): ReadZipEntry[] {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  const decoder = new TextDecoder();

  // Locate the end-of-central-directory record by scanning backwards.
  let eocd = -1;
  for (let i = archive.length - 22; i >= 0; i -= 1) {
    if (view.getUint32(i, true) === END_OF_CENTRAL) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('Not a ZIP archive: end of central directory not found.');

  const count = view.getUint16(eocd + 10, true);
  let pointer = view.getUint32(eocd + 16, true);
  const entries: ReadZipEntry[] = [];

  for (let i = 0; i < count; i += 1) {
    if (view.getUint32(pointer, true) !== CENTRAL_HEADER) {
      throw new Error(`Corrupt central directory entry ${i}.`);
    }
    const method = view.getUint16(pointer + 10, true);
    if (method !== 0) throw new Error(`Unsupported compression method ${method}.`);
    const size = view.getUint32(pointer + 24, true);
    const nameLength = view.getUint16(pointer + 28, true);
    const extraLength = view.getUint16(pointer + 30, true);
    const commentLength = view.getUint16(pointer + 32, true);
    const localOffset = view.getUint32(pointer + 42, true);
    const path = decoder.decode(archive.subarray(pointer + 46, pointer + 46 + nameLength));

    if (view.getUint32(localOffset, true) !== LOCAL_HEADER) {
      throw new Error(`Corrupt local header for ${path}.`);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    entries.push({ path, data: archive.subarray(dataStart, dataStart + size) });

    pointer += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}
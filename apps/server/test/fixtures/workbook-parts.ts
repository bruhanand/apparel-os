import { crc32, deflateRawSync, inflateRawSync } from 'node:zlib';

// S1-F06-T02: a SYNTHETIC workbook changed part by part, to make the files intake refuses (imports-and-opening-data
// 9.3, 17 tests 1 and 28; code-house-rules 11.1): a macro project, an embedded object, a link to another workbook, a
// data connection, a damaged entry. A minimal zip reader and writer (PKWARE APPNOTE 4.3), for tests only: the
// workbooks it starts from are made by ExcelJS in the test, never read from disk.

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_RECORD = 0x06054b50;

/** The entries of a zip container, in their order, each inflated. */
export function partsOf(zip: Buffer): Map<string, Buffer> {
  let end = zip.length - 22;
  while (end >= 0 && zip.readUInt32LE(end) !== END_RECORD) end -= 1;
  if (end < 0) throw new Error('Not a zip container');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const parts = new Map<string, Buffer>();
  for (let index = 0; index < count; index += 1) {
    if (zip.readUInt32LE(at) !== CENTRAL_HEADER) throw new Error('A broken central directory');
    const method = zip.readUInt16LE(at + 10);
    const compressed = zip.readUInt32LE(at + 20);
    const nameLength = zip.readUInt16LE(at + 28);
    const extraLength = zip.readUInt16LE(at + 30);
    const commentLength = zip.readUInt16LE(at + 32);
    const local = zip.readUInt32LE(at + 42);
    const name = zip.toString('utf8', at + 46, at + 46 + nameLength);
    const dataStart = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
    const data = zip.subarray(dataStart, dataStart + compressed);
    parts.set(name, method === 0 ? Buffer.from(data) : inflateRawSync(data));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return parts;
}

/** A zip container of the parts given, each deflated, in the order given. */
export function zipOf(parts: ReadonlyMap<string, Buffer>): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, content] of parts) {
    const nameBytes = Buffer.from(name, 'utf8');
    const data = deflateRawSync(content);
    const sum = crc32(content);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(LOCAL_HEADER, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(sum, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(content.length, 22);
    local.writeUInt16LE(nameBytes.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(CENTRAL_HEADER, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(sum, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, nameBytes, data);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const directory = Buffer.concat(centrals);
  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(END_RECORD, 0);
  endRecord.writeUInt16LE(parts.size, 8);
  endRecord.writeUInt16LE(parts.size, 10);
  endRecord.writeUInt32LE(directory.length, 12);
  endRecord.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, endRecord]);
}

/**
 * The workbook with parts added, replaced (a function of the old content) or removed (null). Text is written as
 * UTF-8.
 */
export function withParts(
  workbook: Buffer,
  changes: Readonly<Record<string, string | Buffer | ((old: string) => string) | null>>,
): Buffer {
  const parts = partsOf(workbook);
  for (const [name, change] of Object.entries(changes)) {
    if (change === null) parts.delete(name);
    else if (typeof change === 'function') parts.set(name, Buffer.from(change(parts.get(name)?.toString('utf8') ?? '')));
    else parts.set(name, typeof change === 'string' ? Buffer.from(change, 'utf8') : change);
  }
  return zipOf(parts);
}

/** A relationship added to a `.rels` part, before its closing tag. */
export function withRelationship(rels: string, id: string, type: string, target: string, external: boolean): string {
  const mode = external ? ' TargetMode="External"' : '';
  return rels.replace(
    '</Relationships>',
    `<Relationship Id="${id}" Type="${type}" Target="${target}"${mode}/></Relationships>`,
  );
}

/** The relationship types the tests name (ECMA-376 Part 1). */
export const RELATIONSHIP = {
  externalLink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLink',
  externalLinkPath: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/externalLinkPath',
  hyperlink: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink',
  image: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/image',
  oleObject: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/oleObject',
  vbaProject: 'http://schemas.microsoft.com/office/2006/relationships/vbaProject',
} as const;

/** A SYNTHETIC external link part: a cell of another workbook, cached (A-9). */
export const SYNTHETIC_EXTERNAL_LINK_PART =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<externalLink xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<externalBook r:id="rId1"><sheetNames><sheetName val="SYNTHETIC"/></sheetNames>' +
  '<sheetDataSet><sheetData sheetId="0"><row r="1"><cell r="A1"><v>1</v></cell></row></sheetData></sheetDataSet>' +
  '</externalBook></externalLink>';

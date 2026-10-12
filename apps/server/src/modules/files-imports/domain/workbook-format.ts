// The format of an import file, found from its content and never from its name (imports-and-opening-data 9.2, class
// A-1; PRD-IMP-001, PRD-IMP-002; S1-F06-T01). Stage 1 reads XLSX only: a zip container with a workbook part. The XLS,
// XLSB and CSV readers come in stage 2 with S2-F13 (DEC-115); PDF, JPEG and PNG are kept only as evidence (S1-F06-T05).
// Pure: bytes in, an outcome out. The safety refusals and caps of 9.3 for workbooks are S1-F06-T02's.

export type ImportFileOutcome =
  | { readonly kind: 'accepted'; readonly format: 'xlsx' }
  | { readonly kind: 'refused'; readonly code: 'files-imports.type-not-allowed'; readonly missing?: undefined };

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const END_RECORD_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;

/** The part every XLSX workbook holds, and the one the reader opens (ExcelJS reads the workbook from this name). */
const WORKBOOK_PART = 'xl/workbook.xml';

/**
 * The names of a zip container's entries, from its central directory, or undefined when the bytes are no complete zip
 * container. Reads the directory only: nothing is inflated (PKWARE APPNOTE 4.3.12, 4.3.16).
 */
export function zipEntryNames(bytes: Buffer): string[] | undefined {
  if (bytes.length < END_RECORD_BYTES + 4 || bytes.readUInt32LE(0) !== LOCAL_HEADER) return undefined;
  const earliest = Math.max(0, bytes.length - END_RECORD_BYTES - MAX_COMMENT_BYTES);
  let end = -1;
  for (let at = bytes.length - END_RECORD_BYTES; at >= earliest; at -= 1) {
    if (bytes.readUInt32LE(at) === END_OF_CENTRAL_DIRECTORY) {
      end = at;
      break;
    }
  }
  if (end < 0) return undefined;
  const count = bytes.readUInt16LE(end + 10);
  const size = bytes.readUInt32LE(end + 12);
  const offset = bytes.readUInt32LE(end + 16);
  if (offset + size > end) return undefined;
  const names: string[] = [];
  let at = offset;
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== CENTRAL_HEADER) return undefined;
    const nameLength = bytes.readUInt16LE(at + 28);
    const extraLength = bytes.readUInt16LE(at + 30);
    const commentLength = bytes.readUInt16LE(at + 32);
    const nameEnd = at + 46 + nameLength;
    if (nameEnd > end) return undefined;
    names.push(bytes.toString('utf8', at + 46, nameEnd));
    at = nameEnd + extraLength + commentLength;
  }
  return names;
}

/** Whether the bytes are an XLSX workbook: a zip container with a workbook part (9.2). */
export function isXlsx(bytes: Buffer): boolean {
  return zipEntryNames(bytes)?.includes(WORKBOOK_PART) === true;
}

/**
 * Checks an import file's type (9.2): only XLSX is accepted for an import in stage 1; anything else, the evidence
 * formats included, is not allowed, whatever its name or declared type says. Nothing is stored on a refusal.
 */
export function checkImportFile(bytes: Buffer): ImportFileOutcome {
  return isXlsx(bytes)
    ? { kind: 'accepted', format: 'xlsx' }
    : { kind: 'refused', code: 'files-imports.type-not-allowed' };
}

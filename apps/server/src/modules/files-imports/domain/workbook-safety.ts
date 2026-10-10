import { crc32, inflateRawSync } from 'node:zlib';

// The safety of a workbook at intake (imports-and-opening-data 9.3, class A-9; PRD-SEC-011; DEC-112 GC6-3, GC6-5;
// DEC-116 GC6-17; S1-F06-T02), on its bytes in memory, before anything is stored or read by ExcelJS. The zip container
// is read from its central directory (PKWARE APPNOTE 4.3): the expanded size it declares is checked against its cap
// before anything is inflated, then each entry is inflated, never past what it declares, and checked against its size
// and checksum, so a damaged container or a decompression bomb is refused rather than trusted. Then its parts are
// checked: macros, active controls and embedded objects; a dependency on another workbook's data, refused with a
// request for a self-contained copy; and unapproved links, that is every external relationship but an ordinary
// hyperlink, and data connections. An ordinary external hyperlink is kept as inert text (GC6-17). Nothing is followed
// or fetched. A refusal names its reason, never a part's content (PRD-SEC-014).
//
// Pure, and imports only node built-ins: the reader's worker runs it as it is (readers/workbook-worker.ts).

export type WorkbookSafetyCode =
  | 'files-imports.workbook-active-content'
  | 'files-imports.workbook-depends-on-another'
  | 'files-imports.workbook-unapproved-link'
  | 'files-imports.over-intake-cap'
  | 'files-imports.file-unreadable';

export type WorkbookSafety =
  | { readonly kind: 'safe' }
  | {
      readonly kind: 'refused';
      readonly code: WorkbookSafetyCode;
      readonly missing: readonly { readonly kind: string; readonly [field: string]: string }[];
    };

const LOCAL_HEADER = 0x04034b50;
const CENTRAL_HEADER = 0x02014b50;
const END_RECORD = 0x06054b50;
const END_RECORD_BYTES = 22;
const MAX_COMMENT_BYTES = 0xffff;
const ENCRYPTED_FLAG = 0x0001;
const STORED = 0;
const DEFLATED = 8;

interface Entry {
  readonly name: string;
  readonly flags: number;
  readonly method: number;
  readonly checksum: number;
  readonly compressedBytes: number;
  readonly expandedBytes: number;
  readonly localOffset: number;
}

function unreadable(error: string): WorkbookSafety {
  return { kind: 'refused', code: 'files-imports.file-unreadable', missing: [{ kind: 'reader-error', error }] };
}

/** The central directory's entries, or the reason it cannot be read. */
function entriesOf(bytes: Buffer): Entry[] | string {
  if (bytes.length < END_RECORD_BYTES + 4 || bytes.readUInt32LE(0) !== LOCAL_HEADER) return 'not-a-zip';
  const earliest = Math.max(0, bytes.length - END_RECORD_BYTES - MAX_COMMENT_BYTES);
  let end = -1;
  for (let at = bytes.length - END_RECORD_BYTES; at >= earliest; at -= 1) {
    if (bytes.readUInt32LE(at) === END_RECORD) {
      end = at;
      break;
    }
  }
  if (end < 0) return 'not-a-zip';
  const count = bytes.readUInt16LE(end + 10);
  const size = bytes.readUInt32LE(end + 12);
  const offset = bytes.readUInt32LE(end + 16);
  // A zip64 container marks its counts and offsets with all ones; a workbook within the caps never needs one.
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) return 'zip64-not-read';
  if (offset + size > end) return 'directory-broken';
  const entries: Entry[] = [];
  let at = offset;
  for (let index = 0; index < count; index += 1) {
    if (at + 46 > end || bytes.readUInt32LE(at) !== CENTRAL_HEADER) return 'directory-broken';
    const nameLength = bytes.readUInt16LE(at + 28);
    const nameEnd = at + 46 + nameLength;
    if (nameEnd > end) return 'directory-broken';
    entries.push({
      name: bytes.toString('utf8', at + 46, nameEnd),
      flags: bytes.readUInt16LE(at + 8),
      method: bytes.readUInt16LE(at + 10),
      checksum: bytes.readUInt32LE(at + 16),
      compressedBytes: bytes.readUInt32LE(at + 20),
      expandedBytes: bytes.readUInt32LE(at + 24),
      localOffset: bytes.readUInt32LE(at + 42),
    });
    at = nameEnd + bytes.readUInt16LE(at + 30) + bytes.readUInt16LE(at + 32);
  }
  return entries;
}

/** An entry's content, inflated never past what it declares, or the reason it cannot be trusted. */
function contentOf(bytes: Buffer, entry: Entry): Buffer | string {
  const local = entry.localOffset;
  if (local + 30 > bytes.length || bytes.readUInt32LE(local) !== LOCAL_HEADER) return 'entry-header-broken';
  const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28);
  if (start + entry.compressedBytes > bytes.length) return 'entry-header-broken';
  const data = bytes.subarray(start, start + entry.compressedBytes);
  let content: Buffer;
  if (entry.method === STORED) {
    content = data;
  } else {
    try {
      content = inflateRawSync(data, { maxOutputLength: Math.max(1, entry.expandedBytes) });
    } catch (error) {
      if (error instanceof RangeError || (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
        return 'entry-size-mismatch';
      }
      return 'entry-not-inflated';
    }
  }
  if (content.length !== entry.expandedBytes) return 'entry-size-mismatch';
  if (crc32(content) !== entry.checksum) return 'entry-checksum-mismatch';
  return content;
}

/** The relationships of a `.rels` part: each one's type and whether its target is outside the file. */
function relationshipsOf(xml: string): { readonly type: string; readonly external: boolean }[] {
  const found: { type: string; external: boolean }[] = [];
  for (const tag of xml.matchAll(/<(?:\w+:)?Relationship\b([^>]*)>/g)) {
    const attributes = new Map<string, string>();
    for (const attribute of (tag[1] ?? '').matchAll(/([\w:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attributes.set(attribute[1] ?? '', attribute[2] ?? attribute[3] ?? '');
    }
    const type = attributes.get('Type') ?? '';
    found.push({ type, external: attributes.get('TargetMode') === 'External' });
  }
  return found;
}

/** The last word of a relationship type, such as `hyperlink` or `externalLink`. */
const typeName = (type: string) => type.slice(type.lastIndexOf('/') + 1);

const lower = (name: string) => name.toLowerCase();

function activeContent(found: string): WorkbookSafety {
  return {
    kind: 'refused',
    code: 'files-imports.workbook-active-content',
    missing: [{ kind: 'active-content', found }],
  };
}

function unapprovedLink(found: string): WorkbookSafety {
  return {
    kind: 'refused',
    code: 'files-imports.workbook-unapproved-link',
    missing: [{ kind: 'unapproved-link', found }],
  };
}

/** Whether a part's content is kept for the checks: the content types, the relationships and custom XML parts. */
const keptForChecks = (name: string) =>
  name === '[content_types].xml' || name.endsWith('.rels') || name.startsWith('customxml/');

/**
 * The checks of the parts, in this order: macros, active controls, embedded objects, dependency, links (9.3). Every
 * part is named; only those kept for the checks hold their content, so the others are never held at once.
 */
function checkParts(allNames: readonly string[], parts: ReadonlyMap<string, Buffer>): WorkbookSafety {
  const names = allNames.map(lower);
  const contentTypes = parts.get('[Content_Types].xml')?.toString('utf8') ?? '';
  const relationships = [...parts]
    .filter(([name]) => lower(name).endsWith('.rels'))
    .flatMap(([, content]) => relationshipsOf(content.toString('utf8')));
  const relationshipNamed = (word: string) => relationships.some((each) => lower(typeName(each.type)) === word);

  if (
    names.some(
      (name) =>
        name.endsWith('vbaproject.bin') || name.startsWith('xl/macrosheets/') || name.startsWith('xl/dialogsheets/'),
    ) ||
    /macroEnabled|vbaProject|macrosheet/i.test(contentTypes) ||
    relationshipNamed('vbaproject')
  ) {
    return activeContent('macros');
  }
  if (names.some((name) => name.startsWith('xl/activex/'))) return activeContent('active-controls');
  if (names.some((name) => name.startsWith('xl/embeddings/'))) return activeContent('embedded-objects');
  if (names.some((name) => name.startsWith('xl/externallinks/')) || relationshipNamed('externallink')) {
    return {
      kind: 'refused',
      code: 'files-imports.workbook-depends-on-another',
      missing: [{ kind: 'self-contained-copy' }],
    };
  }
  const external = relationships.find((each) => each.external && lower(typeName(each.type)) !== 'hyperlink');
  if (external !== undefined) return unapprovedLink(typeName(external.type));
  const dataMashup = [...parts].some(
    ([name, content]) => lower(name).startsWith('customxml/') && content.includes('DataMashup'),
  );
  if (names.includes('xl/connections.xml') || names.some((name) => name.startsWith('xl/querytables/')) || dataMashup) {
    return unapprovedLink('data-connection');
  }
  return { kind: 'safe' };
}

/**
 * Inspects a workbook (9.3): the container against the expanded-size cap and for damage, then its parts. The first
 * failure is the reason. A `safe` answer says nothing of the cells: the reader reads them under the other caps.
 */
export function inspectWorkbook(bytes: Buffer, caps: { readonly maxExpandedBytes: number }): WorkbookSafety {
  const entries = entriesOf(bytes);
  if (typeof entries === 'string') return unreadable(entries);
  let declared = 0;
  for (const entry of entries) {
    if ((entry.flags & ENCRYPTED_FLAG) !== 0) return unreadable('entry-encrypted');
    if (entry.method !== STORED && entry.method !== DEFLATED) return unreadable('entry-method-unknown');
    declared += entry.expandedBytes;
  }
  if (declared > caps.maxExpandedBytes) {
    return {
      kind: 'refused',
      code: 'files-imports.over-intake-cap',
      missing: [{ kind: 'intake-cap', cap: 'expanded-size', limit: String(caps.maxExpandedBytes) }],
    };
  }
  const parts = new Map<string, Buffer>();
  for (const entry of entries) {
    const content = contentOf(bytes, entry);
    if (typeof content === 'string') return unreadable(content);
    if (keptForChecks(lower(entry.name))) parts.set(entry.name, content);
  }
  return checkParts(
    entries.map((entry) => entry.name),
    parts,
  );
}

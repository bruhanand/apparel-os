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

export type WorkbookRefusal = Extract<WorkbookSafety, { readonly kind: 'refused' }>;

/** A workbook that cannot be read, naming the reader's error as a word, never its message (PRD-SEC-014). */
export function unreadable(error: string): WorkbookRefusal {
  return { kind: 'refused', code: 'files-imports.file-unreadable', missing: [{ kind: 'reader-error', error }] };
}

/** A workbook ExcelJS could not open, or a reader that ended without an answer. */
export const notRead = (): WorkbookRefusal => unreadable('workbook-not-read');

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

/** One element of an XML part: its local name (any prefix dropped) and its attributes, references resolved. */
export interface XmlElement {
  readonly name: string;
  readonly attributes: ReadonlyMap<string, string>;
}

/**
 * A part's text: UTF-16 where a byte order mark or the first character says so (a Power Query part is written so),
 * otherwise UTF-8 (XML 1.0 appendix F).
 */
function textOf(bytes: Buffer): string {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return bytes.toString('utf16le', 2);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return Buffer.from(bytes.subarray(2)).swap16().toString('utf16le');
  if (bytes[0] === 0x3c && bytes[1] === 0x00) return bytes.toString('utf16le');
  if (bytes[0] === 0x00 && bytes[1] === 0x3c) return Buffer.from(bytes).swap16().toString('utf16le');
  const text = bytes.toString('utf8');
  return text.startsWith('﻿') ? text.slice(1) : text;
}

const PREDEFINED: Readonly<Record<string, string>> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const XML_NAME = /^[A-Za-z_][\w.:-]*$/;

/** A reference's text: a predefined entity or a character reference, or undefined for any other. */
function referenced(body: string): string | undefined {
  const named = PREDEFINED[body];
  if (named !== undefined) return named;
  const code = /^#x[0-9a-fA-F]{1,6}$/.test(body)
    ? Number.parseInt(body.slice(2), 16)
    : /^#[0-9]{1,7}$/.test(body)
      ? Number.parseInt(body.slice(1), 10)
      : Number.NaN;
  return code >= 1 && code <= 0x10ffff ? String.fromCodePoint(code) : undefined;
}

/** An attribute value with its references resolved, or undefined where it holds `<` or a reference XML does not define. */
function resolved(raw: string): string | undefined {
  if (raw.includes('<')) return undefined;
  let value = '';
  let at = 0;
  for (const reference of raw.matchAll(/&([^;&]*)(;?)/g)) {
    const text = reference[2] === ';' ? referenced(reference[1] ?? '') : undefined;
    if (text === undefined) return undefined;
    value += raw.slice(at, reference.index) + text;
    at = reference.index + reference[0].length;
  }
  return value + raw.slice(at);
}

/**
 * The elements of an XML part, in document order, or undefined when it is not well formed (S1-F06 review). A minimal
 * tokenizer, not a validating parser: it skips the declaration, processing instructions, comments and CDATA sections,
 * so no tag inside them counts; it reads each quoted attribute value whole, so a `>` inside one ends nothing, and
 * resolves its character and predefined references; it refuses a document type declaration, so no entity of the
 * file's own is ever expanded; and every end tag must close the element open, so a cut or forged part is refused
 * rather than read in part.
 */
export function elementsOf(xml: string): XmlElement[] | undefined {
  const elements: XmlElement[] = [];
  const open: string[] = [];
  const past = (closing: string, from: number) => {
    const end = xml.indexOf(closing, from);
    return end < 0 ? -1 : end + closing.length;
  };
  let at = 0;
  while (at < xml.length) {
    const tag = xml.indexOf('<', at);
    if (tag < 0) break;
    if (xml.startsWith('<?', tag)) at = past('?>', tag + 2);
    else if (xml.startsWith('<!--', tag)) at = past('-->', tag + 4);
    else if (xml.startsWith('<![CDATA[', tag)) at = past(']]>', tag + 9);
    // A document type declaration, or anything else opened by `<!`, could declare entities: refused.
    else if (xml.startsWith('<!', tag)) return undefined;
    else if (xml.startsWith('</', tag)) {
      const end = xml.indexOf('>', tag);
      if (end < 0 || open.pop() !== xml.slice(tag + 2, end).trim()) return undefined;
      at = end + 1;
    } else {
      const element = startTag(xml, tag);
      if (element === undefined) return undefined;
      elements.push({ name: element.name.slice(element.name.lastIndexOf(':') + 1), attributes: element.attributes });
      if (!element.empty) open.push(element.name);
      at = element.end;
    }
    if (at < 0) return undefined;
  }
  return open.length === 0 ? elements : undefined;
}

/** The start tag at `tag`: its qualified name, attributes, whether it is empty and where it ends; or not well formed. */
function startTag(
  xml: string,
  tag: number,
):
  | { readonly name: string; readonly attributes: Map<string, string>; readonly empty: boolean; readonly end: number }
  | undefined {
  const name = /^[^\s/>]+/.exec(xml.slice(tag + 1, tag + 257))?.[0] ?? '';
  if (!XML_NAME.test(name)) return undefined;
  const attributes = new Map<string, string>();
  let cursor = tag + 1 + name.length;
  for (;;) {
    const space = /^\s*/.exec(xml.slice(cursor, cursor + 4096))?.[0].length ?? 0;
    cursor += space;
    if (xml.startsWith('/>', cursor)) return { name, attributes, empty: true, end: cursor + 2 };
    if (xml.startsWith('>', cursor)) return { name, attributes, empty: false, end: cursor + 1 };
    const attribute = /^([^\s=/>]+)\s*=\s*(["'])/.exec(xml.slice(cursor, cursor + 512));
    if (space === 0 || attribute === null) return undefined;
    const [whole, attributeName = '', quote = '"'] = attribute;
    const valueStart = cursor + whole.length;
    const valueEnd = xml.indexOf(quote, valueStart);
    if (valueEnd < 0 || !XML_NAME.test(attributeName) || attributes.has(attributeName)) return undefined;
    const value = resolved(xml.slice(valueStart, valueEnd));
    if (value === undefined) return undefined;
    attributes.set(attributeName, value);
    cursor = valueEnd + 1;
  }
}

/**
 * The relationships of a `.rels` part: each one's type and whether its target is outside the file. Any target mode
 * but `Internal`, the one other value the packaging conventions allow, counts as outside.
 */
function relationshipsOf(elements: readonly XmlElement[]): { readonly type: string; readonly external: boolean }[] {
  return elements
    .filter((element) => element.name === 'Relationship')
    .map((element) => {
      const mode = element.attributes.get('TargetMode');
      return { type: element.attributes.get('Type') ?? '', external: mode !== undefined && mode !== 'Internal' };
    });
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
const CONTENT_TYPES = '[content_types].xml';

const keptForChecks = (name: string) =>
  name === CONTENT_TYPES || name.endsWith('.rels') || name.startsWith('customxml/');

/**
 * The checks of the parts, in this order: macros, active controls, embedded objects, dependency, links (9.3). Every
 * part is named; only those kept for the checks hold their content, so the others are never held at once.
 */
function checkParts(allNames: readonly string[], parts: ReadonlyMap<string, Buffer>): WorkbookSafety {
  const names = allNames.map(lower);
  // Every part kept is read by the tokenizer, its name matched whatever its case, as `keptForChecks` keeps it: a part
  // that is not well formed is refused rather than read in part (S1-F06 review).
  const read: { readonly name: string; readonly elements: readonly XmlElement[] }[] = [];
  for (const [name, content] of parts) {
    const elements = elementsOf(textOf(content));
    if (elements === undefined) return unreadable('part-not-well-formed');
    read.push({ name: lower(name), elements });
  }
  const partsWhere = (test: (name: string) => boolean) => read.filter((part) => test(part.name));
  // The content types part's values, each attribute resolved, so an encoded word is read as itself.
  const contentTypes = partsWhere((name) => name === CONTENT_TYPES)
    .flatMap((part) => part.elements.flatMap((element) => [...element.attributes.values()]))
    .join('\n');
  const relationships = partsWhere((name) => name.endsWith('.rels')).flatMap((part) => relationshipsOf(part.elements));
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
  // A Power Query part: a custom XML part whose element is `DataMashup`, by the tokenizer's elements, so a word in a
  // value or a comment is never mistaken for one (S1-F06 review).
  const dataMashup = partsWhere((name) => name.startsWith('customxml/')).some((part) =>
    part.elements.some((element) => element.name === 'DataMashup'),
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
  // Two entries of one name, whatever its case (part names are compared so, ECMA-376 part 2, 6.2.2.3): a reader keeps
  // one of them, so the parts checked could differ from those read. Refused rather than guessed (S1-F06 review).
  const names = new Set<string>();
  for (const entry of entries) {
    if (names.has(lower(entry.name))) return unreadable('entry-name-twice');
    names.add(lower(entry.name));
  }
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

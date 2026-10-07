import { inflateSync } from 'node:zlib';
import { EVIDENCE_MAX_BYTES, type StoredFileFormat } from '@apparel-os/schemas';

// The checks an evidence file passes before anything is stored (imports-and-opening-data 9.2 and 9.3; DEC-117;
// PRD-SEC-011): the format is found from the content, never the name (class A-1); only PDF, JPEG and PNG are
// accepted here; a file over the size limit is refused with the limit named and never truncated; a PDF with active
// content (scripts, embedded files, launch actions) is refused. Pure: bytes in, an outcome out. The workbook caps
// and the cross-workbook rule of 9.3 are S1-F06-T02's.

/** Why a file was refused, in the shape the API answers: a code, and what names the reason (12.3). */
export type IntakeOutcome =
  | { readonly kind: 'accepted'; readonly format: StoredFileFormat }
  | {
      readonly kind: 'refused';
      readonly code:
        | 'files-imports.type-not-allowed'
        | 'files-imports.file-too-large'
        | 'files-imports.active-content'
        | 'files-imports.pdf-not-inspectable';
      readonly missing?: readonly { readonly kind: string; readonly [field: string]: string }[];
    };

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** The format of an evidence file from its first bytes, or undefined when it is none of the three. */
export function formatOf(bytes: Buffer): StoredFileFormat | undefined {
  if (bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'jpeg';
  if (bytes.length >= PNG_SIGNATURE.length && bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    return 'png';
  }
  return undefined;
}

/**
 * The names of a PDF that start something when the file is opened or that carry another file: JavaScript, launch
 * and form-submission actions, embedded files and rich media (DEC-117). A name counts only as a whole word.
 */
const ACTIVE_NAMES =
  /\/(JavaScript|JS|Launch|EmbeddedFiles?|RichMedia|SubmitForm|ImportData|GoToR|GoToE)(?![A-Za-z0-9_.#-])/;

/** How much a PDF's compressed streams may expand to while being checked: past it the file cannot be trusted. */
const INFLATE_BUDGET_BYTES = 64 * 1024 * 1024;
const INFLATE_STREAM_MAX_BYTES = 32 * 1024 * 1024;

/** A PDF name may write any character as `#` and two hexadecimal digits (PDF 32000-1, 7.3.5); undo that. */
function withNameEscapesUndone(text: string): string {
  return text.replace(/#([0-9A-Fa-f]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
}

function activeNameIn(text: string): string | undefined {
  return ACTIVE_NAMES.exec(withNameEscapesUndone(text))?.[1];
}

/** The streams of a PDF, the bytes between `stream` and `endstream`, to try as compressed object streams. */
function* streamsOf(text: string): Generator<{ start: number; end: number }> {
  const opening = /stream\r?\n/g;
  for (let found = opening.exec(text); found !== null; found = opening.exec(text)) {
    const start = found.index + found[0].length;
    const end = text.indexOf('endstream', start);
    if (end < 0) return;
    yield { start, end };
    opening.lastIndex = end + 9;
  }
}

type PdfOutcome = IntakeOutcome | undefined;

function checkPdf(bytes: Buffer): PdfOutcome {
  const text = bytes.toString('latin1');
  if (/\/Encrypt(?![A-Za-z0-9_.#-])/.test(withNameEscapesUndone(text))) {
    return { kind: 'refused', code: 'files-imports.pdf-not-inspectable' };
  }
  const direct = activeNameIn(text);
  if (direct !== undefined) return activeContent(direct);
  let budget = INFLATE_BUDGET_BYTES;
  for (const { start, end } of streamsOf(text)) {
    let inflated: Buffer;
    try {
      inflated = inflateSync(bytes.subarray(start, end), {
        maxOutputLength: Math.min(budget, INFLATE_STREAM_MAX_BYTES),
      });
    } catch (error) {
      // A stream that is no zlib data (an image, a font) is not a place a name can hide. One that expands past the
      // budget is a decompression bomb or hides more than can be checked: refused, not trusted.
      if (error instanceof RangeError || (error as { code?: string }).code === 'ERR_BUFFER_TOO_LARGE') {
        return { kind: 'refused', code: 'files-imports.pdf-not-inspectable' };
      }
      continue;
    }
    budget -= inflated.length;
    const hidden = activeNameIn(inflated.toString('latin1'));
    if (hidden !== undefined) return activeContent(hidden);
  }
  return undefined;
}

function activeContent(found: string): IntakeOutcome {
  return { kind: 'refused', code: 'files-imports.active-content', missing: [{ kind: 'active-content', found }] };
}

/**
 * Checks an evidence file (DEC-117): the type first, from the content, then the size, then, for a PDF, active
 * content. The first failure is the reason; nothing is stored on a refusal.
 */
export function checkEvidenceFile(bytes: Buffer): IntakeOutcome {
  const format = formatOf(bytes);
  if (format === undefined) return { kind: 'refused', code: 'files-imports.type-not-allowed' };
  if (bytes.length > EVIDENCE_MAX_BYTES) {
    return {
      kind: 'refused',
      code: 'files-imports.file-too-large',
      missing: [{ kind: 'size-limit', maxBytes: String(EVIDENCE_MAX_BYTES) }],
    };
  }
  if (format === 'pdf') {
    const refused = checkPdf(bytes);
    if (refused !== undefined) return refused;
  }
  return { kind: 'accepted', format };
}

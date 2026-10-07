import { deflateSync } from 'node:zlib';
import { EVIDENCE_MAX_BYTES } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { checkEvidenceFile, formatOf } from './intake-checks.js';

// DEC-117, imports-and-opening-data 9.2 and 9.3. Every file here is made by the test (SYNTHETIC), never read from disk.

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function pdf(body = ''): Buffer {
  return Buffer.from(
    `%PDF-1.4\n% SYNTHETIC\n1 0 obj\n<< /Type /Catalog ${body} >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF\n`,
    'latin1',
  );
}

describe('formatOf', () => {
  it('PRD-IMP-002 finds a PDF, a JPEG and a PNG from their content', () => {
    expect(formatOf(pdf())).toBe('pdf');
    expect(formatOf(Buffer.concat([JPEG_HEADER, Buffer.alloc(8)]))).toBe('jpeg');
    expect(formatOf(Buffer.concat([PNG_HEADER, Buffer.alloc(8)]))).toBe('png');
  });

  it('PRD-IMP-002 finds no format in text, a workbook container or an empty file, whatever they might be named', () => {
    expect(formatOf(Buffer.from('hello'))).toBeUndefined();
    expect(formatOf(Buffer.from([0x50, 0x4b, 0x03, 0x04, 0, 0]))).toBeUndefined();
    expect(formatOf(Buffer.alloc(0))).toBeUndefined();
  });
});

describe('checkEvidenceFile', () => {
  it('DEC-117 accepts a plain PDF, JPEG and PNG', () => {
    expect(checkEvidenceFile(pdf())).toEqual({ kind: 'accepted', format: 'pdf' });
    expect(checkEvidenceFile(Buffer.concat([JPEG_HEADER, Buffer.alloc(8)]))).toEqual({
      kind: 'accepted',
      format: 'jpeg',
    });
    expect(checkEvidenceFile(Buffer.concat([PNG_HEADER, Buffer.alloc(8)]))).toEqual({
      kind: 'accepted',
      format: 'png',
    });
  });

  it('DEC-117 refuses a type that is not allowed, before looking at its size', () => {
    expect(checkEvidenceFile(Buffer.from('a,b\n1,2\n'))).toEqual({
      kind: 'refused',
      code: 'files-imports.type-not-allowed',
    });
  });

  it('DEC-117 accepts a file of exactly the limit and refuses one byte more, naming the limit', () => {
    const header = pdf();
    const atLimit = Buffer.concat([header, Buffer.alloc(EVIDENCE_MAX_BYTES - header.length, 0x20)]);
    expect(atLimit.length).toBe(EVIDENCE_MAX_BYTES);
    expect(checkEvidenceFile(atLimit)).toEqual({ kind: 'accepted', format: 'pdf' });
    expect(checkEvidenceFile(Buffer.concat([atLimit, Buffer.from(' ')]))).toEqual({
      kind: 'refused',
      code: 'files-imports.file-too-large',
      missing: [{ kind: 'size-limit', maxBytes: String(EVIDENCE_MAX_BYTES) }],
    });
  });

  it.each(['/JavaScript', '/JS', '/Launch', '/EmbeddedFile', '/RichMedia'])(
    'DEC-117 refuses a PDF with %s in it, naming it',
    (name) => {
      const outcome = checkEvidenceFile(pdf(`/Action << ${name} (x) >>`));
      expect(outcome.kind).toBe('refused');
      expect(outcome).toMatchObject({
        code: 'files-imports.active-content',
        missing: [{ kind: 'active-content', found: name.slice(1) }],
      });
    },
  );

  it('DEC-117 sees active content whose name is written with hexadecimal escapes', () => {
    expect(checkEvidenceFile(pdf('/#4aava#53cript (x)'))).toMatchObject({ code: 'files-imports.active-content' });
  });

  it('DEC-117 sees active content inside a compressed stream', () => {
    const packed = deflateSync(Buffer.from('<< /S /Launch /F (x) >>', 'latin1'));
    const file = Buffer.concat([
      Buffer.from('%PDF-1.5\n1 0 obj\n<< /Type /ObjStm /Filter /FlateDecode >>\nstream\n', 'latin1'),
      packed,
      Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
    ]);
    expect(checkEvidenceFile(file)).toMatchObject({ code: 'files-imports.active-content' });
  });

  it('DEC-117 refuses an encrypted PDF, which cannot be checked', () => {
    expect(checkEvidenceFile(pdf('/Encrypt 5 0 R'))).toEqual({
      kind: 'refused',
      code: 'files-imports.pdf-not-inspectable',
    });
  });

  it('DEC-117 does not mistake a longer name for active content', () => {
    expect(checkEvidenceFile(pdf('/JSONish true /Launcher 1'))).toEqual({ kind: 'accepted', format: 'pdf' });
  });
});

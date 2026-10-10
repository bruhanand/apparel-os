import { IMPORT_UPLOAD_CEILING_BYTES } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { intakeCapsFromEnvironment } from './intake-caps.js';

// S1-F06-T02: the caps at intake are technical environment settings read at start through one schema; a missing or
// malformed one stops the service at start, naming the variable and never a value, and nothing falls back to a value
// in code (imports-and-opening-data 9.3; DEC-112 GC6-5; code-house-rules 12.14). The values here are SYNTHETIC.

const SYNTHETIC_CAPS = {
  AOS_INTAKE_MAX_UPLOAD_BYTES: '1000',
  AOS_INTAKE_MAX_EXPANDED_BYTES: '2000',
  AOS_INTAKE_MAX_ROWS: '30',
  AOS_INTAKE_MAX_PARSER_MEMORY_MB: '40',
  AOS_INTAKE_MAX_PROCESSING_MS: '5000',
};

describe('intakeCapsFromEnvironment', () => {
  it('GC6-5 reads the five caps', () => {
    expect(intakeCapsFromEnvironment(SYNTHETIC_CAPS)).toEqual({
      maxUploadBytes: 1000,
      maxExpandedBytes: 2000,
      maxRows: 30,
      maxParserMemoryMb: 40,
      maxProcessingMs: 5000,
    });
  });

  it('code-house-rules 12.14: a missing cap stops the service at start, naming the variable', () => {
    for (const name of Object.keys(SYNTHETIC_CAPS)) {
      const env = Object.fromEntries(Object.entries(SYNTHETIC_CAPS).filter(([key]) => key !== name));
      expect(() => intakeCapsFromEnvironment(env)).toThrow(name);
    }
  });

  it('refuses a cap that is not a positive whole number, without echoing the value', () => {
    for (const value of ['0', '-1', '1.5', 'many', '']) {
      let message = '';
      try {
        intakeCapsFromEnvironment({ ...SYNTHETIC_CAPS, AOS_INTAKE_MAX_ROWS: value });
      } catch (error) {
        message = (error as Error).message;
      }
      expect(message).toContain('AOS_INTAKE_MAX_ROWS');
      if (value !== '') expect(message).not.toContain(`"${value}"`);
    }
  });

  it('refuses an uploaded-size cap the import route cannot carry to its named check', () => {
    expect(() =>
      intakeCapsFromEnvironment({ ...SYNTHETIC_CAPS, AOS_INTAKE_MAX_UPLOAD_BYTES: String(IMPORT_UPLOAD_CEILING_BYTES + 1) }),
    ).toThrow('AOS_INTAKE_MAX_UPLOAD_BYTES');
    expect(
      intakeCapsFromEnvironment({ ...SYNTHETIC_CAPS, AOS_INTAKE_MAX_UPLOAD_BYTES: String(IMPORT_UPLOAD_CEILING_BYTES) })
        .maxUploadBytes,
    ).toBe(IMPORT_UPLOAD_CEILING_BYTES);
  });
});

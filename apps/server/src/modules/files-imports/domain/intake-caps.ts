import { IMPORT_UPLOAD_CEILING_BYTES } from '@apparel-os/schemas';
import { z } from 'zod';

// The caps at intake (imports-and-opening-data 9.3; DEC-112 GC6-5; RR-036; S1-F06-T02): uploaded size, expanded size,
// rows, parser memory and processing time. They are technical settings the builders choose, never KDPS values, read
// at start from the environment through this one schema; a missing or malformed one stops the service at start,
// naming the variable and never its value, and nothing falls back to a value in code (code-house-rules 12.14). The
// values chosen for local work, tests and `dev` are documented beside imports-and-opening-data 9.3.

/** The caps, as intake and the reader apply them. */
export interface IntakeCaps {
  /** The most bytes an import file may hold as uploaded. */
  readonly maxUploadBytes: number;
  /** The most bytes the workbook's container may expand to, all its parts together. */
  readonly maxExpandedBytes: number;
  /** The most rows, of every sheet together, the reader reads. */
  readonly maxRows: number;
  /** The most the reader's own heap may grow to, in MiB (its worker's old generation). */
  readonly maxParserMemoryMb: number;
  /** The longest the reader may take, in milliseconds. */
  readonly maxProcessingMs: number;
}

/** The variable of each cap. */
export const INTAKE_CAP_VARIABLES = {
  maxUploadBytes: 'AOS_INTAKE_MAX_UPLOAD_BYTES',
  maxExpandedBytes: 'AOS_INTAKE_MAX_EXPANDED_BYTES',
  maxRows: 'AOS_INTAKE_MAX_ROWS',
  maxParserMemoryMb: 'AOS_INTAKE_MAX_PARSER_MEMORY_MB',
  maxProcessingMs: 'AOS_INTAKE_MAX_PROCESSING_MS',
} as const satisfies Record<keyof IntakeCaps, string>;

const whole = z
  .string()
  .regex(/^[1-9][0-9]*$/)
  .transform(Number)
  .pipe(z.number().int().positive().max(Number.MAX_SAFE_INTEGER));

const capsSchema = z.strictObject({
  [INTAKE_CAP_VARIABLES.maxUploadBytes]: whole.pipe(z.number().max(IMPORT_UPLOAD_CEILING_BYTES)),
  [INTAKE_CAP_VARIABLES.maxExpandedBytes]: whole,
  [INTAKE_CAP_VARIABLES.maxRows]: whole,
  [INTAKE_CAP_VARIABLES.maxParserMemoryMb]: whole,
  [INTAKE_CAP_VARIABLES.maxProcessingMs]: whole,
});

/** Reads the caps from the environment's variables; throws at start, naming each missing or malformed variable. */
export function intakeCapsFromEnvironment(env: Readonly<Record<string, string | undefined>>): IntakeCaps {
  const given = Object.fromEntries(
    Object.values(INTAKE_CAP_VARIABLES).flatMap((name) => (env[name] === undefined ? [] : [[name, env[name]]])),
  );
  const parsed = capsSchema.safeParse(given);
  if (!parsed.success) {
    const named = [...new Set(parsed.error.issues.map((issue) => String(issue.path[0])))].sort();
    throw new Error(
      `The caps at intake must each be a positive whole number, the uploaded size at most ${String(
        IMPORT_UPLOAD_CEILING_BYTES,
      )} bytes (imports-and-opening-data 9.3); set: ${named.join(', ')}`,
    );
  }
  const read = parsed.data;
  return {
    maxUploadBytes: read[INTAKE_CAP_VARIABLES.maxUploadBytes],
    maxExpandedBytes: read[INTAKE_CAP_VARIABLES.maxExpandedBytes],
    maxRows: read[INTAKE_CAP_VARIABLES.maxRows],
    maxParserMemoryMb: read[INTAKE_CAP_VARIABLES.maxParserMemoryMb],
    maxProcessingMs: read[INTAKE_CAP_VARIABLES.maxProcessingMs],
  };
}

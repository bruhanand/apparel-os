// S1-F06-T02: the caps at intake for tests (imports-and-opening-data 9.3; DEC-112 GC6-5; RR-036). These are the
// builders' values for local work, tests and `dev`, documented in imports-and-opening-data 9.3 with the measurements
// they were chosen from; they are technical settings, never KDPS values, and no application code reads them: the
// server reads its caps from the environment and stops at start without them (code-house-rules 12.14). A test that
// proves a cap gives its own SYNTHETIC values instead.

/** The caps of local work, tests and `dev`, as the environment's variables hold them. */
export const INTAKE_CAPS_ENVIRONMENT: Readonly<Record<string, string>> = {
  AOS_INTAKE_MAX_UPLOAD_BYTES: '10485760',
  AOS_INTAKE_MAX_EXPANDED_BYTES: '104857600',
  AOS_INTAKE_MAX_ROWS: '150000',
  AOS_INTAKE_MAX_PARSER_MEMORY_MB: '1024',
  AOS_INTAKE_MAX_PROCESSING_MS: '60000',
};

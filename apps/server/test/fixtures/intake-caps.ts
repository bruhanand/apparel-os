// S1-F06-T02: the caps at intake for tests (imports-and-opening-data 9.3; DEC-112 GC6-5; RR-036). SYNTHETIC: these
// are the builders' values for local work, tests and `dev` only, accepted for those by the product owner on
// 10 Oct 2026 and documented in imports-and-opening-data 9.3 with the measurements they were chosen from. They are
// technical settings for development and test, never KDPS values and never a default: the caps of `kdps-test` stay
// OPEN (RR-036). No application code reads them: the server reads its caps from the environment and stops at start
// without them (code-house-rules 12.14). A test that proves a cap gives its own SYNTHETIC values instead.

/** SYNTHETIC: the caps of local work, tests and `dev`, as the environment's variables hold them. */
export const SYNTHETIC_INTAKE_CAPS_ENVIRONMENT: Readonly<Record<string, string>> = {
  AOS_INTAKE_MAX_UPLOAD_BYTES: '10485760',
  AOS_INTAKE_MAX_EXPANDED_BYTES: '104857600',
  AOS_INTAKE_MAX_ROWS: '150000',
  AOS_INTAKE_MAX_PARSER_MEMORY_MB: '1024',
  AOS_INTAKE_MAX_PROCESSING_MS: '60000',
};

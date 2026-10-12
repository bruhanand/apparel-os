import type { NumberedKind } from '../../numbering/index.js';

// Import batch codes come from a `numbering` series, like every business number (imports-and-opening-data 15.1;
// code-house-rules 3.2; GC9-9, product owner, 6 Oct 2026), so a restore pauses and reconciles them
// (backup-and-restore 5.3). The code's format is the Organisation's: no format has a default (numbering-and-audit 3.5).

/**
 * The kind files-imports declares (numbering-and-audit 3.1): one series for the Organisation as a whole, which does not
 * restart each financial year. **Design choice** (S1-F06-T01): a batch is no tax document and has no business date of
 * its own to fall in a year; its code only has to be unique and never given twice.
 */
export const IMPORT_BATCH_KIND: NumberedKind = {
  kind: 'files-imports.import-batch',
  yearly: false,
  scopeKeyStandsFor: 'the Organisation as a whole: one import-batch series',
  displayScope: { standsFor: 'the Organisation as a whole', perYear: false },
};

/** The one scope key of the kind: the Organisation itself (one database per Organisation). */
export const IMPORT_BATCH_SCOPE_KEY = 'organisation';

/** The missing item that names the batch code series (PRD-UXP-003). */
export const MISSING_BATCH_SERIES = { kind: 'number-series', numberedKind: IMPORT_BATCH_KIND.kind } as const;

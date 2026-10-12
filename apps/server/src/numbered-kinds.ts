import { EXCEPTION_CODE_KIND } from './modules/exceptions/index.js';
import { IMPORT_BATCH_KIND } from './modules/files-imports/index.js';
import { JOURNAL_KIND } from './modules/finance/books/index.js';
import { Numbering, type NumberedKind } from './modules/numbering/index.js';
import { BILL_KIND } from './modules/pos/index.js';

/**
 * The kinds `numbering` serves, declared by the modules that own them (numbering-and-audit 3.1; module-map section 3,
 * rule 6): the exception code (S1-F08-T02), the journal (books-and-posting 5.4; S1-F09-T02), the bill, per billing
 * device and tax registration (offline-counter 4.1; S1-F12-T01), and the import batch code (imports-and-opening-data
 * 15.1; GC9-9; S1-F06-T01). Part of the composition root: the application hands
 * them to `numbering` under NUMBERED_KINDS, and the worker builds its `numbering` from the same list.
 */
export const numberedKinds: readonly NumberedKind[] = [EXCEPTION_CODE_KIND, JOURNAL_KIND, BILL_KIND, IMPORT_BATCH_KIND];

/** `numbering` with every declared kind, for the worker's consumers (module-map section 3, rule 6; S1-F12 review). */
export function composedNumbering(): Numbering {
  return new Numbering({ kinds: numberedKinds });
}

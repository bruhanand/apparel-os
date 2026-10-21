import type { MissingItem } from '@apparel-os/schemas';
import type { NumberedKind } from '../../numbering/index.js';
import type { CallerRegistration } from '../../stock/ledger/index.js';

// What `receiving` declares to the modules below it at start (module-map section 3, rule 6): the GRN number kind it
// numbers (numbering-and-audit 3.1; goods-in 10.4) and its registration as a stock caller (stock-ledger 13.2).

/**
 * The GRN number (goods-in 4.5, 10.4): one series for the Organisation, not restarted each financial year, whose years
 * are not set (GC5-1). No format is set here: the Organisation chooses it (numbering-and-audit 3.5), and no screen
 * sets one yet (RR-449). **Design choice.**
 */
export const GRN_KIND: NumberedKind = {
  kind: 'receiving.grn',
  yearly: false,
  scopeKeyStandsFor: 'the Organisation as a whole: one GRN series',
  displayScope: { standsFor: 'the Organisation as a whole', perYear: false },
};

/** The one scope key of the GRN kind: the Organisation itself (one database per Organisation). */
export const GRN_SCOPE_KEY = 'organisation';

/** What a GRN lacks while no Open GRN series exists (numbering-and-audit 3.2; PRD-UXP-003). */
export const MISSING_GRN_SERIES: MissingItem = { kind: 'number-series', numberedKind: GRN_KIND.kind };

/** The record type a GRN's receipt counts name as their source (stock-ledger 13.2; books-and-posting 5.1). */
export const GRN_SOURCE_TYPE = 'grn';

/**
 * `receiving` as a stock caller (stock-ledger 13.2): a GRN posts receipt counts, with no import kind. Holds, the
 * identity route and acceptance come with the tickets that need them (S2-F02-T03, S2-F07-T01).
 */
export const receivingStockCaller: CallerRegistration = {
  module: 'receiving',
  synthetic: false,
  recordTypes: [{ recordType: GRN_SOURCE_TYPE, itemKinds: ['receipt-count'], importKinds: ['none'] }],
};

import type { MissingItem } from '@apparel-os/schemas';
import type { NumberedKind } from '../../numbering/index.js';

// What `booking` declares to `numbering` at start (module-map section 3, rule 6): the booking number kind
// (numbering-and-audit 3.1; goods-in 3.1, 10.4; S2-F01-T03).

/**
 * The booking number (goods-in 3.1, 10.4), given by a booking's first approval: one series for the Organisation, not
 * restarted each financial year, whose years are not set (GC5-1), as the GRN's is. No format is set here: the
 * Organisation chooses it (numbering-and-audit 3.5), and no screen sets one yet (RR-449). **Design choice.**
 */
export const BOOKING_KIND: NumberedKind = {
  kind: 'booking.booking',
  yearly: false,
  scopeKeyStandsFor: 'the Organisation as a whole: one booking series',
  displayScope: { standsFor: 'the Organisation as a whole', perYear: false },
};

/** The one scope key of the booking kind: the Organisation itself (one database per Organisation). */
export const BOOKING_SCOPE_KEY = 'organisation';

/** What an approval lacks while no Open booking series exists (numbering-and-audit 3.2; PRD-UXP-003). */
export const MISSING_BOOKING_SERIES: MissingItem = { kind: 'number-series', numberedKind: BOOKING_KIND.kind };

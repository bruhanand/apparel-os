import { z } from 'zod';
import { defineEvent } from '../../../kernel/index.js';

// The events of the books part (module-map 4.14, section 8; books-and-posting 6.3, 9.1; S1-F09-T02). Identifiers
// only: readers refetch through the interface. Lock and reopening add theirs (S1-F09-T03).

/** A posting map version took effect or was rejected (books-and-posting 6.3). */
export const postingMapChanged = defineEvent({
  type: 'finance.posting-map-changed',
  version: 1,
  payload: z.strictObject({
    postingMapId: z.uuid(),
    versionId: z.uuid(),
    bookId: z.uuid(),
    decision: z.enum(['Approved', 'Rejected']),
  }),
});

/** A journal was posted, or a reversal of one (books-and-posting 9.1; PRD-LED-004). */
export const journalPosted = defineEvent({
  type: 'finance.journal-posted',
  version: 1,
  payload: z.strictObject({
    journalId: z.uuid(),
    bookId: z.uuid(),
    postingMapVersionId: z.uuid(),
    reversesJournalId: z.uuid().optional(),
  }),
});

/** A period was locked (books-and-posting 4.2, 9.1; PRD-LED-009; S1-F09-T03). */
export const periodLocked = defineEvent({
  type: 'finance.period-locked',
  version: 1,
  payload: z.strictObject({ periodId: z.uuid(), bookId: z.uuid() }),
});

/** A reopening of a Locked period was approved, so the period shows Reopened (4.3, 9.1; PRD-LED-019; S1-F09-T03). */
export const periodReopened = defineEvent({
  type: 'finance.period-reopened',
  version: 1,
  payload: z.strictObject({ periodId: z.uuid(), bookId: z.uuid(), reopeningId: z.uuid() }),
});

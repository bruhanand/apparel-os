import { z } from 'zod';
import { defineEvent } from '../../kernel/index.js';

// The events of `exceptions` (module-map 4.13, section 8): identifiers only, saved in the transaction of the change.
// `notifications` and `reports` consume them when they are built; until then no consumer is registered.

const payload = z.strictObject({ exceptionId: z.uuid(), eventId: z.uuid() });

/** An exception was raised (12.1). */
export const exceptionRaised = defineEvent({ type: 'exceptions.raised', version: 1, payload });

/** An exception was reassigned, taken by a holder of its owning role, or escalated (12.2, 11.3). */
export const exceptionAssigned = defineEvent({ type: 'exceptions.assigned', version: 1, payload });

/** An exception was resolved: its correction recorded, or closed after its resolution check (12.3). */
export const exceptionResolved = defineEvent({ type: 'exceptions.resolved', version: 1, payload });

/** A closed exception was reopened (12.3; PRD-EXC-003). */
export const exceptionReopened = defineEvent({ type: 'exceptions.reopened', version: 1, payload });

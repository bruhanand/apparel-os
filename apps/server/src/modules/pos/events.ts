import { z } from 'zod';
import { defineEvent } from '../../kernel/index.js';

// The events of billing devices (offline-counter 12.2; module-map section 8; S1-F12-T01). Identifiers only: readers
// refetch through the interface (PRD Stack: Live updates).

/** A billing device was registered for a Store, Setting up (offline-counter 3.2 step 1). */
export const deviceRegistered = defineEvent({
  type: 'pos.device-registered',
  version: 1,
  payload: z.strictObject({ deviceId: z.uuid(), storeId: z.uuid() }),
});

/** A billing device was enrolled: its key bound, Active, its series defined where they can be (3.2, 4.1). */
export const deviceEnrolled = defineEvent({
  type: 'pos.device-enrolled',
  version: 1,
  payload: z.strictObject({ deviceId: z.uuid(), storeId: z.uuid(), seriesIds: z.array(z.uuid()) }),
});

import { z } from 'zod';
import { defineEvent } from '../../kernel/index.js';

/**
 * A version of a master of the structure was decided and takes effect from its start (module-map section 8;
 * structure-and-masters 3.8): saved in the decision's transaction, identifiers only. `reports` and `site-lifecycle`
 * consume it when they are built; until then no consumer is registered.
 */
export const structureChanged = defineEvent({
  type: 'organisation.structure-changed',
  version: 1,
  payload: z.strictObject({
    recordType: z.string().min(1),
    recordId: z.uuid(),
    versionId: z.uuid(),
  }),
});

/**
 * A business unit's mapping version was approved and takes effect from its start (module-map section 8;
 * structure-and-masters 3.4, 3.8; S1-F02-T02): saved in the decision's transaction, identifiers only. `pos` consumes it
 * to define a billing device's series for a new registration before the date (offline-counter 4.3; S1-F12-T02);
 * `reports` and `site-lifecycle` will when they are built.
 */
export const mappingChanged = defineEvent({
  type: 'organisation.mapping-changed',
  version: 1,
  payload: z.strictObject({
    businessUnitId: z.uuid(),
    mappingVersionId: z.uuid(),
  }),
});

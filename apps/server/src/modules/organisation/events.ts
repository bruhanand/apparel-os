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

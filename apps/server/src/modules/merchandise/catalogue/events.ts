import { z } from 'zod';
import { defineEvent } from '../../../kernel/index.js';

// The catalogue's events (module-map 4.12, section 8; structure-and-masters 4.7; S1-F03-T02). Identifiers only: a
// consumer, `pos`' working set or `reports`, reads what it needs through the catalogue's interface. No consumer yet.

/** A product proposal was confirmed: the style it made or added to, and the SKUs it made (4.2; PRD-MER-013). */
export const productConfirmed = defineEvent({
  type: 'merchandise.product-confirmed',
  version: 1,
  payload: z.strictObject({ proposalId: z.uuid(), styleId: z.uuid(), skuIds: z.array(z.uuid()) }),
});

/** A code was mapped, or a mapping ended (4.3; PRD-MER-006, PRD-MER-007). */
export const codeMappingChanged = defineEvent({
  type: 'merchandise.code-mapping-changed',
  version: 1,
  payload: z.strictObject({ mappingId: z.uuid(), skuId: z.uuid() }),
});

/**
 * A tracking profile changed (4.5, 4.6; PRD-MER-014, PRD-MER-018): a profile version recorded, a category's link to a
 * profile recorded, or a change to piece-tracked put in force at a Site by its labelling count.
 */
export const trackingProfileChanged = defineEvent({
  type: 'merchandise.tracking-profile-changed',
  version: 1,
  payload: z.strictObject({
    change: z.enum(['profile', 'category-link', 'site']),
    recordId: z.uuid(),
    versionId: z.uuid(),
    siteId: z.uuid().optional(),
  }),
});

import { z } from 'zod';
import { defineEvent } from '../../kernel/index.js';

// The events of files-imports (module-map 4.7, section 8; imports-and-opening-data 13.3). Identifiers only; consumers
// are idempotent on the event (PRD-INT-008). No consumer yet.

/** A layout version, a mapping version or a mapping rule version was confirmed (6.4; S1-F06-T03). */
export const mappingConfirmed = defineEvent({
  type: 'files-imports.mapping-confirmed',
  version: 1,
  payload: z.strictObject({
    kind: z.enum(['layout-version', 'mapping-version', 'mapping-rule-version']),
    recordId: z.uuid(),
    versionId: z.uuid(),
  }),
});

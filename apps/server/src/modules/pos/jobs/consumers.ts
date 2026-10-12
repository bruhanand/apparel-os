import { defineConsumer, type ConsumerDefinition } from '../../../kernel/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import { mappingChanged } from '../../organisation/index.js';
import { defineSeriesForMapping } from '../commands/mapping-change.js';
import { BILLING_DEVICE_TYPE } from '../domain/kinds.js';

/**
 * The code of the internal service identity `pos`'s consumers run as (access-and-approvals 2.3; PRD-SEC-018). The
 * setup step writes it from the worker's registry, with a role assignment granting the action they declare (RR-271);
 * an Organisation set up before this build gets it from `add-service-identities` after the deploy (9.11a).
 */
export const POS_IDENTITY = 'pos';

/**
 * `pos`'s consumer of `organisation.mapping-changed` (offline-counter 4.3; module-map section 8; S1-F12-T02): when a
 * unit's mapping moves to another registration from a date, every Active device listing the unit gets its series for
 * that registration before the date. Keyed by the event's identity, so a redelivery has no second effect, and
 * retry-safe besides (PRD-INT-008; DEC-117). Runs under the `pos` identity, authorised for edit on
 * `pos.billing_device` (RR-273). `numbering`, with the bill among its kinds, comes from the composition root, which
 * builds the worker's registry (module-map section 3, rule 6; S1-F12 review).
 */
export function posConsumers(numbering: NumberingInterface): readonly ConsumerDefinition[] {
  return [
    defineConsumer({
      name: 'pos.define-series-for-mapping',
      event: mappingChanged,
      serviceIdentity: POS_IDENTITY,
      authorises: { action: 'edit', recordType: BILLING_DEVICE_TYPE },
      handle: async (context, event) => {
        const defined = await defineSeriesForMapping(context, numbering, event.payload.mappingVersionId);
        return defined.kind === 'success' ? { kind: 'done' } : { kind: 'refused', refusal: defined.refusal };
      },
    }),
  ];
}

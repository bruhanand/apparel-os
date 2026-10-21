import { ARRIVAL_TYPE, GRN_TYPE } from '@apparel-os/schemas';
import type { GatedOperation } from '../../configuration/index.js';

// Receiving and the policy gate (goods-in 10.5; module-map 4.4; PRD-SEC-017, PRD-LIF-001, PRD-LIF-002, POL-10.08;
// S2-F02-T02). Issuing a GRN, and so recording the Arrival it starts from, needs the unit's receiving activity and
// policies 4 and 10. An operation the gate knows names one governing policy, so receiving declares one operation for
// each, sharing one capability and the activity: Available answers yes only when both do. **Design choice.**

/** The capability that switches receiving on, off for every Organisation until an Admin switches it on (PRD-SEC-017). */
export const RECEIVING_CAPABILITY = 'receiving.goods-in';

/**
 * Receiving goods under policy 4, merchandise tracking (POL-04; goods-in 10.5): the receiving activity of the unit,
 * granted after its readiness, with someone at the unit who records Arrivals, counts and issues GRNs (PRD-ACS-006).
 */
export const RECEIVE_GOODS: GatedOperation = {
  code: 'receiving.receive-goods',
  policy: 4,
  capability: RECEIVING_CAPABILITY,
  activity: 'receiving',
  checks: [],
  needs: {
    permissions: [
      { action: 'create', recordType: ARRIVAL_TYPE },
      { action: 'edit', recordType: ARRIVAL_TYPE },
      { action: 'create', recordType: GRN_TYPE },
    ],
  },
};

/** Receiving goods under policy 10, statutory applicability, whose verified mappings it needs (POL-10.08). */
export const RECEIVE_GOODS_STATUTORY: GatedOperation = {
  code: 'receiving.receive-goods-statutory',
  policy: 10,
  capability: RECEIVING_CAPABILITY,
  activity: 'receiving',
  checks: [],
};

/** Both, in the order Available is asked. */
export const RECEIVING_OPERATIONS: readonly GatedOperation[] = [RECEIVE_GOODS, RECEIVE_GOODS_STATUTORY];

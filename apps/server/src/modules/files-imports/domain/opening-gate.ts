import type { MissingItem } from '@apparel-os/schemas';
import type { GatedOperation } from '../../configuration/index.js';
import type { OpeningSwitch } from '../contracts/import-handlers.js';

// The publish gate of an opening batch (imports-and-opening-data 4.2, 10.1; PRD-SEC-017, PRD-UXP-003, PRD-LIF-011,
// PRD-LIF-026, POL-14.07, DEC-071; S1-F13-T03). Publishing an opening batch is available only where Available answers
// yes for the operation below (policy 14 Signed and its real values validated, its capability switched on), on hosting
// where a Store may switch, at the unit's approved switch with its day-close cutover still open. Otherwise it is
// unavailable and names every thing missing; a unit whose cutover is complete is refused outright, since a later
// correction is a live correction in the owning module, never a new opening batch (10.1, 10.5).

/**
 * Opening-data publishing, a policy-dependent operation (module-map 4.4; DEC-116): governed by policy 14, off until an
 * Admin switches its capability on, with no activity grant of its own; the switch is the unit's own gate.
 */
export const OPENING_PUBLISHING: GatedOperation = {
  code: 'files-imports.publish-opening',
  policy: 14,
  capability: 'files-imports.opening-publishing',
  activity: null,
  checks: [],
};

/**
 * The environment where no Store switches and opening data never publishes, whatever policy 14 says: the test setup
 * (DEC-071, PRD-LIF-026; GC6-8). Production hosting is not chosen yet; local work, tests and `dev` run the path on
 * synthetic data under the synthetic-data banner (4.2).
 */
const TEST_SETUP = 'kdps-test';

export type OpeningGate =
  | { readonly kind: 'available'; readonly switchId: string }
  | { readonly kind: 'unavailable'; readonly missing: readonly MissingItem[] }
  | { readonly kind: 'cutover-complete'; readonly switchId: string };

/** Whether an opening batch of a unit may publish now, from what Available and the unit's switch answer. */
export function openingGate(input: {
  readonly environment: string;
  readonly availability: readonly MissingItem[];
  readonly opening: OpeningSwitch;
  readonly unitId: string | undefined;
}): OpeningGate {
  const { opening } = input;
  if (opening.kind === 'approved' && opening.cutover === 'complete') {
    return { kind: 'cutover-complete', switchId: opening.switchId };
  }
  if (input.environment === TEST_SETUP) {
    return { kind: 'unavailable', missing: [{ kind: 'hosting', environment: TEST_SETUP }] };
  }
  const missing: MissingItem[] = [...input.availability];
  if (opening.kind === 'none') {
    missing.push({
      kind: 'opening-switch',
      ...(input.unitId === undefined ? {} : { businessUnitId: input.unitId }),
    });
  }
  if (missing.length > 0 || opening.kind === 'none') return { kind: 'unavailable', missing };
  return { kind: 'available', switchId: opening.switchId };
}

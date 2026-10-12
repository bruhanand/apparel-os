import type { MissingItem } from '@apparel-os/schemas';
import { isDevelopmentEnvironment, isSyntheticOrganisation } from '../../../kernel/index.js';
import type { GatedOperation } from '../../configuration/index.js';
import type { OpeningSwitch } from '../contracts/import-handlers.js';

// The publish gate of an opening batch (imports-and-opening-data 4.2, 10.1; PRD-SEC-017, PRD-UXP-003, PRD-LIF-011,
// PRD-LIF-026, POL-14.07, DEC-071; S1-F13-T03). Publishing an opening batch is available only where Available answers
// yes for the operation below (policy 14 Signed and its real values validated, its capability switched on), on hosting
// the allow-list below admits, at the unit's approved switch with its day-close cutover still open. Otherwise it is
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
 * Production hosting, an explicit environment value (PRD-LIF-026; product owner, 13 Oct 2026). Production hosting is not
 * chosen yet (deployment.md), so no environment has this value today: AOS_ENVIRONMENT takes only those deployment.md
 * section 1 names. It joins them with the production hosting design.
 */
export const PRODUCTION_HOSTING = 'production';

/**
 * Whether opening data may publish where the service runs (PRD-LIF-026, DEC-071; GC6-8; product owner, 13 Oct 2026):
 * an allow-list. Production hosting, where a Store switches; or development work (`local` or `dev`, which tests run
 * as) with a synthetic Organisation, which runs the path on synthetic data only (code-house-rules 11.1, 12.14).
 * Anywhere else, the test setup `kdps-test` among them, it is never available.
 */
function hostingAllows(environment: string, organisationCode: string): boolean {
  if (environment === PRODUCTION_HOSTING) return true;
  return isDevelopmentEnvironment(environment) && isSyntheticOrganisation(organisationCode);
}

export type OpeningGate =
  | { readonly kind: 'available'; readonly switchId: string }
  | { readonly kind: 'unavailable'; readonly missing: readonly MissingItem[] }
  | { readonly kind: 'cutover-complete'; readonly switchId: string };

/**
 * Whether an opening batch of a unit may publish now, from what Available answers, the environment and the
 * Organisation it runs for, and the unit's switch. Unavailable names every thing missing at once (PRD-UXP-003).
 */
export function openingGate(input: {
  readonly environment: string;
  readonly organisationCode: string;
  readonly availability: readonly MissingItem[];
  readonly opening: OpeningSwitch;
  readonly unitId: string | undefined;
}): OpeningGate {
  const { opening } = input;
  if (opening.kind === 'approved' && opening.cutover === 'complete') {
    return { kind: 'cutover-complete', switchId: opening.switchId };
  }
  const missing: MissingItem[] = [...input.availability];
  if (!hostingAllows(input.environment, input.organisationCode)) {
    missing.push({ kind: 'hosting', environment: input.environment });
  }
  if (opening.kind === 'none') {
    missing.push({
      kind: 'opening-switch',
      ...(input.unitId === undefined ? {} : { businessUnitId: input.unitId }),
    });
    return { kind: 'unavailable', missing };
  }
  if (missing.length > 0) return { kind: 'unavailable', missing };
  return { kind: 'available', switchId: opening.switchId };
}

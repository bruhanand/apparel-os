import type { MissingItem } from '@apparel-os/schemas';
import { CommandDefect, type CommandRefusal, type TransactionContext } from '../../../kernel/index.js';
import { OPEN_POLICY_READINESS, type ConfigurationInterface } from '../../configuration/index.js';
import { mappingOn } from '../../organisation/index.js';
import { HELD_LINE_DECISIONS, RECEIVE_OPERATIONS } from '../domain/gate.js';

// Whether receiving is available at a business unit now (goods-in 4.1, 10.5; access-and-approvals 7.1 step 2;
// PRD-SEC-017, PRD-LIF-001, PRD-LIF-002, POL-10.08; S2-F02-T02): Available for both receiving operations at the unit,
// which needs the capability, policies 4 and 10 Signed and validated and the unit's receiving activity, granted after
// its readiness; and the unit's mapping in force today and verified, since a missing or unverified mapping blocks the
// live action (POL-10.08). Every thing missing is named, once (PRD-UXP-003).

export interface AvailabilityDependencies {
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
}

export async function receivingMissing(
  context: TransactionContext,
  dependencies: AvailabilityDependencies,
  place: { readonly siteId: string; readonly businessUnitId: string },
  date: string,
): Promise<MissingItem[]> {
  const missing: MissingItem[] = [];
  const seen = new Set<string>();
  const add = (item: MissingItem) => {
    const key = JSON.stringify(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)));
    if (seen.has(key)) return;
    seen.add(key);
    missing.push(item);
  };
  for (const operation of RECEIVE_OPERATIONS) {
    const answer = await dependencies.configuration.checkAvailability(context, operation.code, place);
    if (answer === undefined) throw new CommandDefect(`${operation.code} is not declared`);
    for (const item of answer.missing) add(item);
  }
  const mapping = await mappingOn(context, place.businessUnitId, date);
  if (mapping === undefined) add({ kind: 'mapping', businessUnitId: place.businessUnitId, lacks: 'mapping' });
  else if (mapping.verification === undefined) {
    add({ kind: 'mapping', businessUnitId: place.businessUnitId, lacks: 'verification' });
  }
  return missing;
}

/** The refusal of a command while receiving is unavailable at its unit, naming what is missing (code-house-rules 12.3). */
export function receivingUnavailable(missing: readonly MissingItem[]): CommandRefusal | undefined {
  if (missing.length === 0) return undefined;
  return { kind: 'unavailable', code: 'configuration.operation-unavailable', missing, next: OPEN_POLICY_READINESS };
}

/**
 * Whether a held line's decision is available at its place now (goods-in 4.6, 10.5; PRD-SEC-017): Available for the
 * held-line decisions at the Site and unit, which needs receiving's capability and policy 17 Signed and validated.
 * Asked for either outcome, as a damage report's decision is (goods-in 8.5).
 */
export async function heldLineDecisionUnavailable(
  context: TransactionContext,
  dependencies: AvailabilityDependencies,
  place: { readonly siteId: string; readonly businessUnitId: string },
): Promise<CommandRefusal | undefined> {
  const answer = await dependencies.configuration.checkAvailability(context, HELD_LINE_DECISIONS.code, place);
  if (answer === undefined) throw new CommandDefect(`${HELD_LINE_DECISIONS.code} is not declared`);
  return receivingUnavailable(answer.missing);
}

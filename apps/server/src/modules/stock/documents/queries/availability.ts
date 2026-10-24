import { CommandDefect, type CommandRefusal, type TransactionContext } from '../../../../kernel/index.js';
import { OPEN_POLICY_READINESS, type ConfigurationInterface } from '../../../configuration/index.js';
import { DAMAGE_REPORTS } from '../domain/kinds.js';

// Whether damage reports are available at a place now (goods-in 10.5; access-and-approvals 7.1 step 2; PRD-SEC-017;
// S2-F08-T01): Available for the damage operation at the Site and unit, which needs its capability, policy 17 Signed
// and validated, an Open exception-code series and the routing of the damage exception at the Site. Every thing missing
// is named (PRD-UXP-003).

export async function damageUnavailable(
  context: TransactionContext,
  dependencies: { readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'> },
  place: { readonly siteId: string; readonly businessUnitId: string },
): Promise<CommandRefusal | undefined> {
  const answer = await dependencies.configuration.checkAvailability(context, DAMAGE_REPORTS.code, {
    siteId: place.siteId,
    businessUnitId: place.businessUnitId,
  });
  if (answer === undefined) throw new CommandDefect(`${DAMAGE_REPORTS.code} is not declared`);
  if (answer.missing.length === 0) return undefined;
  return {
    kind: 'unavailable',
    code: 'configuration.operation-unavailable',
    missing: [...answer.missing],
    next: OPEN_POLICY_READINESS,
  };
}

import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import { businessUnitHeads } from '../../../organisation/index.js';

/**
 * Brand coverage by unit kind (structure-and-masters 3.3; PRD-ORG-006): an office unit operates without a brand, so it
 * has no coverage; a brand-counter unit covers at most one brand, none while it is set up, since activation asks for
 * one in force (product owner, 10 Oct 2026; readiness is S1-F04's); a whole-store or warehouse unit any number. The
 * unit's kind is read through `organisation`'s interface (module-map section 3).
 */
export async function coverageRules(
  context: TransactionContext,
  unitId: string,
  brands: number,
): Promise<CommandRefusal | undefined> {
  const unit = (await businessUnitHeads(context, [unitId])).get(unitId);
  const missing = [{ kind: 'record', recordType: 'organisation.business_unit', recordId: unitId }];
  if (unit === undefined) return { kind: 'not-found', code: 'merchandise.record-not-found', missing };
  if (unit.kind === 'office') return { kind: 'refused', code: 'merchandise.office-unit-has-no-brand', missing };
  if (unit.kind === 'brand-counter' && brands > 1) {
    return { kind: 'refused', code: 'merchandise.brand-counter-one-brand', missing };
  }
  return undefined;
}

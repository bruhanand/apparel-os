import type { TaxRuleKind } from '@apparel-os/schemas';
import { lockTable, type LockTarget } from '../../../../kernel/index.js';
import { approvedVersionValues, type ConfiguredValue, type ValidityCheck } from '../../../configuration/index.js';
import { KIND_TABLES, versionsOf } from '../commands/lines.js';
import {
  goodsClassification,
  priceBasis,
  registrationTaxApplicability,
  roundingRule,
  taxRateRule,
} from '../db/schema.js';
import { TAX_RULE_KINDS } from '../domain/kinds.js';

// The tax-rule records as policy 10's values, for the policy gate (module-map 4.4, section 3 rule 6; DM-6;
// shared-calculations 10.1 "As built"; goods-in 10.5; POL-10.02, POL-10.05, POL-10.06; RR-480, RR-558, product owner,
// 21 Oct 2026; S2-F02-T02): every approved version of every kind, the goods classifications, the rate and value rules,
// the registrations' applicability, the price basis and the rounding rules, in force today or later, with its origin
// and its preparer, whom the validator of policy 10 must not be. A later version ends one in place, which changes its
// version and so lapses a validation (RR-478). A decision on a record locks the record's identity row, which recording
// a validation locks shared, so none changes between that read and the validation's insert (S1-F04 review S3). Which
// rules a bill or a receipt needs is asked by the operations themselves (shared-calculations 10.2), so the check is
// valid whatever records exist and adds no condition the policy does not set.

/** The code of the check (module-map 4.4 "Register a validity check"). */
export const TAX_RULES_CHECK = 'finance.tax-rules';

export const taxRulesCheck: ValidityCheck = {
  code: TAX_RULES_CHECK,
  policy: 10,
  check: () => Promise.resolve({ kind: 'valid' }),
  async values(context) {
    const values: ConfiguredValue[] = [];
    for (const kind of TAX_RULE_KINDS) {
      values.push(...(await approvedVersionValues(context, versionsOf(kind))));
    }
    return values;
  },
  // Every change and decision of a record locks its identity row (commands/lines.ts recordLock).
  async locks(context) {
    const identities = [
      ['goods-classification', await context.tx.select({ id: goodsClassification.id }).from(goodsClassification)],
      ['tax-rate-rule', await context.tx.select({ id: taxRateRule.id }).from(taxRateRule)],
      [
        'registration-applicability',
        await context.tx.select({ id: registrationTaxApplicability.id }).from(registrationTaxApplicability),
      ],
      ['price-basis', await context.tx.select({ id: priceBasis.id }).from(priceBasis)],
      ['rounding-rule', await context.tx.select({ id: roundingRule.id }).from(roundingRule)],
    ] as const satisfies readonly (readonly [TaxRuleKind, readonly { id: string }[]])[];
    return identities.flatMap(([kind, rows]) =>
      rows.map((row): LockTarget => ({
        table: lockTable('finance', KIND_TABLES[kind].identity),
        id: row.id,
        mode: 'shared',
      })),
    );
  },
};

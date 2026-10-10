import { TAX_RULE_TYPE, type MissingItem, type TaxRuleKind } from '@apparel-os/schemas';
import { eq, sql, type AnyColumn } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type TransactionContext } from '../../../../kernel/index.js';
import { versionLine, type Line, type VersionHead } from '../../books/index.js';
import {
  goodsClassificationVersion,
  priceBasisVersion,
  registrationTaxApplicabilityVersion,
  roundingRuleVersion,
  taxRateRuleVersion,
  type Decision,
} from '../db/schema.js';

// The version lines of the tax rules part (shared-calculations 10.1, 10.3; structure-and-masters 2.2; code-house-rules
// 7.3; S1-F09-T04): each kind's tables, read through the version lines `finance` · books shares (module-map 4.14;
// RR-486), over the part's own table definitions (code-house-rules 3.4).

/** Each kind's tables: its identity table, its version table and the column naming the record. */
export interface KindTables {
  readonly identity: string;
  readonly versions: object;
  readonly owner: AnyColumn;
}

export const KIND_TABLES: Readonly<Record<TaxRuleKind, KindTables>> = {
  'goods-classification': {
    identity: 'goods_classification',
    versions: goodsClassificationVersion,
    owner: goodsClassificationVersion.goodsClassificationId,
  },
  'tax-rate-rule': { identity: 'tax_rate_rule', versions: taxRateRuleVersion, owner: taxRateRuleVersion.taxRateRuleId },
  'registration-applicability': {
    identity: 'registration_tax_applicability',
    versions: registrationTaxApplicabilityVersion,
    owner: registrationTaxApplicabilityVersion.registrationTaxApplicabilityId,
  },
  'price-basis': { identity: 'price_basis', versions: priceBasisVersion, owner: priceBasisVersion.priceBasisId },
  'rounding-rule': {
    identity: 'rounding_rule',
    versions: roundingRuleVersion,
    owner: roundingRuleVersion.roundingRuleId,
  },
};

/** The version table of a kind, through the shape every version table shares (db/schema.ts). */
export const versionsOf = (kind: TaxRuleKind) => KIND_TABLES[kind].versions as typeof goodsClassificationVersion;

/** One record's line of versions, read as `finance.tax_rule` (10.3). */
export const lineOf = (kind: TaxRuleKind, recordId: string): Line =>
  versionLine(KIND_TABLES[kind].versions, KIND_TABLES[kind].owner, TAX_RULE_TYPE, recordId);

export const recordItem = (recordId: string): MissingItem => ({ kind: 'record', recordType: TAX_RULE_TYPE, recordId });

/** The identity row of a record, which every change and decision of it locks at step 1 (code-house-rules 8.2). */
export const recordLock = (kind: TaxRuleKind, id: string) =>
  ({ table: lockTable('finance', KIND_TABLES[kind].identity), id, mode: 'exclusive' }) as const;

/** Locks a record's identity row exclusively at step 1 (code-house-rules 8.2); false when it does not exist. */
export async function lockRecord(context: TransactionContext, kind: TaxRuleKind, id: string): Promise<boolean> {
  const locked = await context.lock(LOCK_STEP.document, [recordLock(kind, id)]);
  return !locked.missing.some((each) => each.id === id);
}

export async function versionHead(
  context: TransactionContext,
  kind: TaxRuleKind,
  versionId: string,
): Promise<VersionHead | undefined> {
  const versions = versionsOf(kind);
  const [row] = await context.tx
    .select({
      ownerId: sql<string>`${KIND_TABLES[kind].owner}::text`,
      decision: sql<Decision>`${versions.decision}`,
      start: sql<string>`lower(${versions.validDuring})::text`,
    })
    .from(versions)
    .where(eq(versions.id, versionId));
  return row;
}

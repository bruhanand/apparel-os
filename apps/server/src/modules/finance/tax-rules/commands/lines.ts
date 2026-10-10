import { TAX_RULE_TYPE, type MissingItem, type TaxRuleKind } from '@apparel-os/schemas';
import { and, asc, eq, gt, max, sql, type AnyColumn } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type CommandRefusal, type TransactionContext } from '../../../../kernel/index.js';
import {
  goodsClassificationVersion,
  priceBasisVersion,
  registrationTaxApplicabilityVersion,
  roundingRuleVersion,
  taxRateRuleVersion,
  taxRuleCaEvidence,
  type Decision,
} from '../db/schema.js';

// The version lines of the tax rules part (shared-calculations 10.1, 10.3; structure-and-masters 2.2; code-house-rules
// 7.3; S1-F09-T04): the rows of one record's effective-dated versions, whichever kind of tax-rule record it is. What
// every change and decision of them shares, through Drizzle's query builder over the part's own table definitions
// (code-house-rules 3.4).

/**
 * Each kind's tables: its identity table, its version table and the column naming the record, and the column of the
 * CA's evidence naming its versions. The version tables share the version columns (db/schema.ts), so a line reads any
 * of them through the shape of one; only those shared columns are named through it.
 */
export interface KindTables {
  readonly identity: string;
  readonly versions: typeof goodsClassificationVersion;
  readonly owner: AnyColumn;
  readonly evidence: AnyColumn;
}

export const KIND_TABLES: Readonly<Record<TaxRuleKind, KindTables>> = {
  'goods-classification': {
    identity: 'goods_classification',
    versions: goodsClassificationVersion,
    owner: goodsClassificationVersion.goodsClassificationId,
    evidence: taxRuleCaEvidence.goodsClassificationVersionId,
  },
  'tax-rate-rule': {
    identity: 'tax_rate_rule',
    versions: taxRateRuleVersion as unknown as typeof goodsClassificationVersion,
    owner: taxRateRuleVersion.taxRateRuleId,
    evidence: taxRuleCaEvidence.taxRateRuleVersionId,
  },
  'registration-applicability': {
    identity: 'registration_tax_applicability',
    versions: registrationTaxApplicabilityVersion as unknown as typeof goodsClassificationVersion,
    owner: registrationTaxApplicabilityVersion.registrationTaxApplicabilityId,
    evidence: taxRuleCaEvidence.registrationTaxApplicabilityVersionId,
  },
  'price-basis': {
    identity: 'price_basis',
    versions: priceBasisVersion as unknown as typeof goodsClassificationVersion,
    owner: priceBasisVersion.priceBasisId,
    evidence: taxRuleCaEvidence.priceBasisVersionId,
  },
  'rounding-rule': {
    identity: 'rounding_rule',
    versions: roundingRuleVersion as unknown as typeof goodsClassificationVersion,
    owner: roundingRuleVersion.roundingRuleId,
    evidence: taxRuleCaEvidence.roundingRuleVersionId,
  },
};

export type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

export function refused<Answer>(
  kind: CommandRefusal['kind'],
  code: string,
  missing: MissingItem[] = [],
): Outcome<Answer> {
  return { kind: 'refusal', refusal: { kind, code, missing } };
}

export const recordItem = (recordId: string): MissingItem => ({ kind: 'record', recordType: TAX_RULE_TYPE, recordId });

/** Today under the Organisation's timezone, or the refusal while it has none (PRD-MOD-009; code-house-rules 9). */
export async function today(context: TransactionContext): Promise<string | CommandRefusal> {
  const date = await context.businessDate();
  if (date.kind === 'set') return date.date;
  return {
    kind: 'unavailable',
    code: 'access.business-date-not-set',
    missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
  };
}

/** Locks a record's identity row exclusively at step 1 (code-house-rules 8.2); false when it does not exist. */
export async function lockRecord(context: TransactionContext, kind: TaxRuleKind, id: string): Promise<boolean> {
  const locked = await context.lock(LOCK_STEP.document, [
    { table: lockTable('finance', KIND_TABLES[kind].identity), id, mode: 'exclusive' },
  ]);
  return !locked.missing.some((each) => each.id === id);
}

/** The newest version of a record, its version token (code-house-rules 12.7), or undefined while it has none. */
export async function newestVersion(
  context: TransactionContext,
  kind: TaxRuleKind,
  recordId: string,
): Promise<string | undefined> {
  const { versions, owner } = KIND_TABLES[kind];
  const [row] = await context.tx
    .select({ id: max(sql<string>`${versions.id}::text`) })
    .from(versions)
    .where(eq(owner, recordId));
  return row?.id ?? undefined;
}

/** The refusal of a change made on a stale screen, naming the newest version (12.7), or undefined. */
export async function staleToken(
  context: TransactionContext,
  kind: TaxRuleKind,
  recordId: string,
  token: string | undefined,
): Promise<CommandRefusal | undefined> {
  const newest = await newestVersion(context, kind, recordId);
  if (newest === undefined || newest === token) return undefined;
  return {
    kind: 'conflict',
    code: 'kernel.stale-version',
    missing: [{ kind: 'version', recordType: TAX_RULE_TYPE, recordId, versionId: newest }],
  };
}

/** The refusal while another approved version of the record starts on the date: they never overlap (10.1, 10.3). */
export async function approvedOn(
  context: TransactionContext,
  kind: TaxRuleKind,
  recordId: string,
  start: string,
): Promise<CommandRefusal | undefined> {
  const { versions, owner } = KIND_TABLES[kind];
  const [same] = await context.tx
    .select({ id: versions.id })
    .from(versions)
    .where(
      and(eq(owner, recordId), eq(versions.decision, 'Approved'), sql`lower(${versions.validDuring}) = ${start}::date`),
    )
    .limit(1);
  return same === undefined
    ? undefined
    : {
        kind: 'refused',
        code: 'finance.version-overlaps',
        missing: [{ kind: 'version', recordType: TAX_RULE_TYPE, recordId, versionId: same.id }],
      };
}

/** A version as a decision reads it: its record, decision and start. */
export interface VersionHead {
  readonly ownerId: string;
  readonly decision: Decision;
  readonly start: string;
}

export async function versionHead(
  context: TransactionContext,
  kind: TaxRuleKind,
  versionId: string,
): Promise<VersionHead | undefined> {
  const { versions, owner } = KIND_TABLES[kind];
  const [row] = await context.tx
    .select({
      ownerId: sql<string>`${owner}::text`,
      decision: sql<Decision>`${versions.decision}`,
      start: sql<string>`lower(${versions.validDuring})::text`,
    })
    .from(versions)
    .where(eq(versions.id, versionId));
  return row;
}

/** How many pieces of the CA's evidence a version has (10.1; books-and-posting 6.3). */
export async function caEvidenceCount(context: TransactionContext, kind: TaxRuleKind, versionId: string) {
  const [row] = await context.tx
    .select({ count: sql<number>`count(*)::int` })
    .from(taxRuleCaEvidence)
    .where(eq(KIND_TABLES[kind].evidence, versionId));
  return row?.count ?? 0;
}

/**
 * A version taking effect from its start (structure-and-masters 2.2; code-house-rules 7.3): the approved version in
 * force or Scheduled then ends there, and the version ends where an approved version starting after it starts.
 */
export async function takeEffect(
  context: TransactionContext,
  kind: TaxRuleKind,
  recordId: string,
  versionId: string,
  start: string,
): Promise<void> {
  const { versions, owner } = KIND_TABLES[kind];
  const lower = sql`lower(${versions.validDuring})`;
  const [next] = await context.tx
    .select({ start: sql<string>`${lower}::text` })
    .from(versions)
    .where(and(eq(owner, recordId), eq(versions.decision, 'Approved'), gt(lower, sql`${start}::date`)))
    .orderBy(asc(lower))
    .limit(1);
  await context.tx
    .update(versions)
    .set({ validDuring: sql`daterange(${lower}, ${start}::date)` })
    .where(and(eq(owner, recordId), eq(versions.decision, 'Approved'), sql`${versions.validDuring} @> ${start}::date`));
  await context.tx
    .update(versions)
    .set({ decision: 'Approved', validDuring: sql`daterange(${start}::date, ${next?.start ?? null}::date)` })
    .where(eq(versions.id, versionId));
}

/** `[start,end)` as PostgreSQL writes a daterange. */
export function datesOf(range: string): { start: string; end?: string } {
  const match = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})?\)$/.exec(range);
  if (match?.[1] === undefined) throw new Error(`Unexpected range ${range}`);
  return match[2] === undefined ? { start: match[1] } : { start: match[1], end: match[2] };
}

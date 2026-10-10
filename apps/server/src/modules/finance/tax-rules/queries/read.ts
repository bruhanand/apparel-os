import type { RoundingRulesInForce, TaxRulesInForce } from '@apparel-os/calculations';
import type { RoundingKind, TaxRuleKind, TaxRuleRecord, TaxRulesInForceAnswer } from '@apparel-os/schemas';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { LatestRequest } from '../../../access/index.js';
import { taxRegistrationCodes } from '../../../organisation/index.js';
import {
  goodsClassification,
  goodsClassificationVersion,
  priceBasisVersion,
  registrationTaxApplicability,
  registrationTaxApplicabilityVersion,
  registrationTaxComponent,
  roundingRuleVersion,
  taxRateRule,
  taxRateRuleVersion,
  taxRateSlab,
  type Decision,
} from '../db/schema.js';
import { caEvidenceOf, datesOf } from '../../books/index.js';
import { KIND_TABLES } from '../commands/lines.js';
import { versionState } from '../domain/kinds.js';

// Read tax rules (shared-calculations 10.2; module-map 4.14 "Read tax rules"; S1-F09-T04): for a business date, a tax
// registration and a set of classifications, the rules in force, each with its version's identifier, in the shapes the
// calculations take (section 4). Only an approved version is ever read; a record with none in force answers "not set"
// (code-house-rules 12.14), never a default. And each record with every version, for maintaining it.

type Setting<T> = { kind: 'set'; value: T; versionId: string } | { kind: 'not-set' };
const NOT_SET = { kind: 'not-set' } as const;
const set = <T extends { version: string }>(value: T): Setting<T> => ({ kind: 'set', value, versionId: value.version });

/** The approved version of a table in force on the date, among the rows the condition names. */
const inForce = (table: typeof goodsClassificationVersion, date: string) =>
  and(eq(table.decision, 'Approved'), sql`${table.validDuring} @> ${date}::date`);

export interface TaxRulesQuery {
  readonly date: string;
  readonly taxRegistrationId: string;
  readonly classifications: readonly string[];
}

async function slabsOf(context: TransactionContext, versionIds: readonly string[]) {
  if (versionIds.length === 0) return [];
  return context.tx
    .select()
    .from(taxRateSlab)
    .where(inArray(taxRateSlab.taxRateRuleVersionId, [...versionIds]))
    .orderBy(asc(taxRateSlab.lowerBoundPaise));
}

async function componentsOf(context: TransactionContext, versionIds: readonly string[]) {
  if (versionIds.length === 0) return [];
  return context.tx
    .select()
    .from(registrationTaxComponent)
    .where(inArray(registrationTaxComponent.registrationTaxApplicabilityVersionId, [...versionIds]))
    .orderBy(asc(registrationTaxComponent.component));
}

type RateRow = typeof taxRateRuleVersion.$inferSelect;
/** A rate rule in the shape the calculations take (shared-calculations 4; TaxRateRule). */
type RateRuleValue = Extract<TaxRulesInForceAnswer['classifications'][number]['rateRule'], { kind: 'set' }>['value'];

function rateRuleOf(row: RateRow, classification: string, slabs: Awaited<ReturnType<typeof slabsOf>>): RateRuleValue {
  if (row.ruleKind === 'single-rate') {
    if (row.rate === null) throw new Error('A single-rate version holds a rate');
    return { kind: 'single-rate', version: row.id, classification, rate: row.rate };
  }
  if (row.comparedPer === null || row.comparedDiscounts === null || row.comparedTax === null) {
    throw new Error('A slabs version names the value it compares');
  }
  return {
    kind: 'slabs',
    version: row.id,
    classification,
    comparedValue: { per: row.comparedPer, discounts: row.comparedDiscounts, tax: row.comparedTax },
    slabs: slabs
      .filter((slab) => slab.taxRateRuleVersionId === row.id)
      .map((slab) => ({ lowerBound: slab.lowerBoundPaise, boundIn: slab.boundIn, rate: slab.rate })),
  };
}

/** Read tax rules (10.2): every rule in force on the date, each with its version, or not set. */
export async function taxRulesInForce(
  context: TransactionContext,
  query: TaxRulesQuery,
): Promise<TaxRulesInForceAnswer> {
  const { date } = query;
  const [basis] = await context.tx
    .select()
    .from(priceBasisVersion)
    .where(inForce(priceBasisVersion as unknown as typeof goodsClassificationVersion, date));

  const [applicability] = await context.tx
    .select({ version: registrationTaxApplicabilityVersion })
    .from(registrationTaxApplicabilityVersion)
    .innerJoin(
      registrationTaxApplicability,
      eq(registrationTaxApplicability.id, registrationTaxApplicabilityVersion.registrationTaxApplicabilityId),
    )
    .where(
      and(
        eq(registrationTaxApplicability.taxRegistrationId, query.taxRegistrationId),
        inForce(registrationTaxApplicabilityVersion as unknown as typeof goodsClassificationVersion, date),
      ),
    );
  const registrationCode = (await taxRegistrationCodes(context, [query.taxRegistrationId])).get(
    query.taxRegistrationId,
  );
  const components = applicability === undefined ? [] : await componentsOf(context, [applicability.version.id]);

  const codes = [...query.classifications];
  const classifications =
    codes.length === 0
      ? []
      : await context.tx
          .select({ id: goodsClassification.id, code: goodsClassification.code, version: goodsClassificationVersion })
          .from(goodsClassificationVersion)
          .innerJoin(goodsClassification, eq(goodsClassification.id, goodsClassificationVersion.goodsClassificationId))
          .where(
            and(
              inArray(goodsClassification.code, codes),
              inForce(goodsClassificationVersion, date),
              eq(goodsClassificationVersion.retired, false),
            ),
          );
  const classificationIds = classifications.map((each) => each.id);
  const rates =
    classificationIds.length === 0
      ? []
      : await context.tx
          .select({ classificationId: taxRateRule.goodsClassificationId, version: taxRateRuleVersion })
          .from(taxRateRuleVersion)
          .innerJoin(taxRateRule, eq(taxRateRule.id, taxRateRuleVersion.taxRateRuleId))
          .where(
            and(
              inArray(taxRateRule.goodsClassificationId, classificationIds),
              inForce(taxRateRuleVersion as unknown as typeof goodsClassificationVersion, date),
            ),
          );
  const slabs = await slabsOf(
    context,
    rates.map((each) => each.version.id),
  );

  const rounding = await context.tx
    .select()
    .from(roundingRuleVersion)
    .where(inForce(roundingRuleVersion as unknown as typeof goodsClassificationVersion, date));
  const roundingOf = (kind: RoundingKind) => rounding.find((row) => row.kind === kind);
  const plain = (kind: 'discount' | 'bill') => {
    const row = roundingOf(kind);
    return row === undefined ? NOT_SET : set({ version: row.id, unit: row.unitPaise, mode: row.mode });
  };
  const taxRow = roundingOf('tax');

  return {
    date,
    priceBasis: basis === undefined ? NOT_SET : set({ version: basis.id, pricesIncludeTax: basis.pricesIncludeTax }),
    registration:
      applicability === undefined || registrationCode === undefined
        ? NOT_SET
        : set({
            version: applicability.version.id,
            registration: registrationCode,
            chargesTax: applicability.version.chargesTax,
            components: components.map((each) => ({ component: each.component, share: each.share })),
          }),
    classifications: codes.map((code) => {
      const found = classifications.find((each) => each.code === code);
      if (found === undefined) return { code, classification: NOT_SET, rateRule: NOT_SET };
      const rate = rates.find((each) => each.classificationId === found.id);
      return {
        code,
        classification: set({ code, version: found.version.id }),
        rateRule: rate === undefined ? NOT_SET : set(rateRuleOf(rate.version, code, slabs)),
      };
    }),
    rounding: {
      discount: plain('discount'),
      tax:
        taxRow?.level == null
          ? NOT_SET
          : set({ version: taxRow.id, unit: taxRow.unitPaise, mode: taxRow.mode, level: taxRow.level }),
      bill: plain('bill'),
    },
  };
}

/**
 * The answer in the shapes `@apparel-os/calculations` takes (shared-calculations 4, 10.2): a rule not set is left
 * out, so a calculation that needs it refuses naming it (3.3, 5.10; PRD-SEC-017), never a default.
 */
export function calculationInputs(answer: TaxRulesInForceAnswer): {
  readonly tax: TaxRulesInForce;
  readonly rounding: RoundingRulesInForce;
} {
  const classifications = answer.classifications.flatMap((each) =>
    each.classification.kind === 'set' ? [each.classification.value] : [],
  );
  const rateRules = answer.classifications.flatMap((each) =>
    each.rateRule.kind === 'set' ? [each.rateRule.value] : [],
  );
  const { discount, tax, bill } = answer.rounding;
  return {
    tax: {
      ...(answer.priceBasis.kind === 'set' ? { priceBasis: answer.priceBasis.value } : {}),
      ...(answer.registration.kind === 'set' ? { registration: answer.registration.value } : {}),
      classifications,
      rateRules,
    },
    rounding: {
      ...(discount.kind === 'set' ? { discount: discount.value } : {}),
      ...(tax.kind === 'set' ? { tax: tax.value } : {}),
      ...(bill.kind === 'set' ? { bill: bill.value } : {}),
    },
  };
}

// Records with every version (code-house-rules 12.1, 12.7).

export interface PageRequest {
  readonly after?: string | undefined;
  readonly limit?: number | undefined;
}
/** The latest approval request of each version named, from `access` (9.1, 9.6). */
export type RequestReader = (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>;

/** A technical cap the builders set (code-house-rules 12.1), the same as the structure's. */
const PAGE_CAP = 100;

interface VersionRow {
  readonly id: string;
  readonly ownerId: string;
  readonly validDuring: string;
  readonly decision: Decision;
  readonly origin: TaxRuleRecord['versions'][number]['origin'];
  readonly content: TaxRuleRecord['versions'][number]['content'];
}

/** Each kind's identity rows with their key, and its versions with their content. */
async function heads(context: TransactionContext, kind: TaxRuleKind, ids: readonly string[]) {
  const table = sql.raw(`finance.${KIND_TABLES[kind].identity}`);
  const key = {
    'goods-classification': sql`code`,
    'tax-rate-rule': sql`goods_classification_id::text`,
    'registration-applicability': sql`tax_registration_id::text`,
    'price-basis': sql`'organisation'`,
    'rounding-rule': sql`kind`,
  }[kind];
  const result = await context.tx.execute<{ id: string; key: string }>(
    sql`select id::text as id, ${key} as key from ${table} where id = any(${`{${ids.join(',')}}`}::uuid[])`,
  );
  return new Map(result.rows.map((row) => [row.id, row.key]));
}

async function versionsOf(
  context: TransactionContext,
  kind: TaxRuleKind,
  ids: readonly string[],
): Promise<VersionRow[]> {
  const base = (
    row: { id: string; validDuring: string; decision: Decision; origin: VersionRow['origin'] },
    ownerId: string,
    content: VersionRow['content'],
  ): VersionRow => ({
    id: row.id,
    ownerId,
    validDuring: row.validDuring,
    decision: row.decision,
    origin: row.origin,
    content,
  });
  const owned = [...ids];
  switch (kind) {
    case 'goods-classification': {
      const rows = await context.tx
        .select()
        .from(goodsClassificationVersion)
        .where(inArray(goodsClassificationVersion.goodsClassificationId, owned));
      return rows.map((row) => base(row, row.goodsClassificationId, { kind, retired: row.retired }));
    }
    case 'tax-rate-rule': {
      const rows = await context.tx
        .select()
        .from(taxRateRuleVersion)
        .where(inArray(taxRateRuleVersion.taxRateRuleId, owned));
      const slabs = await slabsOf(
        context,
        rows.map((row) => row.id),
      );
      return rows.map((row) => {
        const rule = rateRuleOf(row, '', slabs);
        return base(row, row.taxRateRuleId, {
          kind,
          rule:
            rule.kind === 'single-rate'
              ? { kind: 'single-rate', rate: rule.rate }
              : { kind: 'slabs', comparedValue: rule.comparedValue, slabs: [...rule.slabs] },
        });
      });
    }
    case 'registration-applicability': {
      const rows = await context.tx
        .select()
        .from(registrationTaxApplicabilityVersion)
        .where(inArray(registrationTaxApplicabilityVersion.registrationTaxApplicabilityId, owned));
      const components = await componentsOf(
        context,
        rows.map((row) => row.id),
      );
      return rows.map((row) =>
        base(row, row.registrationTaxApplicabilityId, {
          kind,
          chargesTax: row.chargesTax,
          components: components
            .filter((each) => each.registrationTaxApplicabilityVersionId === row.id)
            .map((each) => ({ component: each.component, share: each.share })),
        }),
      );
    }
    case 'price-basis': {
      const rows = await context.tx
        .select()
        .from(priceBasisVersion)
        .where(inArray(priceBasisVersion.priceBasisId, owned));
      return rows.map((row) => base(row, row.priceBasisId, { kind, pricesIncludeTax: row.pricesIncludeTax }));
    }
    case 'rounding-rule': {
      const rows = await context.tx
        .select()
        .from(roundingRuleVersion)
        .where(inArray(roundingRuleVersion.roundingRuleId, owned));
      return rows.map((row) =>
        base(row, row.roundingRuleId, {
          kind,
          unit: row.unitPaise,
          mode: row.mode,
          ...(row.level === null ? {} : { level: row.level }),
        }),
      );
    }
  }
}

async function recordsOf(
  context: TransactionContext,
  kind: TaxRuleKind,
  ids: readonly string[],
  today: string,
  requests: RequestReader,
): Promise<TaxRuleRecord[]> {
  if (ids.length === 0) return [];
  const keys = await heads(context, kind, ids);
  const versions = await versionsOf(context, kind, ids);
  const versionIds = versions.map((row) => row.id);
  const latest = await requests(versionIds);
  // The CA's evidence is the one record of `finance` the books part keeps (books-and-posting 6.3; RR-486).
  const evidence = await caEvidenceOf(context, versionIds);
  return ids.flatMap((id) => {
    const key = keys.get(id);
    if (key === undefined) return [];
    const own = versions
      .filter((row) => row.ownerId === id)
      .sort((a, b) => {
        const byStart = datesOf(b.validDuring).start.localeCompare(datesOf(a.validDuring).start);
        return byStart !== 0 ? byStart : b.id.localeCompare(a.id);
      });
    const token = own
      .map((row) => row.id)
      .sort()
      .at(-1);
    return [
      {
        id,
        kind,
        key,
        ...(token === undefined ? {} : { versionToken: token }),
        versions: own.map((row) => {
          const dates = datesOf(row.validDuring);
          const request = latest.get(row.id);
          return {
            id: row.id,
            validFrom: dates.start,
            ...(dates.end === undefined ? {} : { validTo: dates.end }),
            state: versionState({
              decision: row.decision,
              start: dates.start,
              end: dates.end,
              today,
              requestState: request?.state,
            }),
            origin: row.origin,
            ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
            caEvidence: evidence.get(row.id)?.length ?? 0,
            content: row.content,
          };
        }),
      },
    ];
  });
}

/** One record with every version, or undefined when the kind has no record of that identifier. */
export async function taxRuleRecord(
  context: TransactionContext,
  kind: TaxRuleKind,
  id: string,
  today: string,
  requests: RequestReader,
): Promise<TaxRuleRecord | undefined> {
  const [record] = await recordsOf(context, kind, [id], today, requests);
  return record;
}

/** A page of one kind's records, by identifier, after the cursor's record (code-house-rules 12.1). */
export async function taxRulePage(
  context: TransactionContext,
  kind: TaxRuleKind,
  page: PageRequest,
  today: string,
  requests: RequestReader,
): Promise<{ records: TaxRuleRecord[]; next: string | null }> {
  const limit = Math.min(page.limit ?? PAGE_CAP, PAGE_CAP);
  const table = sql.raw(`finance.${KIND_TABLES[kind].identity}`);
  const after = page.after === undefined ? sql`true` : sql`id > ${page.after}::uuid`;
  const result = await context.tx.execute<{ id: string }>(
    sql`select id::text as id from ${table} where ${after} order by id limit ${limit + 1}`,
  );
  const ids = result.rows.map((row) => row.id);
  const shown = ids.slice(0, limit);
  return {
    records: await recordsOf(context, kind, shown, today, requests),
    next: ids.length > limit ? (shown.at(-1) ?? null) : null,
  };
}

import { paise, type Paise } from '@apparel-os/domain';
import type { OpenToBuyBudget, OpenToBuyBudgetVersion, OpenToBuyRemaining } from '@apparel-os/schemas';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, LatestRequest } from '../../access/index.js';
import type { CatalogueInterface, CatalogueRecord } from '../../merchandise/catalogue/index.js';
import { openToBuyBudget, openToBuyBudgetCheck, openToBuyBudgetVersion } from '../db/schema.js';
import { versionState } from '../domain/budgets.js';

// The reads of open-to-buy budgets (goods-in 3.3, section 11; PRD-BKG-004): each budget with its brand and season,
// its remaining amount and every version with its history (code-house-rules 7.3), and the remaining open-to-buy of a
// brand and season that a booking's approval asks (S2-F01-T03).

/** What the reads ask of other modules: the latest request of each version, and the names of brands and seasons. */
export interface ReadDependencies {
  readonly access: Pick<AccessInterface, 'approvalRequestsOf'>;
  readonly catalogue: Pick<CatalogueInterface, 'record'>;
}

/** A budget's identity row. */
export type BudgetRow = typeof openToBuyBudget.$inferSelect;
type VersionRow = typeof openToBuyBudgetVersion.$inferSelect;
type CheckRow = typeof openToBuyBudgetCheck.$inferSelect;

/** The instants a tstzrange holds, as PostgreSQL writes them. */
interface Span {
  readonly from: Date;
  readonly until: Date | null;
}

/** The start and the end of an approved version's instants, read by PostgreSQL rather than parsed (7.3). */
async function spansOf(context: TransactionContext, versionIds: readonly string[]): Promise<Map<string, Span>> {
  const spans = new Map<string, Span>();
  if (versionIds.length === 0) return spans;
  const rows = await context.tx
    .select({
      id: openToBuyBudgetVersion.id,
      from: sql<Date>`pg_catalog.lower(${openToBuyBudgetVersion.validDuring})`.mapWith(
        (value: string) => new Date(value),
      ),
      until: sql<Date | null>`pg_catalog.upper(${openToBuyBudgetVersion.validDuring})`.mapWith(
        (value: string | null) => (value === null ? null : new Date(value)),
      ),
    })
    .from(openToBuyBudgetVersion)
    .where(
      and(inArray(openToBuyBudgetVersion.id, [...versionIds]), sql`${openToBuyBudgetVersion.validDuring} is not null`),
    );
  for (const row of rows) spans.set(row.id, { from: row.from, until: row.until });
  return spans;
}

/** The budget of a brand and season, or undefined (3.3). */
export async function budgetOf(
  context: TransactionContext,
  brandId: string,
  seasonValueId: string,
): Promise<BudgetRow | undefined> {
  const [row] = await context.tx
    .select()
    .from(openToBuyBudget)
    .where(and(eq(openToBuyBudget.brandId, brandId), eq(openToBuyBudget.seasonValueId, seasonValueId)));
  return row;
}

/** A budget's identity row, or undefined. */
export async function budgetRow(context: TransactionContext, budgetId: string): Promise<BudgetRow | undefined> {
  const [row] = await context.tx.select().from(openToBuyBudget).where(eq(openToBuyBudget.id, budgetId));
  return row;
}

/** A budget's versions, oldest first. */
export async function versionsOf(context: TransactionContext, budgetId: string): Promise<VersionRow[]> {
  return context.tx
    .select()
    .from(openToBuyBudgetVersion)
    .where(eq(openToBuyBudgetVersion.openToBuyBudgetId, budgetId))
    .orderBy(asc(openToBuyBudgetVersion.recordedAt), asc(openToBuyBudgetVersion.id));
}

/** One version with its budget, or undefined. */
export async function versionRow(
  context: TransactionContext,
  versionId: string,
): Promise<(VersionRow & { readonly brandId: string }) | undefined> {
  const [row] = await context.tx
    .select({ version: openToBuyBudgetVersion, brandId: openToBuyBudget.brandId })
    .from(openToBuyBudgetVersion)
    .innerJoin(openToBuyBudget, eq(openToBuyBudget.id, openToBuyBudgetVersion.openToBuyBudgetId))
    .where(eq(openToBuyBudgetVersion.id, versionId));
  return row === undefined ? undefined : { ...row.version, brandId: row.brandId };
}

/** Accounts' check of a version, or undefined while it has none (3.3; POL-05.09). */
export async function checkOf(context: TransactionContext, versionId: string): Promise<CheckRow | undefined> {
  const [row] = await context.tx
    .select()
    .from(openToBuyBudgetCheck)
    .where(eq(openToBuyBudgetCheck.openToBuyBudgetVersionId, versionId));
  return row;
}

/** The approved version of a budget in force at an instant, with its amount, or undefined (3.3). */
export async function inForceAt(
  context: TransactionContext,
  budgetId: string,
  at: Date,
): Promise<{ readonly versionId: string; readonly amount: Paise } | undefined> {
  const [row] = await context.tx
    .select({ id: openToBuyBudgetVersion.id, amount: openToBuyBudgetVersion.amountPaise })
    .from(openToBuyBudgetVersion)
    .where(
      and(
        eq(openToBuyBudgetVersion.openToBuyBudgetId, budgetId),
        eq(openToBuyBudgetVersion.decision, 'Approved'),
        sql`${openToBuyBudgetVersion.validDuring} @> ${at.toISOString()}::timestamptz`,
      ),
    );
  return row === undefined ? undefined : { versionId: row.id, amount: paise(row.amount) };
}

/**
 * The value approved bookings of a budget's brand and season reserve (3.3; POL-05.02). Reservations arrive with the
 * booking's approval (S2-F01-T03); until then nothing is reserved, which is a known zero, not Unknown.
 */
const NOTHING_RESERVED: Paise = paise(0);

/** The remaining open-to-buy of a budget at an instant: the approved amount less what is reserved (3.3). */
export async function remainingOf(
  context: TransactionContext,
  budget: BudgetRow,
  at: Date,
): Promise<OpenToBuyRemaining> {
  const approved = await inForceAt(context, budget.id, at);
  if (approved === undefined) return { kind: 'not-approved' };
  const reserved = NOTHING_RESERVED;
  return {
    kind: 'approved',
    versionId: approved.versionId,
    approved: approved.amount,
    reserved,
    remaining: paise(approved.amount - reserved),
  };
}

/** Every budget, oldest first, or those named. */
export async function budgetRows(context: TransactionContext, ids?: readonly string[]): Promise<BudgetRow[]> {
  const query = context.tx.select().from(openToBuyBudget);
  const filtered = ids === undefined ? query : query.where(inArray(openToBuyBudget.id, [...ids]));
  return filtered.orderBy(asc(openToBuyBudget.recordedAt), asc(openToBuyBudget.id));
}

function versionView(
  row: VersionRow,
  check: CheckRow | undefined,
  span: Span | undefined,
  request: LatestRequest | undefined,
): OpenToBuyBudgetVersion {
  const state = versionState({
    decision: row.decision,
    openEnded: span?.until === null,
    requestState: request?.state,
  });
  return {
    id: row.id,
    amount: paise(row.amountPaise),
    origin: row.origin,
    state,
    ...(state === 'Awaiting approval' ? { awaiting: check === undefined ? 'check' : 'approval' } : {}),
    preparedBy: row.preparedByUserId,
    preparedAt: row.recordedAt.toISOString(),
    ...(check === undefined
      ? {}
      : { check: { checkedBy: check.checkedByUserId, checkedAt: check.checkedAt.toISOString() } }),
    ...(span === undefined
      ? {}
      : {
          inForceFrom: span.from.toISOString(),
          ...(span.until === null ? {} : { inForceUntil: span.until.toISOString() }),
        }),
    ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
  };
}

/**
 * The budgets named as a reader sees them (section 11): each with its brand and season, named where the catalogue
 * has them in force today, the remaining amount at the read's instant, and every version, oldest first.
 */
export async function budgetViews(
  context: TransactionContext,
  dependencies: ReadDependencies,
  budgets: readonly BudgetRow[],
  today: string,
): Promise<OpenToBuyBudget[]> {
  if (budgets.length === 0) return [];
  const versions = await context.tx
    .select()
    .from(openToBuyBudgetVersion)
    .where(
      inArray(
        openToBuyBudgetVersion.openToBuyBudgetId,
        budgets.map((budget) => budget.id),
      ),
    )
    .orderBy(asc(openToBuyBudgetVersion.recordedAt), asc(openToBuyBudgetVersion.id));
  const versionIds = versions.map((version) => version.id);
  const checks =
    versionIds.length === 0
      ? []
      : await context.tx
          .select()
          .from(openToBuyBudgetCheck)
          .where(inArray(openToBuyBudgetCheck.openToBuyBudgetVersionId, versionIds));
  const spans = await spansOf(context, versionIds);
  const requests = await dependencies.access.approvalRequestsOf(context, versionIds);
  // Each brand and season is read once, however many budgets name it.
  const brands = new Map<string, CatalogueRecord<'brand'> | undefined>();
  const seasons = new Map<string, CatalogueRecord<'vocabulary_value'> | undefined>();
  const views: OpenToBuyBudget[] = [];
  for (const budget of budgets) {
    const own = versions.filter((version) => version.openToBuyBudgetId === budget.id);
    const newest = own.at(-1);
    if (newest === undefined) continue;
    if (!brands.has(budget.brandId)) {
      brands.set(budget.brandId, await dependencies.catalogue.record(context, 'brand', budget.brandId, today));
    }
    if (!seasons.has(budget.seasonValueId)) {
      seasons.set(
        budget.seasonValueId,
        await dependencies.catalogue.record(context, 'vocabulary_value', budget.seasonValueId, today),
      );
    }
    const brand = brands.get(budget.brandId);
    const season = seasons.get(budget.seasonValueId);
    const brandName = brand?.versions.find((version) => version.state === 'In force')?.name;
    const seasonName = season?.versions.find((version) => version.state === 'In force')?.name;
    views.push({
      id: budget.id,
      brand: {
        id: budget.brandId,
        code: brand?.code ?? budget.brandId,
        ...(brandName === undefined ? {} : { name: brandName }),
      },
      season: {
        attributeId: budget.seasonAttributeId,
        valueId: budget.seasonValueId,
        ...(season === undefined ? {} : { code: season.code }),
        ...(seasonName === undefined ? {} : { name: seasonName }),
      },
      versionToken: newest.id,
      remaining: await remainingOf(context, budget, context.startedAt),
      versions: own.map((version) =>
        versionView(
          version,
          checks.find((check) => check.openToBuyBudgetVersionId === version.id),
          spans.get(version.id),
          requests.get(version.id),
        ),
      ),
    });
  }
  return views;
}

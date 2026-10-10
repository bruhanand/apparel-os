import type { CatalogueKind, CatalogueRecords, VocabularyProposal } from '@apparel-os/schemas';
import { asc, desc, eq, gt, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { LatestRequest } from '../../../access/index.js';
import { businessUnitHeads } from '../../../organisation/index.js';
import {
  attribute,
  brandAlias,
  businessUnitBrandMember,
  categoryIdentityAttribute,
  pack,
  packContent,
  sizeSet,
  sizeSetMember,
  sku,
  style,
  styleAttributeValue,
  vocabularyProposal,
  vocabularyValue,
  type Decision,
} from '../db/schema.js';
import { catalogueTables } from '../db/tables.js';
import { versionState } from '../domain/kinds.js';
import { identitiesOf } from './sku.js';

// The catalogue's records with every version, a page at a time or one at a time (structure-and-masters 8;
// code-house-rules 12.1), and the vocabulary proposals (4.2; S1-F03-T01). Every version is shown, newest first, with
// the state it shows today; the screen shows the version in force on a chosen date from them.

export type CatalogueRecord<K extends CatalogueKind> = CatalogueRecords[K];
export interface CataloguePage<K extends CatalogueKind> {
  readonly records: CatalogueRecord<K>[];
  readonly next: string | null;
}
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
  readonly owner: string;
  readonly validDuring: string;
  readonly decision: Decision;
  readonly [column: string]: unknown;
}

/** `[start,end)` as PostgreSQL writes a daterange. */
function datesOf(range: string): { start: string; end?: string } {
  const match = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})?\)$/.exec(range);
  if (match?.[1] === undefined) throw new Error(`Unexpected range ${range}`);
  return match[2] === undefined ? { start: match[1] } : { start: match[1], end: match[2] };
}

/** The fields each kind's versions show, from the version row and the rows it holds. */
async function versionFields(
  context: TransactionContext,
  kind: CatalogueKind,
  rows: readonly VersionRow[],
): Promise<Map<string, Record<string, unknown>>> {
  const ids = rows.map((row) => row.id);
  const fields = new Map<string, Record<string, unknown>>();
  const listed = async <T>(load: () => Promise<T[]>, key: (row: T) => string, item: (row: T) => unknown) => {
    const found = ids.length === 0 ? [] : await load();
    const map = new Map<string, unknown[]>();
    for (const row of found) map.set(key(row), [...(map.get(key(row)) ?? []), item(row)]);
    return map;
  };
  switch (kind) {
    case 'brand': {
      const aliases = await listed(
        () =>
          context.tx
            .select()
            .from(brandAlias)
            .where(inArray(brandAlias.brandVersionId, ids))
            .orderBy(asc(brandAlias.alias)),
        (row) => row.brandVersionId,
        (row) => row.alias,
      );
      for (const row of rows) {
        fields.set(row.id, {
          name: row.name,
          ...(row.parentBrandId == null ? {} : { parentBrandId: row.parentBrandId }),
          aliases: aliases.get(row.id) ?? [],
          retired: row.retired,
        });
      }
      return fields;
    }
    case 'business_unit_brand': {
      const members = await listed(
        () =>
          context.tx
            .select()
            .from(businessUnitBrandMember)
            .where(inArray(businessUnitBrandMember.businessUnitBrandId, ids))
            .orderBy(asc(businessUnitBrandMember.brandId)),
        (row) => row.businessUnitBrandId,
        (row) => row.brandId,
      );
      for (const row of rows) fields.set(row.id, { brandIds: members.get(row.id) ?? [] });
      return fields;
    }
    case 'category': {
      const attributes = await listed(
        () =>
          context.tx
            .select()
            .from(categoryIdentityAttribute)
            .where(inArray(categoryIdentityAttribute.categoryVersionId, ids))
            .orderBy(asc(categoryIdentityAttribute.id)),
        (row) => row.categoryVersionId,
        (row) => row.attributeId,
      );
      for (const row of rows) {
        fields.set(row.id, {
          name: row.name,
          ...(row.parentCategoryId == null ? {} : { parentCategoryId: row.parentCategoryId }),
          ...(row.sizeSetId == null ? {} : { sizeSetId: row.sizeSetId }),
          identityAttributeIds: attributes.get(row.id) ?? [],
        });
      }
      return fields;
    }
    case 'size_set': {
      const sizes = await listed(
        () =>
          context.tx
            .select()
            .from(sizeSetMember)
            .where(inArray(sizeSetMember.sizeSetVersionId, ids))
            .orderBy(asc(sizeSetMember.position)),
        (row) => row.sizeSetVersionId,
        (row) => row.size,
      );
      for (const row of rows) fields.set(row.id, { name: row.name, sizes: sizes.get(row.id) ?? [] });
      return fields;
    }
    case 'attribute':
    case 'vocabulary_value':
      for (const row of rows) fields.set(row.id, { name: row.name });
      return fields;
    // S1-F03-T02: tracking profiles, a category's link, styles, SKUs and packs (4.1, 4.4 to 4.6). Unknown is absent.
    case 'tracking_profile':
      for (const row of rows) {
        fields.set(row.id, {
          name: row.name,
          pieceTracked: row.pieceTracked,
          batchExpiryRequired: row.batchExpiryRequired,
          requiredIdentifiers: row.requiredIdentifiers,
          ...(row.receivingShelfLifeDays == null ? {} : { receivingShelfLifeDays: row.receivingShelfLifeDays }),
          ...(row.sellingShelfLifeDays == null ? {} : { sellingShelfLifeDays: row.sellingShelfLifeDays }),
        });
      }
      return fields;
    case 'category_tracking_profile':
      for (const row of rows) fields.set(row.id, { trackingProfileId: row.trackingProfileId });
      return fields;
    case 'style': {
      const values = await listed(
        () =>
          context.tx
            .select()
            .from(styleAttributeValue)
            .where(inArray(styleAttributeValue.styleVersionId, ids))
            .orderBy(asc(styleAttributeValue.attributeId)),
        (row) => row.styleVersionId,
        (row) => ({
          attributeId: row.attributeId,
          ...(row.vocabularyValueId === null ? {} : { valueId: row.vocabularyValueId }),
          ...(row.textValue === null ? {} : { text: row.textValue }),
        }),
      );
      for (const row of rows) {
        fields.set(row.id, {
          ...(row.brandArticleNumber == null ? {} : { brandArticleNumber: row.brandArticleNumber }),
          ...(row.launchDate == null ? {} : { launchDate: row.launchDate }),
          ...(row.hsn == null ? {} : { hsn: row.hsn }),
          attributes: values.get(row.id) ?? [],
        });
      }
      return fields;
    }
    case 'sku':
      for (const row of rows) fields.set(row.id, { stockUnit: row.stockUnit, purpose: row.purpose });
      return fields;
    case 'pack': {
      const contents = await listed(
        () =>
          context.tx
            .select()
            .from(packContent)
            .where(inArray(packContent.packVersionId, ids))
            .orderBy(asc(packContent.skuId)),
        (row) => row.packVersionId,
        (row) => ({ skuId: row.skuId, quantity: row.quantity }),
      );
      for (const row of rows) {
        fields.set(row.id, {
          ...(row.units == null ? {} : { units: row.units }),
          mixed: row.mixed,
          forPurchasing: row.forPurchasing,
          forSelling: row.forSelling,
          contents: contents.get(row.id) ?? [],
        });
      }
      return fields;
    }
  }
}

/** The fixed fields of each record, by identifier, and its code. */
async function heads(
  context: TransactionContext,
  kind: CatalogueKind,
  ids: readonly string[],
): Promise<Map<string, Record<string, unknown> & { code: string }>> {
  if (ids.length === 0) return new Map();
  switch (kind) {
    case 'business_unit_brand': {
      // The coverage's record is the unit, named by its code and kind through `organisation` (3.3).
      const units = await businessUnitHeads(context, ids);
      return new Map(
        [...units.values()].map((unit) => [unit.id, { code: unit.code, businessUnitKind: unit.kind }] as const),
      );
    }
    case 'size_set': {
      const rows = await context.tx
        .select()
        .from(sizeSet)
        .where(inArray(sizeSet.id, [...ids]));
      return new Map(rows.map((row) => [row.id, { code: row.code, categoryId: row.categoryId }] as const));
    }
    case 'attribute': {
      const rows = await context.tx
        .select()
        .from(attribute)
        .where(inArray(attribute.id, [...ids]));
      return new Map(rows.map((row) => [row.id, { code: row.code, valueKind: row.valueKind }] as const));
    }
    case 'vocabulary_value': {
      const rows = await context.tx
        .select()
        .from(vocabularyValue)
        .where(inArray(vocabularyValue.id, [...ids]));
      return new Map(rows.map((row) => [row.id, { code: row.code, attributeId: row.attributeId }] as const));
    }
    case 'style': {
      const rows = await context.tx
        .select()
        .from(style)
        .where(inArray(style.id, [...ids]));
      return new Map(
        rows.map((row) => [row.id, { code: row.code, brandId: row.brandId, categoryId: row.categoryId }] as const),
      );
    }
    case 'sku': {
      const rows = await context.tx
        .select()
        .from(sku)
        .where(inArray(sku.id, [...ids]));
      const identities = await identitiesOf(context, ids);
      return new Map(
        rows.map(
          (row) =>
            [
              row.id,
              { code: row.code, styleId: row.styleId, size: row.size, identity: identities.get(row.id) ?? [] },
            ] as const,
        ),
      );
    }
    case 'pack': {
      const rows = await context.tx
        .select()
        .from(pack)
        .where(inArray(pack.id, [...ids]));
      return new Map(rows.map((row) => [row.id, { code: row.code, skuId: row.skuId }] as const));
    }
    // A category's link is named by the category's code (4.6).
    case 'brand':
    case 'category':
    case 'tracking_profile':
    case 'category_tracking_profile': {
      const tables = catalogueTables[kind];
      const rows = await context.tx
        .select({ id: sql<string>`${tables.identityId}`, code: sql<string>`code` })
        .from(tables.identity)
        .where(inArray(tables.identityId, [...ids]));
      return new Map(rows.map((row) => [row.id, { code: row.code }] as const));
    }
  }
}

/** The records named, in the order given, each with every version, newest first. */
async function recordsOf<K extends CatalogueKind>(
  context: TransactionContext,
  kind: K,
  ids: readonly string[],
  today: string,
  requests: RequestReader,
): Promise<CatalogueRecord<K>[]> {
  if (ids.length === 0) return [];
  const tables = catalogueTables[kind];
  const found = await heads(context, kind, ids);
  const rows = (
    await context.tx
      .select()
      .from(tables.version)
      .where(inArray(tables.owner, [...ids]))
      .orderBy(desc(sql`lower(${tables.validDuring})`), desc(tables.versionId))
  ).map((row) => {
    const each = row as Record<string, unknown>;
    return { ...each, owner: each[ownerField(kind)] } as VersionRow;
  });
  const fields = await versionFields(context, kind, rows);
  const latest = await requests(rows.filter((row) => row.decision === 'Awaiting approval').map((row) => row.id));
  return ids.flatMap((id) => {
    const head = found.get(id);
    if (head === undefined) return [];
    const own = rows.filter((row) => row.owner === id);
    const token = own
      .map((row) => row.id)
      .sort()
      .at(-1);
    return [
      {
        id,
        ...head,
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
            ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
            ...fields.get(row.id),
          };
        }),
      } as unknown as CatalogueRecord<K>,
    ];
  });
}

/** The version row's property naming its record. */
function ownerField(kind: CatalogueKind): string {
  switch (kind) {
    case 'brand':
      return 'brandId';
    case 'business_unit_brand':
      return 'businessUnitId';
    case 'category':
      return 'categoryId';
    case 'size_set':
      return 'sizeSetId';
    case 'attribute':
      return 'attributeId';
    case 'vocabulary_value':
      return 'vocabularyValueId';
    case 'tracking_profile':
      return 'trackingProfileId';
    case 'category_tracking_profile':
      return 'categoryId';
    case 'style':
      return 'styleId';
    case 'sku':
      return 'skuId';
    case 'pack':
      return 'packId';
  }
}

/**
 * A page of a kind's records (code-house-rules 12.1): in code order, then identifier, after the cursor's record; a
 * unit's coverage, whose code is `organisation`'s, in identifier order. **Design choice.**
 */
export async function cataloguePage<K extends CatalogueKind>(
  context: TransactionContext,
  kind: K,
  page: PageRequest,
  today: string,
  requests: RequestReader,
): Promise<CataloguePage<K>> {
  const limit = Math.min(page.limit ?? PAGE_CAP, PAGE_CAP);
  const tables = catalogueTables[kind];
  let ids: string[];
  if (kind === 'business_unit_brand') {
    const rows = await context.tx
      .select({ id: sql<string>`${tables.identityId}` })
      .from(tables.identity)
      .where(page.after === undefined ? undefined : gt(tables.identityId, page.after))
      .orderBy(asc(tables.identityId))
      .limit(limit + 1);
    ids = rows.map((row) => row.id);
  } else {
    const code = sql`code`;
    const after =
      page.after === undefined
        ? undefined
        : sql`(code, id) > (select code, id from ${tables.identity} where id = ${page.after}::uuid)`;
    const rows = await context.tx
      .select({ id: sql<string>`${tables.identityId}` })
      .from(tables.identity)
      .where(after)
      .orderBy(asc(code), asc(tables.identityId))
      .limit(limit + 1);
    ids = rows.map((row) => row.id);
  }
  const more = ids.length > limit;
  const shown = ids.slice(0, limit);
  return {
    records: await recordsOf(context, kind, shown, today, requests),
    next: more ? (shown.at(-1) ?? null) : null,
  };
}

/** One record with every version, or undefined when there is none. */
export async function catalogueRecord<K extends CatalogueKind>(
  context: TransactionContext,
  kind: K,
  recordId: string,
  today: string,
  requests: RequestReader,
): Promise<CatalogueRecord<K> | undefined> {
  const [record] = await recordsOf(context, kind, [recordId], today, requests);
  return record;
}

/** The approved values of an attribute in force on a date: an unconfirmed proposal is never one (4.2; PRD-IMP-008). */
export async function vocabularyOn(
  context: TransactionContext,
  attributeId: string,
  date: string,
): Promise<{ readonly id: string; readonly code: string; readonly name: string; readonly versionId: string }[]> {
  const result = await context.tx.execute<{ id: string; code: string; name: string; version_id: string }>(sql`
    select v.id::text as id, v.code, vv.name, vv.id::text as version_id
    from merchandise.vocabulary_value v
    join merchandise.vocabulary_value_version vv on vv.vocabulary_value_id = v.id
    where v.attribute_id = ${attributeId}::uuid and vv.decision = 'Approved' and vv.valid_during @> ${date}::date
    order by v.code, v.id`);
  return result.rows.map((row) => ({ id: row.id, code: row.code, name: row.name, versionId: row.version_id }));
}

function proposalView(
  row: typeof vocabularyProposal.$inferSelect,
  valueId: string | undefined,
  request: LatestRequest | undefined,
): VocabularyProposal {
  return {
    id: row.id,
    attributeId: row.attributeId,
    code: row.code,
    name: row.name,
    state: row.state,
    proposedByUserId: row.proposedByUserId,
    proposedAt: row.recordedAt.toISOString(),
    ...(row.decidedAt === null ? {} : { decidedAt: row.decidedAt.toISOString() }),
    ...(valueId === undefined ? {} : { valueId }),
    ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
  };
}

async function proposalViews(
  context: TransactionContext,
  rows: readonly (typeof vocabularyProposal.$inferSelect)[],
  requests: RequestReader,
): Promise<VocabularyProposal[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const values = await context.tx
    .select({ id: vocabularyValue.id, proposalId: vocabularyValue.proposalId })
    .from(vocabularyValue)
    .where(inArray(vocabularyValue.proposalId, ids));
  const valueOf = new Map(values.map((row) => [row.proposalId, row.id]));
  const latest = await requests(ids);
  return rows.map((row) => proposalView(row, valueOf.get(row.id), latest.get(row.id)));
}

/** A page of the vocabulary proposals, newest first (4.2). */
export async function proposalPage(
  context: TransactionContext,
  page: PageRequest,
  requests: RequestReader,
): Promise<{ readonly records: VocabularyProposal[]; readonly next: string | null }> {
  const limit = Math.min(page.limit ?? PAGE_CAP, PAGE_CAP);
  const rows = await context.tx
    .select()
    .from(vocabularyProposal)
    .where(page.after === undefined ? undefined : sql`${vocabularyProposal.id} < ${page.after}::uuid`)
    .orderBy(desc(vocabularyProposal.id))
    .limit(limit + 1);
  const shown = rows.slice(0, limit);
  return {
    records: await proposalViews(context, shown, requests),
    next: rows.length > limit ? (shown.at(-1)?.id ?? null) : null,
  };
}

/** One proposal, or undefined. */
export async function proposalRecord(
  context: TransactionContext,
  proposalId: string,
  requests: RequestReader,
): Promise<VocabularyProposal | undefined> {
  const rows = await context.tx.select().from(vocabularyProposal).where(eq(vocabularyProposal.id, proposalId));
  const [view] = await proposalViews(context, rows, requests);
  return view;
}

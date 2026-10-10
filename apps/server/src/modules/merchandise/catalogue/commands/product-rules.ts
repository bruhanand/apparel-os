import type { AttributeValue, MissingItem } from '@apparel-os/schemas';
import { and, asc, eq, isNull, sql, type AnyColumn } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import type { StockPresence } from '../contracts/stock-presence.js';
import {
  attribute,
  categoryIdentityAttribute,
  categoryTrackingProfile,
  categoryVersion,
  sizeSetMember,
  sizeSetVersion,
  sku,
  style,
  vocabularyValue,
  vocabularyValueVersion,
} from '../db/schema.js';
import { identityKey, identityOf, type IdentityValue, type StoredProposal } from '../domain/products.js';
import { exists, inForceOn, recordItem } from './common.js';

// The rules a style, a SKU and a product proposal keep (structure-and-masters 4.1, 4.2, 4.4, 4.6; PRD-MER-002,
// PRD-MER-004, PRD-MER-005, PRD-MER-013, POL-04.02, GC2-5, GC2-9; S1-F03-T02), and the questions the catalogue asks
// the stock ledger through the stock-presence contract (module-map section 3, rule 6).

const refusal = (code: string, missing: MissingItem[] = []): CommandRefusal => ({ kind: 'refused', code, missing });

const inForce = (column: AnyColumn, date: string) => sql`${column} @> ${date}::date`;

/** A category's size set and identity attributes in force on the date (4.1), or undefined with none in force. */
export async function categoryOn(
  context: TransactionContext,
  categoryId: string,
  date: string,
): Promise<{ readonly sizes: readonly string[] | undefined; readonly identityAttributeIds: string[] } | undefined> {
  const [version] = await context.tx
    .select({ id: categoryVersion.id, sizeSetId: categoryVersion.sizeSetId })
    .from(categoryVersion)
    .where(
      and(
        eq(categoryVersion.categoryId, categoryId),
        eq(categoryVersion.decision, 'Approved'),
        inForce(categoryVersion.validDuring, date),
      ),
    );
  if (version === undefined) return undefined;
  const attributes = await context.tx
    .select({ attributeId: categoryIdentityAttribute.attributeId })
    .from(categoryIdentityAttribute)
    .where(eq(categoryIdentityAttribute.categoryVersionId, version.id))
    .orderBy(asc(categoryIdentityAttribute.attributeId));
  let sizes: string[] | undefined;
  if (version.sizeSetId !== null) {
    const members = await context.tx
      .select({ size: sizeSetMember.size })
      .from(sizeSetMember)
      .innerJoin(sizeSetVersion, eq(sizeSetVersion.id, sizeSetMember.sizeSetVersionId))
      .where(
        and(
          eq(sizeSetVersion.sizeSetId, version.sizeSetId),
          eq(sizeSetVersion.decision, 'Approved'),
          inForce(sizeSetVersion.validDuring, date),
        ),
      )
      .orderBy(asc(sizeSetMember.position));
    sizes = members.map((row) => row.size);
  }
  return { sizes, identityAttributeIds: attributes.map((row) => row.attributeId) };
}

/**
 * The refusal of the first attribute value that breaks 4.2 on the date, or undefined: each attribute exists and is in
 * force; a list-type attribute takes only an approved value of its own in force, never a proposal (GC2-9; PRD-IMP-008),
 * and a text attribute only text. Where `identity` is given, only those attributes may be named.
 */
export async function attributeValuesRefusal(
  context: TransactionContext,
  values: readonly AttributeValue[],
  date: string,
  identity?: readonly string[],
): Promise<CommandRefusal | undefined> {
  for (const each of values) {
    const item = recordItem('attribute', each.attributeId);
    if (!(await exists(context, 'attribute', each.attributeId))) {
      return { kind: 'not-found', code: 'merchandise.record-not-found', missing: [item] };
    }
    if (identity !== undefined && !identity.includes(each.attributeId)) {
      return refusal('merchandise.not-an-identity-attribute', [item]);
    }
    if (!(await inForceOn(context, 'attribute', each.attributeId, date))) {
      return refusal('merchandise.reference-not-in-force', [item]);
    }
    const [kind] = await context.tx
      .select({ valueKind: attribute.valueKind })
      .from(attribute)
      .where(eq(attribute.id, each.attributeId));
    if (kind?.valueKind === 'text') {
      if (each.text === undefined) return refusal('merchandise.value-not-in-vocabulary', [item]);
      continue;
    }
    if (each.valueId === undefined) return refusal('merchandise.value-not-in-vocabulary', [item]);
    const approved = await context.tx
      .select({ id: vocabularyValue.id })
      .from(vocabularyValue)
      .innerJoin(vocabularyValueVersion, eq(vocabularyValueVersion.vocabularyValueId, vocabularyValue.id))
      .where(
        and(
          eq(vocabularyValue.id, each.valueId),
          eq(vocabularyValue.attributeId, each.attributeId),
          eq(vocabularyValueVersion.decision, 'Approved'),
          inForce(vocabularyValueVersion.validDuring, date),
        ),
      );
    if (approved.length === 0) {
      return refusal('merchandise.value-not-in-vocabulary', [
        item,
        { kind: 'record', recordType: 'merchandise.vocabulary_value', recordId: each.valueId },
      ]);
    }
  }
  return undefined;
}

/** A proposal's style facts once checked: its category, and each SKU's identity and its key as its rows keep them. */
export interface CheckedProposal {
  readonly categoryId: string;
  readonly identities: readonly { readonly values: readonly IdentityValue[]; readonly key: string }[];
}

/**
 * Whether a product proposal may be proposed, or confirmed, on the date (4.1, 4.2): a new style's code is free, its
 * brand and category in force, its attribute values from their vocabularies; an existing style exists; each SKU's
 * code is free, its size one of the category's size set in force or Unknown, its identity named only by the category's
 * identity attributes, from their vocabularies, and no SKU of the style, or of the proposal, has the same size and
 * identity, an Unknown counting as one value (PRD-MER-005).
 */
export async function proposalRefusal(
  context: TransactionContext,
  proposal: StoredProposal,
  date: string,
): Promise<{ readonly refusal: CommandRefusal } | { readonly checked: CheckedProposal }> {
  let categoryId: string;
  if (proposal.style !== undefined) {
    const proposed = proposal.style;
    const taken = await context.tx.select({ id: style.id }).from(style).where(eq(style.code, proposed.code));
    if (taken.length > 0) return { refusal: refusal('merchandise.code-taken') };
    for (const reference of [
      { kind: 'brand' as const, id: proposed.brandId },
      { kind: 'category' as const, id: proposed.categoryId },
    ]) {
      if (!(await exists(context, reference.kind, reference.id))) {
        return {
          refusal: {
            kind: 'not-found',
            code: 'merchandise.record-not-found',
            missing: [recordItem(reference.kind, reference.id)],
          },
        };
      }
      if (!(await inForceOn(context, reference.kind, reference.id, date))) {
        return { refusal: refusal('merchandise.reference-not-in-force', [recordItem(reference.kind, reference.id)]) };
      }
    }
    const values = await attributeValuesRefusal(context, proposed.attributes, date);
    if (values !== undefined) return { refusal: values };
    categoryId = proposed.categoryId;
  } else {
    const [row] = await context.tx
      .select({ categoryId: style.categoryId })
      .from(style)
      .where(eq(style.id, proposal.styleId ?? ''));
    if (row === undefined) {
      return {
        refusal: {
          kind: 'not-found',
          code: 'merchandise.record-not-found',
          missing: [recordItem('style', proposal.styleId ?? '')],
        },
      };
    }
    categoryId = row.categoryId;
  }
  const category = await categoryOn(context, categoryId, date);
  if (category === undefined) {
    return { refusal: refusal('merchandise.reference-not-in-force', [recordItem('category', categoryId)]) };
  }
  const identities: { values: IdentityValue[]; key: string }[] = [];
  const seen = new Set<string>();
  for (const proposed of proposal.skus) {
    const taken = await context.tx.select({ id: sku.id }).from(sku).where(eq(sku.code, proposed.code));
    if (taken.length > 0) return { refusal: refusal('merchandise.code-taken') };
    if (proposed.size !== undefined && !(category.sizes ?? []).includes(proposed.size)) {
      return { refusal: refusal('merchandise.size-not-in-size-set', [recordItem('category', categoryId)]) };
    }
    const values = await attributeValuesRefusal(context, proposed.identity, date, category.identityAttributeIds);
    if (values !== undefined) return { refusal: values };
    const identity = identityOf(category.identityAttributeIds, proposed.identity);
    const key = identityKey(identity);
    const seenKey = JSON.stringify([proposed.size ?? null, key]);
    if (seen.has(seenKey)) return { refusal: refusal('merchandise.sku-exists') };
    seen.add(seenKey);
    if (proposal.styleId !== undefined) {
      const [existing] = await context.tx
        .select({ id: sku.id })
        .from(sku)
        .where(
          and(
            eq(sku.styleId, proposal.styleId),
            proposed.size === undefined ? isNull(sku.size) : eq(sku.size, proposed.size),
            eq(sku.identityKey, key),
          ),
        );
      if (existing !== undefined) {
        return { refusal: refusal('merchandise.sku-exists', [recordItem('sku', existing.id)]) };
      }
    }
    identities.push({ values: identity, key });
  }
  return { checked: { categoryId, identities } };
}

/** The Sites holding stock of any of the SKUs, or the refusal while no implementation answers (4.4, 4.6). */
export async function sitesHoldingStock(
  context: TransactionContext,
  presence: StockPresence | undefined,
  skuIds: readonly string[],
): Promise<{ readonly sites: readonly string[] } | { readonly refusal: CommandRefusal }> {
  if (skuIds.length === 0) return { sites: [] };
  if (presence === undefined) {
    return { refusal: { kind: 'unavailable', code: 'merchandise.stock-presence-unanswered', missing: [] } };
  }
  return { sites: await presence.sitesHoldingStock(context, skuIds) };
}

/** The refusal naming each Site, or undefined with none. */
export function sitesRefusal(
  code: 'merchandise.stock-recorded' | 'merchandise.labelling-count-not-planned' | 'merchandise.pieces-held',
  sites: readonly string[],
): CommandRefusal | undefined {
  if (sites.length === 0) return undefined;
  return refusal(
    code,
    sites.map((siteId) => ({ kind: 'record', recordType: 'organisation.site', recordId: siteId })),
  );
}

/** The refusal while stock of any of the SKUs is recorded, naming each Site; or while no implementation answers. */
export async function stockRecordedRefusal(
  context: TransactionContext,
  presence: StockPresence | undefined,
  skuIds: readonly string[],
  code: 'merchandise.stock-recorded' | 'merchandise.labelling-count-not-planned',
): Promise<CommandRefusal | undefined> {
  const held = await sitesHoldingStock(context, presence, skuIds);
  return 'refusal' in held ? held.refusal : sitesRefusal(code, held.sites);
}

/**
 * The SKUs whose category is linked to the profile by an approved link on any day from `from` up to `to`, or with no
 * end (4.6): the goods a change of the profile over those days reaches. Only a SKU's own category counts (RR-475).
 */
export async function skusOfProfile(
  context: TransactionContext,
  profileId: string,
  from: string,
  to: string | null,
): Promise<string[]> {
  const rows = await context.tx
    .selectDistinct({ id: sku.id })
    .from(sku)
    .innerJoin(style, eq(style.id, sku.styleId))
    .innerJoin(categoryTrackingProfile, eq(categoryTrackingProfile.categoryId, style.categoryId))
    .where(
      and(
        eq(categoryTrackingProfile.trackingProfileId, profileId),
        eq(categoryTrackingProfile.decision, 'Approved'),
        sql`${categoryTrackingProfile.validDuring} && daterange(${from}::date, ${to}::date)`,
      ),
    )
    .orderBy(asc(sku.id));
  return rows.map((row) => row.id);
}

/** The SKUs of a category's own styles (4.6). */
export async function skusOfCategory(context: TransactionContext, categoryId: string): Promise<string[]> {
  const rows = await context.tx
    .select({ id: sku.id })
    .from(sku)
    .innerJoin(style, eq(style.id, sku.styleId))
    .where(eq(style.categoryId, categoryId))
    .orderBy(asc(sku.id));
  return rows.map((row) => row.id);
}

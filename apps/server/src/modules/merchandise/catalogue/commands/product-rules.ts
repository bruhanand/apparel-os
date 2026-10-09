import type { AttributeValue, MissingItem } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import type { StockPresence } from '../contracts/stock-presence.js';
import { identityOf, type StoredProposal } from '../domain/products.js';
import { exists, inForceOn, recordItem } from './common.js';

// The rules a style, a SKU and a product proposal keep (structure-and-masters 4.1, 4.2, 4.4, 4.6; PRD-MER-002,
// PRD-MER-004, PRD-MER-005, PRD-MER-013, POL-04.02, GC2-5, GC2-9; S1-F03-T02), and the questions the catalogue asks
// the stock ledger through the stock-presence contract (module-map section 3, rule 6).

const refusal = (code: string, missing: MissingItem[] = []): CommandRefusal => ({ kind: 'refused', code, missing });

/** A category's size set and identity attributes in force on the date (4.1), or undefined with none in force. */
export async function categoryOn(
  context: TransactionContext,
  categoryId: string,
  date: string,
): Promise<{ readonly sizes: readonly string[] | undefined; readonly identityAttributeIds: string[] } | undefined> {
  const versions = await context.tx.execute<{ id: string; size_set_id: string | null }>(sql`
    select id::text as id, size_set_id::text as size_set_id from merchandise.category_version
    where category_id = ${categoryId}::uuid and decision = 'Approved' and valid_during @> ${date}::date`);
  const version = versions.rows[0];
  if (version === undefined) return undefined;
  const attributes = await context.tx.execute<{ attribute_id: string }>(sql`
    select attribute_id::text as attribute_id from merchandise.category_identity_attribute
    where category_version_id = ${version.id}::uuid order by attribute_id`);
  let sizes: string[] | undefined;
  if (version.size_set_id !== null) {
    const members = await context.tx.execute<{ size: string }>(sql`
      select m.size from merchandise.size_set_member m
      join merchandise.size_set_version v on v.id = m.size_set_version_id
      where v.size_set_id = ${version.size_set_id}::uuid and v.decision = 'Approved' and v.valid_during @> ${date}::date
      order by m.position`);
    sizes = members.rows.map((row) => row.size);
  }
  return { sizes, identityAttributeIds: attributes.rows.map((row) => row.attribute_id) };
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
    const attribute = recordItem('attribute', each.attributeId);
    if (!(await exists(context, 'attribute', each.attributeId))) {
      return { kind: 'not-found', code: 'merchandise.record-not-found', missing: [attribute] };
    }
    if (identity !== undefined && !identity.includes(each.attributeId)) {
      return refusal('merchandise.not-an-identity-attribute', [attribute]);
    }
    if (!(await inForceOn(context, 'attribute', each.attributeId, date))) {
      return refusal('merchandise.reference-not-in-force', [attribute]);
    }
    const kind = await context.tx.execute<{ value_kind: string }>(
      sql`select value_kind from merchandise.attribute where id = ${each.attributeId}::uuid`,
    );
    if (kind.rows[0]?.value_kind === 'text') {
      if (each.text === undefined) return refusal('merchandise.value-not-in-vocabulary', [attribute]);
      continue;
    }
    if (each.valueId === undefined) return refusal('merchandise.value-not-in-vocabulary', [attribute]);
    const approved = await context.tx.execute(sql`
      select 1 from merchandise.vocabulary_value v
      join merchandise.vocabulary_value_version vv on vv.vocabulary_value_id = v.id
      where v.id = ${each.valueId}::uuid and v.attribute_id = ${each.attributeId}::uuid
        and vv.decision = 'Approved' and vv.valid_during @> ${date}::date`);
    if (approved.rows.length === 0) {
      return refusal('merchandise.value-not-in-vocabulary', [
        attribute,
        { kind: 'record', recordType: 'merchandise.vocabulary_value', recordId: each.valueId },
      ]);
    }
  }
  return undefined;
}

/** A proposal's style facts once checked: its brand and category, and each SKU's identity as its row keeps it. */
export interface CheckedProposal {
  readonly categoryId: string;
  readonly identities: readonly Record<string, string | null>[];
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
    const style = proposal.style;
    const taken = await context.tx.execute(sql`select 1 from merchandise.style where code = ${style.code}`);
    if (taken.rows.length > 0) return { refusal: refusal('merchandise.code-taken') };
    for (const reference of [
      { kind: 'brand' as const, id: style.brandId },
      { kind: 'category' as const, id: style.categoryId },
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
    const values = await attributeValuesRefusal(context, style.attributes, date);
    if (values !== undefined) return { refusal: values };
    categoryId = style.categoryId;
  } else {
    const found = await context.tx.execute<{ category_id: string }>(
      sql`select category_id::text as category_id from merchandise.style where id = ${proposal.styleId ?? null}::uuid`,
    );
    const row = found.rows[0];
    if (row === undefined) {
      return {
        refusal: {
          kind: 'not-found',
          code: 'merchandise.record-not-found',
          missing: [recordItem('style', proposal.styleId ?? '')],
        },
      };
    }
    categoryId = row.category_id;
  }
  const category = await categoryOn(context, categoryId, date);
  if (category === undefined) {
    return { refusal: refusal('merchandise.reference-not-in-force', [recordItem('category', categoryId)]) };
  }
  const identities: Record<string, string | null>[] = [];
  const seen = new Set<string>();
  for (const proposed of proposal.skus) {
    const taken = await context.tx.execute(sql`select 1 from merchandise.sku where code = ${proposed.code}`);
    if (taken.rows.length > 0) return { refusal: refusal('merchandise.code-taken') };
    if (proposed.size !== undefined && !(category.sizes ?? []).includes(proposed.size)) {
      return { refusal: refusal('merchandise.size-not-in-size-set', [recordItem('category', categoryId)]) };
    }
    const values = await attributeValuesRefusal(context, proposed.identity, date, category.identityAttributeIds);
    if (values !== undefined) return { refusal: values };
    const identity = identityOf(category.identityAttributeIds, proposed.identity);
    // JSON with sorted keys, so two equal identities give one key.
    const key = JSON.stringify([
      proposed.size ?? null,
      Object.entries(identity).sort(([a], [b]) => a.localeCompare(b)),
    ]);
    if (seen.has(key)) return { refusal: refusal('merchandise.sku-exists') };
    seen.add(key);
    if (proposal.styleId !== undefined) {
      const same = await context.tx.execute<{ id: string }>(sql`
        select id::text as id from merchandise.sku
        where style_id = ${proposal.styleId}::uuid and size is not distinct from ${proposed.size ?? null}
          and identity = ${JSON.stringify(identity)}::jsonb`);
      const existing = same.rows[0];
      if (existing !== undefined)
        return { refusal: refusal('merchandise.sku-exists', [recordItem('sku', existing.id)]) };
    }
    identities.push(identity);
  }
  return { checked: { categoryId, identities } };
}

/** The refusal while stock of any of the SKUs is recorded, naming each Site; or while no implementation answers. */
export async function stockRecordedRefusal(
  context: TransactionContext,
  presence: StockPresence | undefined,
  skuIds: readonly string[],
  code: 'merchandise.stock-recorded' | 'merchandise.labelling-count-not-planned',
): Promise<CommandRefusal | undefined> {
  if (skuIds.length === 0) return undefined;
  if (presence === undefined) {
    return { kind: 'unavailable', code: 'merchandise.stock-presence-unanswered', missing: [] };
  }
  const sites = await presence.sitesHoldingStock(context, skuIds);
  if (sites.length === 0) return undefined;
  return refusal(
    code,
    sites.map((siteId) => ({ kind: 'record', recordType: 'organisation.site', recordId: siteId })),
  );
}

/**
 * The SKUs whose category is linked to the profile by an approved link in force on the date or later (4.6): the goods
 * a change of the profile from that date reaches.
 */
export async function skusOfProfile(context: TransactionContext, profileId: string, from: string): Promise<string[]> {
  const result = await context.tx.execute<{ id: string }>(sql`
    select distinct k.id::text as id from merchandise.sku k
    join merchandise.style s on s.id = k.style_id
    join merchandise.category_tracking_profile l on l.category_id = s.category_id
    where l.tracking_profile_id = ${profileId}::uuid and l.decision = 'Approved'
      and l.valid_during && daterange(${from}::date, null)
    order by 1`);
  return result.rows.map((row) => row.id);
}

import { uuidv7 } from '@apparel-os/domain';
import type { AttributeMark } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type TransactionContext } from '../../src/kernel/index.js';
import type { AuditActor, AuditInterface } from '../../src/modules/audit/index.js';
import type { ConfigurationInterface } from '../../src/modules/configuration/index.js';
import type { CatalogueInterface } from '../../src/modules/merchandise/catalogue/index.js';
import type { Preparer } from '../../src/modules/organisation/index.js';
import { syntheticCode, syntheticName } from './synthetic.js';

// The SYNTHETIC marked attributes of the local seed (structure-and-masters 4.2 "As built"; goods-in GI-2, GI-3, 5.2;
// DEC-144, RR-562, RR-582): no screen marks one on `dev` without a person to prepare it and another to approve it, so
// the seed gives each of its Organisations a list attribute labelled SYNTHETIC for each mark and marks it, once, where
// nothing is marked in force: the season and the size list (DEC-144), and the PT template's colour, gender, type, item,
// fit and GST rate lists (code review 6 of stage 2, as DEC-144 does). The attribute is recorded through the catalogue's
// real command by a person (it takes effect when recorded; RR-467). The marking is a labelled SYNTHETIC setting, written
// as the setup step writes its settings (DEC-118) and as the server of the browser journeys writes its season marking:
// no approval is asked, since the seed holds no person's authenticator to decide one with (access-and-approvals 3.3),
// and none is recorded. An audit record names the command's actor, so the two are separate commands. The marked
// attribute then gets a few SYNTHETIC values the same way (product owner, 22 Oct 2026, DEC-144), so a budget's season, a
// count line's size and a PT file's values can be named on `dev` without first giving anyone the catalogue's rights.
// The item marking also gets the master sheet's item map (goods-in 5.2, 5.3; RR-583): each SYNTHETIC item a SYNTHETIC
// sub category, a category recorded by the first Admin, and a SYNTHETIC type. Never a KDPS value, never a default.

/** The marks the seed marks (DEC-144): every mark, the season and the size list and the PT template's lists. */
export type SeededMark = AttributeMark;

/** The marks in the order the seed marks them. */
export const SEEDED_MARKS: readonly SeededMark[] = [
  'season',
  'size',
  'colour',
  'gender',
  'type',
  'item',
  'fit',
  'gst-rate',
];

interface SyntheticLabel {
  readonly code: string;
  readonly name: string;
}

/** A SYNTHETIC list labelled `label`, its attribute's code and name, with `count` values numbered from 1. */
function syntheticList(label: string, name: string, count: number) {
  return {
    code: syntheticCode(label),
    name: syntheticName(name),
    values: Array.from({ length: count }, (_, at) => ({
      code: syntheticCode(`${label}-${String(at + 1)}`),
      name: syntheticName(`${name} ${String(at + 1)}`),
    })),
  };
}

/**
 * The SYNTHETIC list attribute the seed marks as each mark, by its code and name, and the SYNTHETIC values it gives it
 * (DEC-144): a few, enough for a budget's season, a count line's size and a PT file's values on `dev`. None is a
 * default.
 */
export const SYNTHETIC_MARKED_ATTRIBUTES: Readonly<
  Record<SeededMark, SyntheticLabel & { readonly values: readonly SyntheticLabel[] }>
> = {
  season: syntheticList('SEASON', 'Season', 2),
  size: syntheticList('SIZE', 'Size', 3),
  colour: syntheticList('COLOUR', 'Colour', 2),
  gender: syntheticList('GENDER', 'Gender', 2),
  type: syntheticList('TYPE', 'Type', 2),
  item: syntheticList('ITEM', 'Item', 2),
  fit: syntheticList('FIT', 'Fit', 2),
  'gst-rate': syntheticList('GST-RATE', 'GST rate', 2),
};

/** The SYNTHETIC category the seed records as the sub category of its SYNTHETIC items (goods-in 5.2; RR-583). */
export const SYNTHETIC_SUB_CATEGORY: SyntheticLabel = {
  code: syntheticCode('SUB-CATEGORY'),
  name: syntheticName('Sub category'),
};

/** Whether an attribute is marked in force as the mark (structure-and-masters 4.2 "As built"). Reads only. */
async function markedInForce(context: TransactionContext, mark: AttributeMark): Promise<boolean> {
  const found = await context.tx.execute(sql`
    select 1 from merchandise.marked_attribute m
      join merchandise.marked_attribute_version v on v.marked_attribute_id = m.id
     where m.mark = ${mark} and v.decision = 'Approved' and pg_catalog.upper_inf(v.valid_during)`);
  return found.rows.length > 0;
}

/**
 * The SYNTHETIC list attribute to mark as the mark, or undefined while an attribute is marked in force: the one recorded
 * under its code, which must be list-type and in force today, or a new one recorded now through the catalogue's
 * command by the preparer, in force from today. Run as the preparer, whom the attribute's audit record names.
 */
export async function syntheticAttributeToMark(
  context: TransactionContext,
  catalogue: Pick<CatalogueInterface, 'prepareAttribute'>,
  preparer: Preparer,
  mark: SeededMark,
): Promise<string | undefined> {
  if (await markedInForce(context, mark)) return undefined;
  const { code, name } = SYNTHETIC_MARKED_ATTRIBUTES[mark];
  const today = await context.businessDate();
  if (today.kind === 'not-set') throw new Error(`${context.organisationCode} has no timezone in force`);
  const found = await context.tx.execute<{ id: string; listInForce: boolean }>(sql`
    select a.id::text as id,
           a.value_kind = 'list' and exists (
             select 1 from merchandise.attribute_version v
              where v.attribute_id = a.id and v.decision = 'Approved' and v.valid_during @> ${today.date}::date
           ) as "listInForce"
      from merchandise.attribute a where a.code = ${code}`);
  const existing = found.rows[0];
  if (existing !== undefined) {
    if (!existing.listInForce) throw new Error(`The attribute ${code} is not a list attribute in force today`);
    return existing.id;
  }
  const recorded = await catalogue.prepareAttribute(context, preparer, {
    code,
    valueKind: 'list',
    name,
    validFrom: today.date,
  });
  if (recorded.kind !== 'success') throw new Error(`The attribute ${code} was refused: ${recorded.refusal.code}`);
  return recorded.answer.recordId;
}

export interface MarkingDependencies {
  readonly audit: Pick<AuditInterface, 'record'>;
  readonly origins: Pick<ConfigurationInterface, 'originRefusal'>;
}

export interface MarkingInput {
  readonly mark: AttributeMark;
  /** The SYNTHETIC list attribute to mark (syntheticAttributeToMark). */
  readonly attributeId: string;
  /** The marking's preparer, a person (structure-and-masters 4.2): the one who recorded its attribute. */
  readonly preparedBy: string;
  /** Who writes the marking, named in its audit record: the command's actor, the seed's `setup` identity. */
  readonly writer: AuditActor;
}

/**
 * Marks the attribute as the mark from the command's start, unless an attribute is marked in force by then: the
 * marking's row locked first, exclusively at step 1, as a preparation and a decision lock it (code-house-rules 8.2), or
 * written now, which creates it locked. Its origin is SYNTHETIC, which the environment must accept (12.14). Answers
 * whether it marked one.
 */
export async function markSyntheticAttribute(
  context: TransactionContext,
  dependencies: MarkingDependencies,
  input: MarkingInput,
): Promise<'marked' | 'unchanged'> {
  const origin = dependencies.origins.originRefusal(context, 'synthetic');
  if (origin !== undefined) throw new Error(`A SYNTHETIC ${input.mark} marking is refused here: ${origin.code}`);
  const markedAttributeId = await lockedMarking(context, input.mark);
  if (await markedInForce(context, input.mark)) return 'unchanged';
  const versionId = uuidv7();
  await context.tx.execute(sql`
    insert into merchandise.marked_attribute_version
      (id, marked_attribute_id, attribute_id, origin, decision, valid_during, prepared_by_user_id)
    values (${versionId}, ${markedAttributeId}, ${input.attributeId}, 'synthetic', 'Approved',
            pg_catalog.tstzrange(${context.startedAt.toISOString()}::timestamptz, null, '[)'), ${input.preparedBy})`);
  await dependencies.audit.record(context, {
    actor: input.writer,
    record: { module: 'merchandise', type: 'marked_attribute', id: markedAttributeId, versionId },
    operation: 'seed-marked-attribute-version',
    changes: [
      { kind: 'value', field: 'mark', before: null, after: input.mark },
      { kind: 'value', field: 'attributeId', before: null, after: input.attributeId },
      { kind: 'value', field: 'origin', before: null, after: 'synthetic' },
      { kind: 'value', field: 'preparedBy', before: null, after: input.preparedBy },
    ],
    source: { kind: 'operator-command' },
  });
  return 'marked';
}

export interface ValuesInput {
  readonly mark: SeededMark;
  /** The values' proposer, a person (structure-and-masters 4.2): the one who recorded their attribute. */
  readonly proposedBy: string;
  /**
   * Who writes the values, named in their audit records and as their proposals' decider: the command's actor, the
   * seed's `setup` identity, since no person confirmed them.
   */
  readonly writer: AuditActor & { readonly kind: 'service-identity' };
}

/**
 * Gives the SYNTHETIC attribute marked in force as the mark its SYNTHETIC values that are missing (DEC-144), each in
 * force from today, as a confirmed proposal makes one (structure-and-masters 4.2): a proposal written Confirmed, the
 * first Admin its proposer and the `setup` identity its decider, since neither first user holds the right or an
 * authenticator to confirm it, with no approval request; the value under its code; its name's version; and an audit
 * record. Nothing is added while another attribute is marked, or the SYNTHETIC one is not a list in force today, or to
 * a code already a value or an open proposal of it. Answers the codes added.
 */
export async function addSyntheticValues(
  context: TransactionContext,
  dependencies: MarkingDependencies,
  input: ValuesInput,
): Promise<string[]> {
  const origin = dependencies.origins.originRefusal(context, 'synthetic');
  if (origin !== undefined) throw new Error(`SYNTHETIC ${input.mark} values are refused here: ${origin.code}`);
  const synthetic = SYNTHETIC_MARKED_ATTRIBUTES[input.mark];
  const today = await context.businessDate();
  if (today.kind === 'not-set') throw new Error(`${context.organisationCode} has no timezone in force`);
  const marked = await context.tx.execute<{ id: string }>(sql`
    select a.id::text as id
      from merchandise.marked_attribute m
      join merchandise.marked_attribute_version mv on mv.marked_attribute_id = m.id
      join merchandise.attribute a on a.id = mv.attribute_id
     where m.mark = ${input.mark} and mv.decision = 'Approved' and pg_catalog.upper_inf(mv.valid_during)
       and a.code = ${synthetic.code} and a.value_kind = 'list'
       and exists (select 1 from merchandise.attribute_version v
                    where v.attribute_id = a.id and v.decision = 'Approved' and v.valid_during @> ${today.date}::date)`);
  const attributeId = marked.rows[0]?.id;
  if (attributeId === undefined) return [];
  const added: string[] = [];
  for (const value of synthetic.values) {
    const taken = await context.tx.execute(sql`
      select 1 from merchandise.vocabulary_value where attribute_id = ${attributeId} and code = ${value.code}
      union all
      select 1 from merchandise.vocabulary_proposal
       where attribute_id = ${attributeId} and code = ${value.code} and state = 'Proposed'`);
    if (taken.rows.length > 0) continue;
    const proposalId = uuidv7();
    const valueId = uuidv7();
    const versionId = uuidv7();
    await context.tx.execute(sql`
      insert into merchandise.vocabulary_proposal
        (id, attribute_id, code, name, proposed_by_user_id, state, decided_by_user_id, decided_at)
      values (${proposalId}, ${attributeId}, ${value.code}, ${value.name}, ${input.proposedBy}, 'Confirmed',
              ${input.writer.id}, ${context.startedAt.toISOString()}::timestamptz)`);
    await context.tx.execute(sql`
      insert into merchandise.vocabulary_value (id, attribute_id, code, proposal_id)
      values (${valueId}, ${attributeId}, ${value.code}, ${proposalId})`);
    await context.tx.execute(sql`
      insert into merchandise.vocabulary_value_version (id, vocabulary_value_id, name, valid_during, decision, prepared_by_user_id)
      values (${versionId}, ${valueId}, ${value.name}, pg_catalog.daterange(${today.date}::date, null, '[)'), 'Approved',
              ${input.proposedBy})`);
    await dependencies.audit.record(context, {
      actor: input.writer,
      record: { module: 'merchandise', type: 'vocabulary_value', id: valueId, versionId },
      operation: 'seed-vocabulary-value',
      changes: [
        { kind: 'value', field: 'attributeId', before: null, after: attributeId },
        { kind: 'value', field: 'code', before: null, after: value.code },
        { kind: 'value', field: 'name', before: null, after: value.name },
        { kind: 'value', field: 'proposalId', before: null, after: proposalId },
        { kind: 'value', field: 'proposedBy', before: null, after: input.proposedBy },
      ],
      source: { kind: 'operator-command' },
    });
    added.push(value.code);
  }
  return added;
}

/**
 * The SYNTHETIC category the seed's items are mapped to (goods-in 5.2; RR-583), or undefined while the item marked in
 * force is not the seed's SYNTHETIC item list, whose map the seed does not write: the one recorded under its code, which
 * must be in force today, or a new one recorded now through the catalogue's command by the preparer, in force from
 * today (structure-and-masters 4.1 "As built"). Run as the preparer, whom its audit record names.
 */
export async function syntheticSubCategory(
  context: TransactionContext,
  catalogue: Pick<CatalogueInterface, 'prepareCategory'>,
  preparer: Preparer,
): Promise<string | undefined> {
  const { code, name } = SYNTHETIC_SUB_CATEGORY;
  const today = await context.businessDate();
  if (today.kind === 'not-set') throw new Error(`${context.organisationCode} has no timezone in force`);
  const seededItems = await context.tx.execute(sql`
    select 1 from merchandise.marked_attribute m
      join merchandise.marked_attribute_version mv on mv.marked_attribute_id = m.id
      join merchandise.attribute a on a.id = mv.attribute_id
     where m.mark = 'item' and mv.decision = 'Approved' and pg_catalog.upper_inf(mv.valid_during)
       and a.code = ${SYNTHETIC_MARKED_ATTRIBUTES.item.code}`);
  if (seededItems.rows.length === 0) return undefined;
  const found = await context.tx.execute<{ id: string; inForce: boolean }>(sql`
    select c.id::text as id,
           exists (
             select 1 from merchandise.category_version v
              where v.category_id = c.id and v.decision = 'Approved' and v.valid_during @> ${today.date}::date
           ) as "inForce"
      from merchandise.category c where c.code = ${code}`);
  const existing = found.rows[0];
  if (existing !== undefined) {
    if (!existing.inForce) throw new Error(`The category ${code} is not in force today`);
    return existing.id;
  }
  const recorded = await catalogue.prepareCategory(context, preparer, {
    code,
    name,
    identityAttributeIds: [],
    validFrom: today.date,
  });
  if (recorded.kind !== 'success') throw new Error(`The category ${code} was refused: ${recorded.refusal.code}`);
  return recorded.answer.recordId;
}

export interface ItemMapInput {
  /** The SYNTHETIC category the items are mapped to (syntheticSubCategory). */
  readonly categoryId: string;
  /** Who writes the map, named in its audit records: the command's actor, the seed's `setup` identity. */
  readonly writer: AuditActor;
}

/**
 * Gives the item marking in force its SYNTHETIC item map where it lacks an entry (goods-in 5.2, 5.3; RR-583): each
 * SYNTHETIC item the SYNTHETIC sub category and the SYNTHETIC type of the same number, written with the marking's
 * version in force, as a labelled SYNTHETIC setting is, with an audit record. Nothing is written while the item or the
 * type marked in force is not the seed's SYNTHETIC attribute. Answers the item codes mapped.
 */
export async function addSyntheticItemMap(
  context: TransactionContext,
  dependencies: MarkingDependencies,
  input: ItemMapInput,
): Promise<string[]> {
  const origin = dependencies.origins.originRefusal(context, 'synthetic');
  if (origin !== undefined) throw new Error(`A SYNTHETIC item map is refused here: ${origin.code}`);
  const marking = async (mark: AttributeMark) => {
    const found = await context.tx.execute<{ markedAttributeId: string; versionId: string; attributeId: string }>(sql`
      select m.id::text as "markedAttributeId", mv.id::text as "versionId", a.id::text as "attributeId"
        from merchandise.marked_attribute m
        join merchandise.marked_attribute_version mv on mv.marked_attribute_id = m.id
        join merchandise.attribute a on a.id = mv.attribute_id
       where m.mark = ${mark} and mv.decision = 'Approved' and pg_catalog.upper_inf(mv.valid_during)
         and a.code = ${SYNTHETIC_MARKED_ATTRIBUTES[mark].code}`);
    return found.rows[0];
  };
  const item = await marking('item');
  const type = await marking('type');
  if (item === undefined || type === undefined) return [];
  const valueOf = async (attributeId: string, code: string) => {
    const found = await context.tx.execute<{ id: string }>(sql`
      select id::text as id from merchandise.vocabulary_value where attribute_id = ${attributeId} and code = ${code}`);
    return found.rows[0]?.id;
  };
  const mapped: string[] = [];
  for (const [at, each] of SYNTHETIC_MARKED_ATTRIBUTES.item.values.entries()) {
    const itemValueId = await valueOf(item.attributeId, each.code);
    const typeCode = SYNTHETIC_MARKED_ATTRIBUTES.type.values[at]?.code;
    const typeValueId = typeCode === undefined ? undefined : await valueOf(type.attributeId, typeCode);
    if (itemValueId === undefined || typeValueId === undefined) continue;
    const held = await context.tx.execute(sql`
      select 1 from merchandise.item_map_entry
       where marked_attribute_version_id = ${item.versionId} and item_value_id = ${itemValueId}`);
    if (held.rows.length > 0) continue;
    const entryId = uuidv7();
    await context.tx.execute(sql`
      insert into merchandise.item_map_entry (id, marked_attribute_version_id, item_value_id, category_id, type_value_id)
      values (${entryId}, ${item.versionId}, ${itemValueId}, ${input.categoryId}, ${typeValueId})`);
    await dependencies.audit.record(context, {
      actor: input.writer,
      record: {
        module: 'merchandise',
        type: 'marked_attribute',
        id: item.markedAttributeId,
        versionId: item.versionId,
      },
      operation: 'seed-item-map-entry',
      changes: [
        { kind: 'value', field: 'itemValueId', before: null, after: itemValueId },
        { kind: 'value', field: 'categoryId', before: null, after: input.categoryId },
        { kind: 'value', field: 'typeValueId', before: null, after: typeValueId },
      ],
      source: { kind: 'operator-command' },
    });
    mapped.push(each.code);
  }
  return mapped;
}

/** The marking's row, locked exclusively; written when missing, which creates it locked. */
async function lockedMarking(context: TransactionContext, mark: AttributeMark): Promise<string> {
  const found = await context.tx.execute<{ id: string }>(
    sql`select id::text as id from merchandise.marked_attribute where mark = ${mark}`,
  );
  const existing = found.rows[0]?.id;
  if (existing !== undefined) {
    await context.lock(LOCK_STEP.document, [
      { table: lockTable('merchandise', 'marked_attribute'), id: existing, mode: 'exclusive' },
    ]);
    return existing;
  }
  const written = await context.tx.execute<{ id: string }>(sql`
    insert into merchandise.marked_attribute (id, mark) values (${uuidv7()}, ${mark})
    on conflict (mark) do nothing returning id::text as id`);
  const id = written.rows[0]?.id;
  if (id === undefined) throw new Error(`The ${mark} marking was written meanwhile; run the seed again`);
  return id;
}

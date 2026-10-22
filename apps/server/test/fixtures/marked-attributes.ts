import { uuidv7 } from '@apparel-os/domain';
import type { AttributeMark } from '@apparel-os/schemas';
import { sql } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type TransactionContext } from '../../src/kernel/index.js';
import type { AuditActor, AuditInterface } from '../../src/modules/audit/index.js';
import type { ConfigurationInterface } from '../../src/modules/configuration/index.js';
import type { CatalogueInterface } from '../../src/modules/merchandise/catalogue/index.js';
import type { Preparer } from '../../src/modules/organisation/index.js';
import { syntheticCode, syntheticName } from './synthetic.js';

// The SYNTHETIC season attribute and size attribute of the local seed (structure-and-masters 4.2 "As built"; goods-in
// GI-2, GI-3; DEC-144, RR-562): no screen marks one on `dev` without a person to prepare it and another to approve it,
// so the seed gives each of its Organisations a list attribute labelled SYNTHETIC and marks it, once, where nothing is
// marked in force. The attribute is recorded through the catalogue's real command by a person (it takes effect when
// recorded; RR-467). The marking is a labelled SYNTHETIC setting, written as the setup step writes its settings
// (DEC-118) and as the server of the browser journeys writes its season marking: no approval is asked, since the seed
// holds no person's authenticator to decide one with (access-and-approvals 3.3), and none is recorded. An audit record
// names the command's actor, so the two are separate commands. Never a KDPS value.

/** The SYNTHETIC list attribute the seed marks as each mark, by its code and name. */
export const SYNTHETIC_MARKED_ATTRIBUTES: Readonly<Record<AttributeMark, { code: string; name: string }>> = {
  season: { code: syntheticCode('SEASON'), name: syntheticName('Season') },
  size: { code: syntheticCode('SIZE'), name: syntheticName('Size') },
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
  mark: AttributeMark,
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

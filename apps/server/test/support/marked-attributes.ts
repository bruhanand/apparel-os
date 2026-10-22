import { uuidv7 } from '@apparel-os/domain';
import type { AttributeMark } from '@apparel-os/schemas';
import { connect } from './postgres.js';

/**
 * Marks a list attribute as the Organisation's season or size list, SYNTHETIC, Approved and in force from a day before
 * now, as writeSyntheticSetting writes a setting of access (structure-and-masters 4.2 "As built"; code-house-rules 11.1,
 * 12.14), so a test's world has it whichever clock its commands run on: a marking approved through Decide is in force
 * from its decision's instant, which a fixture's own clock may put after the server's. Preparing a marking and its
 * approval by a different person are proved through the catalogue's routes (season-and-size-attributes.int.test.ts).
 * Refuses a mark already in force, so it never replaces one. Answers the version written.
 */
export async function writeSyntheticMarking(
  database: string,
  mark: AttributeMark,
  attributeId: string,
  preparedBy: string,
): Promise<string> {
  const owner = await connect(database, 'migration');
  try {
    await owner.query('insert into merchandise.marked_attribute (id, mark) values ($1, $2) on conflict do nothing', [
      uuidv7(),
      mark,
    ]);
    const marking = await owner.query<{ id: string }>('select id from merchandise.marked_attribute where mark = $1', [
      mark,
    ]);
    const markedAttributeId = marking.rows[0]?.id;
    if (markedAttributeId === undefined) throw new Error(`The ${mark} marking was not written`);
    const inForce = await owner.query(
      `select 1 from merchandise.marked_attribute_version
       where marked_attribute_id = $1 and decision = 'Approved' and upper_inf(valid_during)`,
      [markedAttributeId],
    );
    if (inForce.rowCount !== 0) throw new Error(`An attribute is marked as the ${mark} already`);
    const versionId = uuidv7();
    await owner.query(
      `insert into merchandise.marked_attribute_version
         (id, marked_attribute_id, attribute_id, origin, decision, valid_during, prepared_by_user_id)
       values ($1, $2, $3, 'synthetic', 'Approved', tstzrange($4::timestamptz, null), $5)`,
      [versionId, markedAttributeId, attributeId, new Date(Date.now() - 86_400_000).toISOString(), preparedBy],
    );
    return versionId;
  } finally {
    await owner.end();
  }
}

/**
 * Marks the attribute again from an instant, SYNTHETIC and Approved, ending the version in force there, as an approval
 * of a later version does (structure-and-masters 4.2 "As built"; code-house-rules 7.3), as a fixture: a test changes
 * what is marked, or the item map with it, between two of its commands. Answers the version written.
 */
export async function writeSyntheticMarkingFrom(
  database: string,
  mark: AttributeMark,
  attributeId: string,
  preparedBy: string,
  from: Date,
): Promise<string> {
  const owner = await connect(database, 'migration');
  try {
    await owner.query('begin');
    const ended = await owner.query(
      `update merchandise.marked_attribute_version v
          set valid_during = tstzrange(lower(v.valid_during), $2::timestamptz)
         from merchandise.marked_attribute m
        where m.id = v.marked_attribute_id and m.mark = $1 and v.decision = 'Approved' and upper_inf(v.valid_during)`,
      [mark, from.toISOString()],
    );
    if (ended.rowCount !== 1) throw new Error(`No ${mark} marking was in force to end`);
    const versionId = uuidv7();
    await owner.query(
      `insert into merchandise.marked_attribute_version
         (id, marked_attribute_id, attribute_id, origin, decision, valid_during, prepared_by_user_id)
       select $1, m.id, $2, 'synthetic', 'Approved', tstzrange($3::timestamptz, null), $4
         from merchandise.marked_attribute m where m.mark = $5`,
      [versionId, attributeId, from.toISOString(), preparedBy, mark],
    );
    await owner.query('commit');
    return versionId;
  } catch (error) {
    await owner.query('rollback');
    throw error;
  } finally {
    await owner.end();
  }
}

/** One entry of the master sheet's item map: an item's value, its sub category and its type's value. */
export interface SyntheticItemMapEntry {
  readonly itemValueId: string;
  readonly categoryId: string;
  readonly typeValueId: string;
}

/**
 * Writes the SYNTHETIC replica of the master sheet's item map with a version of the item marking (goods-in 5.2, 5.3;
 * structure-and-masters 4.2 "As built"; RR-583), as a fixture, as the marking itself is written: no route sets the map
 * yet, and it is never a default (code-house-rules 11.1).
 */
export async function writeSyntheticItemMap(
  database: string,
  itemMarkingVersionId: string,
  entries: readonly SyntheticItemMapEntry[],
): Promise<void> {
  const owner = await connect(database, 'migration');
  try {
    for (const entry of entries) {
      await owner.query(
        `insert into merchandise.item_map_entry (id, marked_attribute_version_id, item_value_id, category_id, type_value_id)
         values ($1, $2, $3, $4, $5)`,
        [uuidv7(), itemMarkingVersionId, entry.itemValueId, entry.categoryId, entry.typeValueId],
      );
    }
  } finally {
    await owner.end();
  }
}

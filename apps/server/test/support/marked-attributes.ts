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

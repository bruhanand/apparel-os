import { uuidv7 } from '@apparel-os/domain';
import type { RecordTypeDeclaration } from '@apparel-os/schemas';
import { inArray } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import { effectiveGrant } from '../db/schema.js';
import { grantRowsOf } from '../domain/scope.js';
import { actorsWithAssignments, assignmentsInForce } from '../queries/assignments.js';

/**
 * Rebuilds the effective grants of the actors named, or of every actor that has an Approved assignment or a grant
 * now (access-and-approvals 7.2): deletes their rows and writes those of their assignments in force today under the
 * Organisation's timezone, so a start or end date that passed takes effect and a withdrawn or ended assignment grants
 * nothing (PRD-ACS-005; code-house-rules 7.3). Returns how many rows it wrote.
 */
export async function rebuildGrants(
  context: TransactionContext,
  registry: ReadonlyMap<string, RecordTypeDeclaration>,
  actorIds?: readonly string[],
): Promise<number> {
  const date = await context.businessDate();
  if (date.kind === 'not-set') throw new CommandDefect('Effective grants are rebuilt only once today is known');
  const actors = actorIds === undefined ? await actorsWithAssignments(context) : [...new Set(actorIds)];
  if (actors.length === 0) return 0;
  await context.tx.delete(effectiveGrant).where(inArray(effectiveGrant.actorId, actors));
  const inForce = (await assignmentsInForce(context, date.date)).filter((assignment) =>
    actors.includes(assignment.actorId),
  );
  const rows = inForce.flatMap((assignment) => grantRowsOf(assignment, registry));
  if (rows.length > 0) {
    await context.tx.insert(effectiveGrant).values(rows.map((row) => ({ ...row, id: uuidv7(), asOf: date.date })));
  }
  return rows.length;
}

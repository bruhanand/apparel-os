import type { GrantView, PermissionAction, PersonaId } from '@apparel-os/schemas';
import { asc, eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { effectiveGrant, personaHeld } from '../db/schema.js';
import { userInForce } from './users.js';

/**
 * What the shell needs of the signed-in user (access-and-approvals 3.3, 7.2; personas.md section 2; RR-261, RR-281):
 * the personas their user version in force holds, in order, and their effective grants, one per record type and
 * action, sorted. A persona sets the landing screen and grants nothing (PRD-ACS-002, PRD-ACS-003); a grant only opens
 * a screen, and every request is still authorised on its own (7.1 step 3).
 */
export async function ownAccess(
  context: TransactionContext,
  userId: string,
): Promise<{ personasHeld: PersonaId[]; grants: GrantView[] }> {
  const today = await context.businessDate();
  if (today.kind === 'not-set') return { personasHeld: [], grants: [] };
  const version = await userInForce(context, userId);
  const personas =
    version === undefined
      ? []
      : await context.tx
          .select({ persona: personaHeld.persona })
          .from(personaHeld)
          .where(eq(personaHeld.appUserVersionId, version.versionId))
          .orderBy(asc(personaHeld.position));
  const rows = await context.tx
    .select({ recordType: effectiveGrant.recordType, actions: effectiveGrant.actions })
    .from(effectiveGrant)
    .where(eq(effectiveGrant.actorId, userId));
  const grants = new Map<string, GrantView>();
  for (const row of rows) {
    for (const action of row.actions) {
      grants.set(`${row.recordType} ${action}`, { recordType: row.recordType, action: action as PermissionAction });
    }
  }
  return {
    personasHeld: personas.map((row) => row.persona as PersonaId),
    grants: [...grants.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, grant]) => grant),
  };
}

import { PT_TYPE } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import { CommandDefect, LOCK_STEP, type LockTarget, type TransactionContext } from '../../../../kernel/index.js';
import type { RecordFacts } from '../../../access/index.js';
import type { AuditScope } from '../../../audit/index.js';
import type { ReceivingInterface } from '../../../receiving/index.js';
import { pt } from '../db/schema.js';
import { revisionNotFound, type Outcome } from '../domain/refusals.js';
import { ptVersionToken, revisionFacts } from '../queries/pt-records.js';
import { ptLock } from './pt-lock.js';

// The opening every command on a PT's revision at the version its screen shows shares (code-house-rules 8.1, 8.2,
// 12.7; goods-in 5.8, 6.7; S2-F04-T02, S2-F09-T01; code review 8 of stage 2): the revision found, as the actor may
// see it; the PT's row and the GRN's row locked at step 1, with any further targets the command names, the GRN's as
// every scan locks it (goods-in 7.5); and the PT's version token rechecked under them. One step, so a withdrawal and a
// reversal's proposal open alike.

/** The PT a revision belongs to, locked at its version: the PT's row, the revision's facts and the token now. */
export interface PtAtVersion {
  readonly owner: typeof pt.$inferSelect;
  readonly facts: RecordFacts & AuditScope;
  readonly token: string;
}

export async function ptAtVersion(
  context: TransactionContext,
  receiving: Pick<ReceivingInterface, 'ptMarkLock'>,
  revisionId: string,
  versionToken: string,
  further: (owner: typeof pt.$inferSelect) => Promise<readonly LockTarget[]> = () => Promise.resolve([]),
): Promise<Outcome<PtAtVersion>> {
  const found = await revisionFacts(context, revisionId);
  if (found === undefined) return { kind: 'refusal', refusal: revisionNotFound(revisionId) };
  const [owner] = await context.tx.select().from(pt).where(eq(pt.id, found.ptId));
  if (owner === undefined) return { kind: 'refusal', refusal: revisionNotFound(revisionId) };
  await context.lock(LOCK_STEP.document, [
    ptLock(owner.id),
    receiving.ptMarkLock(owner.grnId),
    ...(await further(owner)),
  ]);
  // Rechecked under the locks (code-house-rules 8.1, 12.7). The PT holds the revision found, so it has a token.
  const token = await ptVersionToken(context, owner.id);
  if (token === undefined) throw new CommandDefect(`A PT with a revision has no version token: ${owner.id}`);
  if (token !== versionToken) {
    return {
      kind: 'refusal',
      refusal: {
        kind: 'conflict',
        code: 'kernel.stale-version',
        missing: [{ kind: 'version', recordType: PT_TYPE, recordId: owner.id, versionId: token }],
      },
    };
  }
  return { kind: 'success', answer: { owner, facts: found.facts, token } };
}

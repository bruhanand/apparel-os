import { and, eq, isNull, lt, or } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { secondFactor } from '../db/schema.js';

/**
 * Records the time step whose authenticator code was accepted, only if no equal or later step was taken first, so a
 * code is never accepted twice, even by two requests at once (PRD-SEC-001; access-and-approvals 3.1, 3.3). False when
 * another request took it first: the code is then refused like a wrong one.
 */
export async function takeStep(context: TransactionContext, secondFactorId: string, step: number): Promise<boolean> {
  const taken = await context.tx
    .update(secondFactor)
    .set({ lastUsedStep: step })
    .where(
      and(
        eq(secondFactor.id, secondFactorId),
        eq(secondFactor.state, 'Confirmed'),
        or(isNull(secondFactor.lastUsedStep), lt(secondFactor.lastUsedStep, step)),
      ),
    )
    .returning({ id: secondFactor.id });
  return taken.length === 1;
}

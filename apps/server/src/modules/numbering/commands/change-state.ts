import { uuidv7 } from '@apparel-os/domain';
import { eq } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { series, seriesEvent } from '../db/schema.js';
import { answered, refused, type NumberingResult } from '../domain/kinds.js';
import { seriesRow, stateOf, type SeriesState } from '../queries/series.js';
import { requireHeld } from './lock-target.js';

/**
 * Pause, release and close (numbering-and-audit 3.7): on a series the command holds at step 8. Pause takes an open
 * series, release a paused one, close either; Closed is final, never reopened or continued (PRD-LIF-015,
 * PRD-OFF-010). Each change is recorded as a series event.
 */
export async function changeState(
  context: TransactionContext,
  seriesId: string,
  how: 'pause' | 'release' | 'close',
): Promise<NumberingResult<SeriesState>> {
  requireHeld(context, seriesId, how === 'pause' ? 'Pause' : how === 'release' ? 'Release' : 'Close');
  const row = await seriesRow(context, seriesId);
  if (row === undefined) return refused('series-not-found');
  if (row.state === 'Closed') return refused('series-closed');
  if (how === 'pause' && row.state !== 'Open') return refused('series-not-open');
  if (how === 'release' && row.state !== 'Paused') return refused('series-not-paused');
  const state = how === 'pause' ? 'Paused' : how === 'release' ? 'Open' : 'Closed';
  const event = how === 'pause' ? 'paused' : how === 'release' ? 'released' : 'closed';
  await context.tx.update(series).set({ state }).where(eq(series.id, seriesId));
  await context.tx.insert(seriesEvent).values({ id: uuidv7(), seriesId, event, occurredAt: context.startedAt });
  return answered(stateOf({ ...row, state }));
}

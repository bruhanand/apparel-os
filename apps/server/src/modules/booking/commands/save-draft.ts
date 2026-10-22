import type { BookingDraftChange, BookingSaved } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import { today, type Outcome } from './common.js';
import {
  checkedSeason,
  draftForChange,
  linesRefusal,
  writeVersion,
  type Actor,
  type BookingCommandDependencies,
} from './draft.js';

/**
 * Saves a booking's next Draft (goods-in 3.1, 3.5; POL-05.01; S2-F01-T03), naming the version token it read
 * (code-house-rules 12.7): its brand and destination stay; the rest is checked again.
 */
export async function saveDraft(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  bookingId: string,
  draft: BookingDraftChange,
): Promise<Outcome<BookingSaved>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const found = await draftForChange(context, bookingId, draft.versionToken, 'content');
  if (found.kind !== 'draft') return found;
  const season = await checkedSeason(context, dependencies, found.row.brandId, draft, date);
  if ('kind' in season) return season;
  const lines = await linesRefusal(context, found.row.id, draft.lines, date);
  if (lines !== undefined) return lines;
  const answer = await writeVersion(context, dependencies, actor, found.row, draft, season, 'save-booking-draft');
  return { kind: 'success', answer };
}

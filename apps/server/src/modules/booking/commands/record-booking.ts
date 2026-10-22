import { uuidv7 } from '@apparel-os/domain';
import type { BookingDraft, BookingSaved } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import { structureOn } from '../../organisation/index.js';
import { booking } from '../db/schema.js';
import type { BookingRow } from '../queries/bookings.js';
import { refused, today, type Outcome } from './common.js';
import { checkedSeason, writeVersion, type Actor, type BookingCommandDependencies } from './draft.js';

/**
 * Records a new booking as a Draft (goods-in 3.1; PRD-BKG-001, PRD-BKG-003; S2-F01-T03): its brand and destination, a
 * Site in force today, fixed for the booking's life, and its first version. A new booking has no row to lock at step 1:
 * writing its identity row creates it locked, and no other transaction sees it before this one commits
 * (code-house-rules 8.2), as a new Arrival's.
 */
export async function recordBooking(
  context: TransactionContext,
  dependencies: BookingCommandDependencies,
  actor: Actor,
  draft: BookingDraft,
): Promise<Outcome<BookingSaved>> {
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  const structure = await structureOn(context, date);
  if (!structure.sites.some((site) => site.id === draft.destinationSiteId)) {
    return refused('refused', 'booking.site-not-in-force', [
      { kind: 'record', recordType: 'organisation.site', recordId: draft.destinationSiteId },
    ]);
  }
  const season = await checkedSeason(context, dependencies, draft.brandId, draft, date);
  if ('kind' in season) return season;
  const values = {
    id: uuidv7(),
    brandId: draft.brandId,
    siteId: draft.destinationSiteId,
    recordedByUserId: actor.userId,
  };
  await context.tx.insert(booking).values(values);
  const row: BookingRow = { ...values, recordedAt: context.startedAt };
  const answer = await writeVersion(context, dependencies, actor, row, draft, season, 'record-booking');
  return { kind: 'success', answer };
}

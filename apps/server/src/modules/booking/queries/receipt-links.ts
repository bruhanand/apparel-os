import type { BookingReceiptLinkProposal } from '@apparel-os/schemas';
import { asc, eq, inArray } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import type { LatestRequest } from '../../access/index.js';
import {
  bookingReceiptLink,
  bookingReceiptLinkProposal,
  bookingReceiptLinkProposalDecision,
  bookingReceiptLinkProposalLine,
} from '../db/schema.js';

// The reads of receipt links and of the proposals to link late or excess goods (goods-in 3.6, 3.7, 4.10; PRD-BKG-006
// to PRD-BKG-008; POL-05.08; S2-F02-T04): a booking's proposals for its screen and its approval panel; where each GRN
// line given stands against bookings, for `receiving`'s GRN. Every row is scoped (code-house-rules 6.2), so a reader
// sees only the links and proposals of bookings their scope covers.

/** The state a proposal shows (design-language 7): its decision, else its latest request's. */
function proposalState(
  decision: 'Approved' | 'Rejected' | undefined,
  request: LatestRequest | undefined,
): BookingReceiptLinkProposal['state'] {
  if (decision !== undefined) return decision;
  return request?.state === 'Superseded' ? 'Superseded' : 'Awaiting approval';
}

/** A booking's proposals to link late or excess goods, oldest first, as the booking shows them (goods-in 4.10). */
export async function receiptLinkProposalsOf(
  context: TransactionContext,
  bookingId: string,
  requests: (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>,
): Promise<BookingReceiptLinkProposal[]> {
  const rows = await context.tx
    .select()
    .from(bookingReceiptLinkProposal)
    .where(eq(bookingReceiptLinkProposal.bookingId, bookingId))
    .orderBy(asc(bookingReceiptLinkProposal.recordedAt), asc(bookingReceiptLinkProposal.id));
  if (rows.length === 0) return [];
  const ids = rows.map((row) => row.id);
  const lines = await context.tx
    .select()
    .from(bookingReceiptLinkProposalLine)
    .where(inArray(bookingReceiptLinkProposalLine.proposalId, ids))
    .orderBy(asc(bookingReceiptLinkProposalLine.recordedAt), asc(bookingReceiptLinkProposalLine.id));
  const decisions = await context.tx
    .select()
    .from(bookingReceiptLinkProposalDecision)
    .where(inArray(bookingReceiptLinkProposalDecision.proposalId, ids));
  const latest = await requests(ids);
  return rows.map((row) => {
    const request = latest.get(row.id);
    return {
      id: row.id,
      state: proposalState(decisions.find((each) => each.proposalId === row.id)?.decision, request),
      versionId: row.bookingVersionId,
      lines: lines
        .filter((line) => line.proposalId === row.id)
        .map((line) => ({
          grnId: line.grnId,
          grnNumber: line.grnNumber,
          grnLineId: line.grnLineId,
          lineKey: line.bookingLineId,
          styleCode: line.styleCode,
          colour: line.colour,
          size: line.size,
          quantity: line.quantity,
          arrivalDate: line.arrivalDate,
          late: line.late,
          excess: line.excess,
        })),
      proposedBy: row.proposedByUserId,
      proposedAt: row.recordedAt.toISOString(),
      ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
    };
  });
}

/** Where a GRN line stands against bookings, as far as the reader may see them (goods-in 3.7, 4.10). */
export interface GrnLineReceipt {
  readonly link: {
    readonly bookingId: string;
    readonly lineKey: string;
    readonly kind: 'at-issue' | 'later';
    readonly proposalId: string | null;
    readonly linkedBy: string;
    readonly linkedAt: string;
  } | null;
  readonly proposal: { readonly bookingId: string; readonly proposalId: string; readonly lineKey: string } | null;
}

/**
 * For each GRN line given, its receipt link and a proposal of it still waiting for its decision, of the bookings the
 * reader may see (goods-in 3.7, 4.10): `receiving` shows them on the GRN.
 */
export async function receiptsOfGrnLines(
  context: TransactionContext,
  grnLineIds: readonly string[],
): Promise<ReadonlyMap<string, GrnLineReceipt>> {
  const answer = new Map<string, GrnLineReceipt>();
  if (grnLineIds.length === 0) return answer;
  const links = await context.tx
    .select()
    .from(bookingReceiptLink)
    .where(inArray(bookingReceiptLink.grnLineId, [...grnLineIds]));
  const proposed = await context.tx
    .select({
      grnLineId: bookingReceiptLinkProposalLine.grnLineId,
      lineKey: bookingReceiptLinkProposalLine.bookingLineId,
      proposalId: bookingReceiptLinkProposal.id,
      bookingId: bookingReceiptLinkProposal.bookingId,
      decided: bookingReceiptLinkProposalDecision.id,
    })
    .from(bookingReceiptLinkProposalLine)
    .innerJoin(bookingReceiptLinkProposal, eq(bookingReceiptLinkProposal.id, bookingReceiptLinkProposalLine.proposalId))
    .leftJoin(
      bookingReceiptLinkProposalDecision,
      eq(bookingReceiptLinkProposalDecision.proposalId, bookingReceiptLinkProposal.id),
    )
    .where(inArray(bookingReceiptLinkProposalLine.grnLineId, [...grnLineIds]));
  for (const grnLineId of grnLineIds) {
    const link = links.find((each) => each.grnLineId === grnLineId);
    const waiting = proposed.find((each) => each.grnLineId === grnLineId && each.decided === null);
    answer.set(grnLineId, {
      link:
        link === undefined
          ? null
          : {
              bookingId: link.bookingId,
              lineKey: link.bookingLineId,
              kind: link.kind,
              proposalId: link.proposalId,
              linkedBy: link.linkedByUserId,
              linkedAt: link.linkedAt.toISOString(),
            },
      proposal:
        waiting === undefined
          ? null
          : { bookingId: waiting.bookingId, proposalId: waiting.proposalId, lineKey: waiting.lineKey },
    });
  }
  return answer;
}

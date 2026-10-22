import { uuidv7 } from '@apparel-os/domain';
import { BOOKING_RECEIPT_LINK } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { bookingReceiptLinkProposal, bookingReceiptLinkProposalLine } from '../db/schema.js';
import { bookingAuditRecord, bookingItem, bookingVersionItem, lineItem, receiptLinkDocument } from '../domain/bookings.js';
import { laterLinks } from '../domain/receipts.js';
import { gateRefusal, type ApprovalDependencies } from './approval.js';
import { refusalOf, refused, today, type Outcome } from './common.js';
import { factsOf } from './draft.js';
import {
  heldBooking,
  inForceOf,
  linkedOf,
  pendingProposalOf,
  proposedOf,
  writeLink,
  type Linker,
  type ReceiptsLater,
  type ReceiptsLinked,
} from './receipt-link.js';

/** What the later link needs: audit, Request approval of `access`, and the policy gate (goods-in 10.5). */
export interface LaterLinkDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly gate: ApprovalDependencies['configuration'];
}

/**
 * Booking's later link of GRN lines to the lines of one booking (goods-in 3.7, 3.10, 4.10; PRD-BKG-008; POL-05.08;
 * DEC-130; S2-F02-T04): a GRN received without a booking, or lines sent for review. Each line names a line of the
 * version in force whose goods the GRN line's are, checked under the booking's lock (`booking.line-not-found`,
 * `booking.goods-not-of-line`), so a receipt link always names a line its goods match, at any Site; a GRN line linked
 * already, or waiting in a proposal, is refused. A line whose goods arrived within the window as extended now, and
 * whose pieces are within the line's outstanding, links now, dated and signed. A late or excess line is accepted into
 * the booking only once a different authorised person approves it (POL-05.08; RR-577, the product owner, 22 Oct 2026):
 * those lines make one proposal, whose approval is requested through `access` under approve on the booking, with no
 * value basis, from someone other than the proposer (POL-02.07), and whose decision writes their links
 * (receipt-link-proposal.ts). One proposal of a booking waits at a time (`booking.link-proposal-pending`, naming it),
 * since a second request under the same action type would supersede the first's (access-and-approvals 9.6). Asked of
 * the policy gate as a booking's approval is (goods-in 10.5). The caller holds the booking's lock at step 1.
 */
export async function linkReceiptsLater(
  context: TransactionContext,
  dependencies: LaterLinkDependencies,
  linker: Linker,
  later: ReceiptsLater,
): Promise<Outcome<ReceiptsLinked>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const row = await heldBooking(context, later.bookingId);
  if (row === undefined) return refused('not-found', 'booking.record-not-found', [bookingItem(later.bookingId)]);
  const inForce = await inForceOf(context, row, date);
  if (inForce === undefined) return refused('refused', 'booking.not-approved', [bookingItem(row.id)]);
  const grnLineIds = later.receipts.map((receipt) => receipt.grnLineId);
  if ((await linkedOf(context, grnLineIds)).size > 0) {
    return refused('refused', 'booking.receipt-already-linked', [bookingItem(row.id)]);
  }
  if ((await proposedOf(context, grnLineIds)).size > 0) {
    return refused('refused', 'booking.receipt-link-proposed', [bookingItem(row.id)]);
  }
  const classified = laterLinks(inForce, later.receipts);
  if (classified.kind === 'refused') return refused('refused', classified.code, [lineItem(row.id, classified.lineKey)]);
  const gate = await gateRefusal(context, dependencies.gate, row.siteId);
  if (gate !== undefined) return refusalOf(gate);
  const needing = later.receipts.flatMap((receipt, index) => {
    const outcome = classified.receipts[index];
    return outcome?.kind === 'approval' ? [{ receipt, late: outcome.late, excess: outcome.excess }] : [];
  });
  if (needing.length > 0) {
    const pending = await pendingProposalOf(context, row.id);
    if (pending !== undefined) {
      return refused('refused', 'booking.link-proposal-pending', [bookingVersionItem(row.id, pending.id)]);
    }
  }
  const linked: { grnLineId: string; linkId: string; lineKey: string }[] = [];
  for (const [index, receipt] of later.receipts.entries()) {
    if (classified.receipts[index]?.kind !== 'link') continue;
    const linkId = await writeLink(context, dependencies.audit, linker, row, inForce.status.versionId, {
      lineKey: receipt.lineKey,
      grnId: later.grn.grnId,
      grnLineId: receipt.grnLineId,
      grnSiteId: later.grn.siteId,
      quantity: receipt.quantity,
      kind: 'later',
      date,
    });
    linked.push({ grnLineId: receipt.grnLineId, linkId, lineKey: receipt.lineKey });
  }
  if (needing.length === 0) return { kind: 'success', answer: { linked, proposal: null } };
  const proposalId = uuidv7();
  await context.tx.insert(bookingReceiptLinkProposal).values({
    id: proposalId,
    bookingId: row.id,
    bookingVersionId: inForce.status.versionId,
    ...factsOf(row),
    proposedByUserId: linker.userId,
  });
  await context.tx.insert(bookingReceiptLinkProposalLine).values(
    needing.map(({ receipt, late, excess }) => ({
      id: uuidv7(),
      proposalId,
      bookingLineId: receipt.lineKey,
      ...factsOf(row),
      grnId: later.grn.grnId,
      grnNumber: later.grn.grnNumber,
      grnLineId: receipt.grnLineId,
      grnSiteId: later.grn.siteId,
      styleCode: receipt.goods.styleCode,
      colour: receipt.goods.colour,
      size: receipt.goods.size,
      quantity: receipt.quantity,
      arrivalDate: receipt.arrivalDate,
      late,
      excess,
    })),
  );
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: BOOKING_RECEIPT_LINK,
    document: receiptLinkDocument(row.id, proposalId),
    value: { kind: 'none' },
    preparers: [linker.userId],
    requestedBy: linker,
    facts: factsOf(row),
  });
  const proposed = needing.map(({ receipt }) => receipt.grnLineId);
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: linker.userId },
    roleAssignmentId: linker.roleAssignmentId,
    scope: factsOf(row),
    record: bookingAuditRecord(row.id, inForce.status.versionId),
    operation: 'propose-booking-receipt-link',
    changes: [
      { kind: 'value', field: 'proposalId', before: null, after: proposalId },
      {
        kind: 'value',
        field: 'lines',
        before: null,
        after: needing.map(({ receipt, late, excess }) => ({
          grnLineId: receipt.grnLineId,
          lineKey: receipt.lineKey,
          quantity: receipt.quantity,
          late,
          excess,
        })),
      },
      { kind: 'value', field: 'requestId', before: null, after: requestId },
    ],
    source: { kind: 'screen' },
  });
  return { kind: 'success', answer: { linked, proposal: { proposalId, requestId, grnLineIds: proposed } } };
}

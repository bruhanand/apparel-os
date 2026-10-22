import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { ReceiptAtIssue, ReceiptsAtIssue } from '../domain/receipts.js';
import { planAtIssue } from '../queries/receipts.js';
import { refusalOf, today, type Outcome } from './common.js';
import { writeLink, type Linker } from './receipt-link.js';

/**
 * Links the counted lines of a GRN at its issue to the booking lines they match (goods-in 3.7, 4.10, 10.3;
 * PRD-BKG-007; POL-05.08; DEC-130; S2-F02-T04), as `receiptsAtIssue` answered under the same lock before the caller's
 * later locks (queries/receipts.ts), once the caller holds every lock (code-house-rules 8.2): each link dated and signed
 * by whoever issues the GRN, with its audit record. A line for review writes nothing here; the caller keeps why. The
 * caller holds the booking's lock at step 1.
 */
export async function linkReceiptsAtIssue(
  context: TransactionContext,
  audit: AuditInterface,
  linker: Linker,
  issue: ReceiptsAtIssue,
): Promise<Outcome<readonly ReceiptAtIssue[]>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const plan = await planAtIssue(context, issue, date);
  if (plan.kind !== 'planned') return plan;
  const answers: ReceiptAtIssue[] = [];
  for (const [index, outcome] of plan.outcomes.entries()) {
    if (outcome.kind === 'review') {
      answers.push(outcome);
      continue;
    }
    const receipt = issue.receipts[index];
    if (receipt === undefined || plan.inForce === undefined) {
      throw new CommandDefect('A GRN line links to a booking with no version in force');
    }
    const linkId = await writeLink(context, audit, linker, plan.row, plan.inForce.status.versionId, {
      lineKey: outcome.lineKey,
      grnId: issue.grn.grnId,
      grnLineId: receipt.grnLineId,
      grnSiteId: issue.grn.siteId,
      quantity: receipt.quantity,
      kind: 'at-issue',
      date,
    });
    answers.push({ kind: 'linked', grnLineId: outcome.grnLineId, lineKey: outcome.lineKey, linkId });
  }
  return { kind: 'success', answer: answers };
}

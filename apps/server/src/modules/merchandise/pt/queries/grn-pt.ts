import { paise } from '@apparel-os/domain';
import type { FieldClass, GrnPtRead, MaskablePaise, PtRevisionState } from '@apparel-os/schemas';
import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { LatestRequest } from '../../../access/index.js';
import type { PtMarkChangeView, ReceivingInterface } from '../../../receiving/index.js';
import { ptProposedSku, ptRevision, ptRevisionWithdrawal, ptRow } from '../db/schema.js';
import { uploadBlock } from './plan.js';
import { ptOfGrn, ptVersionToken } from './pt-records.js';

// The PT of a GRN as its screen reads it (goods-in 5.1, 5.7, 5.8, section 11; S2-F04-T02): the GRN, its "PT attached"
// mark, whether a file can be uploaded for it now and what blocks it, and the PT's revisions, newest first, each with
// its state, totals and counts and its latest approval request. Read under the reader's actor, so row-level security
// keeps out a GRN or a PT the reader may not see (code-house-rules 6.2). A cost the reader may not see is masked
// (access-and-approvals 6; PRD-ACS-008).

/** An amount as a reader is shown it: masked where its class is not granted (access-and-approvals 6). */
export function shownPaise(amount: number, fieldClass: FieldClass, masked: ReadonlySet<FieldClass>): MaskablePaise {
  return masked.has(fieldClass) ? { kind: 'masked', fieldClass } : { kind: 'amount', paise: paise(amount) };
}

/** A revision's state (design-language 7): Withdrawn, or its approval request's decision, Awaiting approval until. */
function stateOf(withdrawn: boolean, request: LatestRequest | undefined): PtRevisionState {
  if (withdrawn) return 'Withdrawn';
  if (request?.state === 'Approved') return 'Approved';
  if (request?.state === 'Rejected') return 'Rejected';
  return 'Awaiting approval';
}

const changeOf = (change: PtMarkChangeView) => ({
  ptRevisionId: change.ptRevisionId,
  reason: change.reason,
  changedBy: change.changedBy,
  occurredAt: change.occurredAt,
});

export async function grnPtView(
  context: TransactionContext,
  receiving: Pick<ReceivingInterface, 'grnForPt' | 'ptMark' | 'ptBasis'>,
  grnId: string,
  requests: (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>,
  masked: ReadonlySet<FieldClass>,
): Promise<{ readonly view: Omit<GrnPtRead, 'asOf' | 'people'>; readonly people: readonly string[] } | undefined> {
  const grn = await receiving.grnForPt(context, grnId);
  if (grn === undefined) return undefined;
  const mark = await receiving.ptMark(context, grnId);
  const block = await uploadBlock(context, receiving, grnId);
  const people = new Set<string>();
  if (mark.lastChange !== undefined) people.add(mark.lastChange.changedBy);
  const owner = await ptOfGrn(context, grnId);
  let pt: GrnPtRead['pt'] = null;
  if (owner !== undefined) {
    const revisions = await context.tx
      .select()
      .from(ptRevision)
      .where(eq(ptRevision.ptId, owner.id))
      .orderBy(desc(ptRevision.revisionNumber));
    const ids = revisions.map((each) => each.id);
    const withdrawals =
      ids.length === 0
        ? []
        : await context.tx.select().from(ptRevisionWithdrawal).where(inArray(ptRevisionWithdrawal.ptRevisionId, ids));
    const rows = await countsBy(context, ids, 'rows');
    const proposals = await countsBy(context, ids, 'proposals');
    const repeated = await countsBy(context, ids, 'repeated');
    const differing = await countsBy(context, ids, 'differences');
    const latest = await requests(ids);
    pt = {
      ptId: owner.id,
      versionToken: (await ptVersionToken(context, owner.id)) ?? owner.id,
      revisions: revisions.map((revision) => {
        const withdrawal = withdrawals.find((each) => each.ptRevisionId === revision.id);
        const request = latest.get(revision.id);
        people.add(revision.uploadedByUserId);
        if (withdrawal !== undefined) people.add(withdrawal.withdrawnByUserId);
        return {
          revisionId: revision.id,
          revisionNumber: revision.revisionNumber,
          state: stateOf(withdrawal !== undefined, request),
          batchId: revision.importBatchId,
          uploadedBy: revision.uploadedByUserId,
          submittedAt: revision.submittedAt.toISOString(),
          totals: {
            rows: rows.get(revision.id) ?? 0,
            pieces: revision.pieces,
            mrpPaise: paise(revision.mrpPaise),
            basicPaise: shownPaise(revision.basicPaise, 'cost', masked),
            costPaise: shownPaise(revision.costPaise, 'cost', masked),
          },
          newProducts: proposals.get(revision.id) ?? 0,
          repeatedBarcodes: repeated.get(revision.id) ?? 0,
          differences: differing.get(revision.id) ?? 0,
          ...(request === undefined ? {} : { request: { id: request.id, state: request.state } }),
          ...(withdrawal === undefined
            ? {}
            : { withdrawn: { by: withdrawal.withdrawnByUserId, at: withdrawal.occurredAt.toISOString() } }),
        };
      }),
    };
  }
  return {
    view: {
      grn: { grnId: grn.grnId, number: grn.number },
      mark:
        mark.kind === 'set'
          ? { kind: 'set', ptRevisionId: mark.ptRevisionId, lastChange: changeOf(mark.lastChange) }
          : { kind: 'not-set', ...(mark.lastChange === undefined ? {} : { lastChange: changeOf(mark.lastChange) }) },
      upload:
        block === undefined
          ? { kind: 'ready' }
          : { kind: 'blocked', code: block.code, missing: block.missing.map((item) => ({ ...item })) },
      pt,
    },
    people: [...people],
  };
}

/** A count per revision: its rows, its proposed products, its distinct repeated barcodes, or its rows that differ. */
async function countsBy(
  context: TransactionContext,
  revisionIds: readonly string[],
  what: 'rows' | 'proposals' | 'repeated' | 'differences',
): Promise<Map<string, number>> {
  if (revisionIds.length === 0) return new Map();
  const ids = [...revisionIds];
  if (what === 'proposals') {
    const counted = await context.tx
      .select({ id: ptProposedSku.ptRevisionId, count: sql<number>`count(*)::int` })
      .from(ptProposedSku)
      .where(inArray(ptProposedSku.ptRevisionId, ids))
      .groupBy(ptProposedSku.ptRevisionId);
    return new Map(counted.map((row) => [row.id, row.count]));
  }
  const counted = await context.tx
    .select({
      id: ptRow.ptRevisionId,
      count: what === 'repeated' ? sql<number>`count(distinct ${ptRow.barcode})::int` : sql<number>`count(*)::int`,
    })
    .from(ptRow)
    .where(
      and(
        inArray(ptRow.ptRevisionId, ids),
        what === 'repeated' ? eq(ptRow.barcodeRepeated, true) : undefined,
        what === 'differences' ? sql`jsonb_array_length(${ptRow.detail} -> 'differences') > 0` : undefined,
      ),
    )
    .groupBy(ptRow.ptRevisionId);
  return new Map(counted.map((row) => [row.id, row.count]));
}

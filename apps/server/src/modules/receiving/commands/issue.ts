import { uuidv7 } from '@apparel-os/domain';
import { ARRIVAL_TYPE, GRN_TYPE, type GrnIssue, type GrnIssued, type MissingItem } from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import { LOCK_STEP, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { skuOn } from '../../merchandise/catalogue/index.js';
import { termsInForce } from '../../merchandise/parties/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import type { LedgerItem, Owner, StockLedgerInterface } from '../../stock/ledger/index.js';
import { batchColumns } from '../db/columns.js';
import { arrivalInvoice, grn, grnLine } from '../db/schema.js';
import { GRN_KIND, GRN_SCOPE_KEY, GRN_SOURCE_TYPE, MISSING_GRN_SERIES } from '../domain/kinds.js';
import { currentLines, grnBlockers, lineItem, type CurrentLine } from '../domain/lines.js';
import { ownerColumns, receiptOwner } from '../domain/owner.js';
import { grnIssued as grnIssuedEvent } from '../events.js';
import { receivingMissing, receivingUnavailable, type AvailabilityDependencies } from '../queries/availability.js';
import { arrivalForChange } from './arrival.js';
import {
  audited,
  entriesOf,
  factsOf,
  newestChange,
  recordItem,
  refusalOf,
  refused,
  scopeColumns,
  today,
  valueChange,
  type Actor,
  type ArrivalRow,
  type Outcome,
} from './common.js';

// Issue the GRN (goods-in 4.5, 10.3; PRD-REC-008, PRD-ACP-001, PRD-ORG-014, PRD-INT-002, PRD-INT-004; S2-F02-T02).
// No approval is needed (grill round 7; POL-02.08). In one transaction, or nothing: the GRN freezes the count as it
// stands with its number from the GRN series; `stock` · ledger records a receipt count of each line's counted pieces
// into the Arrival's receiving location, in good condition, cost Unknown and not accepted, owned as the brand's
// Agreement in force on the arrival date says; its audit record and event are saved. In this first piece every line's
// counted quantity must equal its invoice quantity: the findings at the count come with S2-F02-T03. Locks follow
// stock-ledger 10.3: the authority rows at step 0 (the route's), the Arrival at step 1, the ledger's at steps 2 to 6,
// the series at step 8; the version, the state and the gate are read again under them (PRD-INT-003).

export interface IssueDependencies extends AvailabilityDependencies {
  readonly audit: AuditInterface;
  readonly numbering: Pick<NumberingInterface, 'liveSeries' | 'seriesLockTarget' | 'allocate'>;
  readonly ledger: StockLedgerInterface;
}

/** The GRN reads only an Agreement's ownership: it holds no value, so an Agreement's margins are never shown to it. */
const SHOW_MARGINS = false;

/**
 * What the lines' products ask of them on the issue date (PRD-MER-011): a batch and expiry exactly where the
 * product's tracking profile in force at the Site requires them; a line with no product carries none. A product no
 * longer in force at the Site is refused as not of its line.
 */
async function batchRefusal(
  context: TransactionContext,
  row: ArrivalRow,
  lines: readonly CurrentLine[],
  date: string,
): Promise<Outcome<never> | undefined> {
  const required: MissingItem[] = [];
  const untracked: MissingItem[] = [];
  for (const line of lines) {
    const { entry } = line;
    if (entry.skuId === null) {
      if (entry.batch !== null) untracked.push(lineItem(line.lineId));
      continue;
    }
    const read = await skuOn(context, entry.skuId, row.siteId, date);
    if ('refusal' in read || read.sku.brandId !== row.brandId) {
      return refused('refused', 'receiving.sku-not-of-line', [
        lineItem(line.lineId),
        recordItem('merchandise.sku', entry.skuId),
      ]);
    }
    const requires = read.sku.tracking?.batchExpiryRequired === true;
    if (requires && entry.batch === null) required.push(lineItem(line.lineId));
    if (!requires && entry.batch !== null) untracked.push(lineItem(line.lineId));
  }
  if (required.length > 0) return refused('refused', 'receiving.batch-required', required);
  if (untracked.length > 0) return refused('refused', 'receiving.batch-not-tracked', untracked);
  return undefined;
}

/** The receipt count of one line's counted pieces (stock-ledger 13.4, 13.14; goods-in 4.5). */
function receiptCount(row: ArrivalRow, line: CurrentLine, grnLineId: string, owner: Owner): LedgerItem {
  const { entry } = line;
  // A known product, or goods of a product not yet set up with their identity as described, counted under the
  // Arrival's brand, so a person scoped to it sees them before PT approval names their SKU (stock-ledger 13.14; RR-555).
  const goods =
    entry.skuId === null
      ? {
          skuId: null,
          described: { styleCode: entry.styleCode, colour: entry.colour, size: entry.size?.code ?? null },
          brandId: row.brandId,
        }
      : { skuId: entry.skuId };
  return {
    kind: 'receipt-count',
    lineId: grnLineId,
    ...goods,
    quantity: entry.countedQuantity,
    to: { siteId: row.siteId, businessUnitId: row.businessUnitId, locationId: row.receivingLocationId },
    condition: 'good',
    owner,
    ...(entry.batch === null ? {} : { batch: { ...entry.batch } }),
  };
}

export async function issueGrn(
  context: TransactionContext,
  dependencies: IssueDependencies,
  actor: Actor,
  arrivalId: string,
  draft: GrnIssue,
  idempotencyKey: string,
): Promise<Outcome<GrnIssued>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  // Step 1: the Arrival, read under its lock with every fact checked below.
  const found = await arrivalForChange(context, arrivalId);
  if (found.kind !== 'open') return found;
  const { row } = found;
  const newest = await newestChange(context, row.id);
  if (newest?.id !== draft.versionToken) {
    return refused('conflict', 'kernel.stale-version', [recordItem(ARRIVAL_TYPE, row.id)]);
  }
  const unavailable = receivingUnavailable(
    await receivingMissing(context, dependencies, { siteId: row.siteId, businessUnitId: row.businessUnitId }, date),
  );
  if (unavailable !== undefined) return refusalOf(unavailable);
  const invoices = await context.tx
    .select({ id: arrivalInvoice.id })
    .from(arrivalInvoice)
    .where(eq(arrivalInvoice.arrivalId, row.id));
  const lines = currentLines(await entriesOf(context, row.id));
  const blocked = grnBlockers(invoices.length, lines);
  if (blocked !== undefined) return refused('refused', blocked.code, blocked.missing);
  const batches = await batchRefusal(context, row, lines, date);
  if (batches !== undefined) return batches;
  const series = await dependencies.numbering.liveSeries(context, { kind: GRN_KIND.kind, scopeKey: GRN_SCOPE_KEY });
  if (series === undefined) return refused('unavailable', 'receiving.no-grn-series', [MISSING_GRN_SERIES]);
  if (series.state !== 'Open') return refused('unavailable', 'receiving.grn-series-paused', [MISSING_GRN_SERIES]);

  // The owner each receipt origin records: the brand's Agreement version in force on the arrival date (PRD-ORG-014).
  const terms = await termsInForce(context, { brandId: row.brandId }, row.arrivalDate, SHOW_MARGINS);
  const agreement =
    terms === undefined ? undefined : { versionId: terms.versionId, brandId: row.brandId, terms: terms.terms };
  const owner = receiptOwner(agreement, row.legalEntityId);

  const grnId = uuidv7();
  const numbered = lines.map((line, index) => ({ line, id: uuidv7(), lineNumber: index + 1 }));
  const planned = await dependencies.ledger.plan(context, {
    source: { module: 'receiving', recordType: GRN_SOURCE_TYPE, recordId: grnId, versionId: grnId, importKind: 'none' },
    actor: { kind: 'user', userId: actor.userId, roleAssignmentId: actor.roleAssignmentId },
    items: numbered.map(({ line, id }) => receiptCount(row, line, id, owner)),
    idempotencyKey,
  });
  if (planned.kind === 'refused') return refusalOf(planned.refusal);
  const locked = await dependencies.ledger.lock(context, planned.value);
  const periods = await dependencies.ledger.holdPeriods(context, planned.value);
  if (periods.kind === 'refused') return refusalOf(periods.refusal);
  await context.lock(LOCK_STEP.numberSeries, [
    ...periods.value,
    dependencies.numbering.seriesLockTarget(series.seriesId),
  ]);
  const checked = await dependencies.ledger.recheck(context, locked);
  if (checked.kind === 'refused') return refusalOf(checked.refusal);
  const written = await dependencies.ledger.write(context, checked.value, { kind: 'screen' });
  if (written.kind === 'refused') return refusalOf(written.refusal);

  const allocated = await dependencies.numbering.allocate(context, {
    seriesId: series.seriesId,
    documentType: GRN_TYPE,
    documentId: grnId,
  });
  if (allocated.kind === 'refused') {
    const code =
      allocated.refusal.code === 'numbering.series-paused' ? 'receiving.grn-series-paused' : 'receiving.no-grn-series';
    return refused('unavailable', code, [MISSING_GRN_SERIES]);
  }
  const countedBy: string[] = [];
  for (const line of lines) for (const user of line.countedBy) if (!countedBy.includes(user)) countedBy.push(user);
  await context.tx.insert(grn).values({
    id: grnId,
    arrivalId: row.id,
    ...scopeColumns(row),
    number: allocated.value.formattedText,
    numberAllocationId: allocated.value.allocationId,
    arrivalVersionId: draft.versionToken,
    agreementVersionId: agreement?.versionId ?? null,
    ...ownerColumns(owner),
    countedByUserIds: countedBy,
    issuedByUserId: actor.userId,
    issuedAt: context.startedAt,
    businessDate: date,
  });
  await context.tx.insert(grnLine).values(
    numbered.map(({ line, id, lineNumber }) => ({
      id,
      grnId,
      lineNumber,
      countEntryId: line.entry.id,
      ...scopeColumns(row),
      styleCode: line.entry.styleCode,
      colour: line.entry.colour,
      sizeCode: line.entry.size?.code ?? null,
      skuId: line.entry.skuId,
      invoiceQuantity: line.entry.invoiceQuantity,
      countedQuantity: line.entry.countedQuantity,
      ...batchColumns(line.entry.batch),
      countedByUserIds: [...line.countedBy],
    })),
  );
  await audited(context, dependencies.audit, actor, row, {
    record: { type: GRN_TYPE, id: grnId },
    operation: 'issue-grn',
    changes: [
      valueChange('arrivalId', null, row.id),
      valueChange('number', null, allocated.value.formattedText),
      valueChange('lines', null, numbered.length),
      valueChange('owner', null, { ...ownerColumns(owner) }),
      valueChange('agreementVersionId', null, agreement?.versionId ?? null),
      valueChange('movements', null, [...written.value.movementIds]),
    ],
    idempotencyKey,
  });
  await context.publish(grnIssuedEvent, {
    subject: { module: 'receiving', recordType: GRN_TYPE, recordId: grnId },
    scope: factsOf(row),
    payload: { grnId, arrivalId: row.id },
  });
  return { kind: 'success', answer: { grnId, number: allocated.value.formattedText } };
}

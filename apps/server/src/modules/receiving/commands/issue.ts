import { uuidv7 } from '@apparel-os/domain';
import {
  ARRIVAL_TYPE,
  GRN_TYPE,
  HELD_LINE_DECISION,
  HELD_LINE_TYPE,
  lineFindings,
  type GrnIssue,
  type GrnIssued,
  type LineFindings,
  type MissingItem,
} from '@apparel-os/schemas';
import { eq } from 'drizzle-orm';
import { CommandDefect, LOCK_STEP, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { BookingInterface, ReceiptsAtIssue } from '../../booking/index.js';
import type { ExceptionsInterface } from '../../exceptions/index.js';
import { skuOn } from '../../merchandise/catalogue/index.js';
import { termsInForce } from '../../merchandise/parties/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import type { StockDocumentsInterface } from '../../stock/documents/index.js';
import type {
  Condition,
  ItemValue,
  LedgerItem,
  NamedGoods,
  Owner,
  StockLedgerInterface,
} from '../../stock/ledger/index.js';
import { grnLineContentColumns } from '../db/columns.js';
import { arrivalInvoice, grn, grnLine, grnLineBooking, heldLine, heldLineVersion } from '../db/schema.js';
import {
  BOOKING_REVIEW_EXCEPTION_TYPE,
  EXTRA_EXCEPTION_TYPES,
  GRN_KIND,
  GRN_SCOPE_KEY,
  GRN_SOURCE_TYPE,
  HOLD_REASONS,
  MISSING_GRN_SERIES,
  RECEIVING_MODULE,
  SHORTAGE_EXCEPTION_TYPE,
} from '../domain/kinds.js';
import { contentOf, currentLines, grnBlockers, lineItem, type CurrentLine } from '../domain/lines.js';
import { ownerColumns, receiptOwner } from '../domain/owner.js';
import { grnIssued as grnIssuedEvent } from '../events.js';
import { receivingMissing, receivingUnavailable, type AvailabilityDependencies } from '../queries/availability.js';
import { arrivalForChange } from './arrival.js';
import {
  arrivalRow,
  audited,
  entriesOf,
  exceptionFactsOf,
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

// Issue the GRN (goods-in 4.4, 4.5, 4.9, 10.3; PRD-REC-006, PRD-REC-008, PRD-REC-012, PRD-REC-013, PRD-ACP-001,
// PRD-DMG-001, PRD-ORG-014, PRD-INT-002, PRD-INT-004; S2-F02-T02, S2-F02-T03). No approval is needed (grill round 7;
// POL-02.08). In one transaction, or nothing: the GRN freezes the count as it stands with each line's findings and its
// number from the GRN series; one ledger request (stock-ledger 13.1) counts each line's received pieces into the
// Arrival's receiving location, cost Unknown and not accepted, owned as the brand's Agreement in force on the arrival
// date says, and holds them in the same request on the origins its counts make (stock-ledger 13.16): excess received
// under an excess hold, wrong goods in the wrong condition and unidentified goods in the unidentified condition, each in
// quarantine, damage under a damage hold; pieces not received create no custody. Then each damaged line's report is
// recorded on its hold by `stock` · documents (goods-in 8.5); each held line asks a Booking approver for its decision
// through `access` (goods-in 4.6); the follow-ups reach Booking in My work: the GRN's shortage, each held line, and the
// extra pieces of each kind recorded as not received (goods-in 2, 4.5, 4.9). Against a booking, each line that
// delivers pieces links through `booking` to the booking line it matches, or goes to Booking for review, one follow-up
// a GRN (goods-in 3.7, 4.10; PRD-BKG-007; POL-05.08; S2-F02-T04). Locks follow stock-ledger 10.3: the authority rows at
// step 0 (the route's), the Arrival and the booking it names at step 1, the ledger's at steps 2 to 6, the GRN,
// damage-report and exception-code series at step 8; the version, the state and the gates are read again under them
// (PRD-INT-003).

export interface IssueDependencies extends AvailabilityDependencies {
  readonly audit: AuditInterface;
  readonly numbering: Pick<NumberingInterface, 'liveSeries' | 'seriesLockTarget' | 'allocate'>;
  readonly ledger: StockLedgerInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly exceptions: Pick<ExceptionsInterface, 'codeSeriesTarget' | 'raise'>;
  readonly documents: Pick<StockDocumentsInterface, 'countDamageReady' | 'countDamageHold' | 'recordCountDamage'>;
  /** `booking`, whose receipt link each line of an Arrival against a booking takes (goods-in 3.7, 10.2). */
  readonly booking: Pick<BookingInterface, 'bookingLockTarget' | 'receiptsAtIssue' | 'linkReceiptsAtIssue'>;
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

/** One line of the GRN being issued: its count line, its identifier, its number, its findings and its origin. */
interface IssuedLine {
  readonly line: CurrentLine;
  readonly id: string;
  readonly lineNumber: number;
  readonly findings: LineFindings;
  /** The receipt origin its count makes, named by `receiving` so its holds name it (13.16); none when none received. */
  readonly originId: string | null;
}

/** The condition a line's received goods are counted in (stock-ledger 2.3, 13.16; goods-in 4.4). */
function conditionOf(line: CurrentLine): Extract<Condition, 'good' | 'wrong' | 'unidentified'> {
  return line.entry.goods === 'on-invoice' ? 'good' : line.entry.goods;
}

/** The goods a line's count makes, named by their origin for the holds of the same request (13.15, 13.16). */
function goodsOf(issued: IssuedLine, quantity: number): NamedGoods {
  if (issued.originId === null) throw new CommandDefect('A hold on a line that received nothing');
  const { skuId } = issued.line.entry;
  return skuId === null
    ? { skuId: null, receiptOriginId: issued.originId, quantity }
    : { skuId, receiptOriginId: issued.originId, quantity };
}

/** The receipt count of one line's received pieces (stock-ledger 13.4, 13.14, 13.16; goods-in 4.5). */
function receiptCount(row: ArrivalRow, issued: IssuedLine, owner: Owner): LedgerItem {
  const { entry } = issued.line;
  if (issued.originId === null) throw new CommandDefect('A receipt count of nothing received');
  // A known product; goods of a product not yet set up with their identity as described; or unidentified goods with no
  // identity at all: the last two counted under the Arrival's brand, so a person scoped to it sees them before PT
  // approval names their SKU (stock-ledger 13.14, 13.16; RR-555).
  const goods =
    entry.skuId !== null
      ? { skuId: entry.skuId }
      : {
          skuId: null,
          described:
            entry.goods === 'unidentified' || entry.styleCode === null
              ? null
              : { styleCode: entry.styleCode, colour: entry.colour, size: entry.size?.code ?? null },
          brandId: row.brandId,
        };
  return {
    kind: 'receipt-count',
    lineId: issued.id,
    receiptOriginId: issued.originId,
    ...goods,
    quantity: issued.findings.received,
    to: { siteId: row.siteId, businessUnitId: row.businessUnitId, locationId: row.receivingLocationId },
    condition: conditionOf(issued.line),
    owner,
    ...(entry.batch === null ? {} : { batch: { ...entry.batch } }),
  };
}

/** Each lock target once, for the one call at step 8 (code-house-rules 8.2). */
function once(targets: readonly LockTarget[]): LockTarget[] {
  const seen = new Map<string, LockTarget>();
  for (const target of targets) seen.set(`${target.table.schema}.${target.table.table}:${target.id}`, target);
  return [...seen.values()];
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
  // Step 1: the Arrival, read under its lock with every fact checked below, and the booking it names, fixed when the
  // Arrival was recorded, in the same call (code-house-rules 8.2; goods-in 3.7).
  const named = (await arrivalRow(context, arrivalId))?.bookingId ?? null;
  const found = await arrivalForChange(
    context,
    arrivalId,
    named === null ? [] : [dependencies.booking.bookingLockTarget(named)],
  );
  if (found.kind !== 'open') return found;
  const { row } = found;
  const newest = await newestChange(context, row.id);
  if (newest?.id !== draft.versionToken) {
    return refused('conflict', 'kernel.stale-version', [recordItem(ARRIVAL_TYPE, row.id)]);
  }
  const place = { siteId: row.siteId, businessUnitId: row.businessUnitId };
  const unavailable = receivingUnavailable(await receivingMissing(context, dependencies, place, date));
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

  const grnId = uuidv7();
  const issued: IssuedLine[] = lines.map((line, index) => {
    const findings = lineFindings({ ...line.entry, damagedQuantity: line.entry.damage?.quantity ?? null });
    return { line, id: uuidv7(), lineNumber: index + 1, findings, originId: findings.received > 0 ? uuidv7() : null };
  });
  // Against a booking: what each line that delivers pieces will do, read before the later locks, since nothing is
  // written until every lock is held (code-house-rules 8.2): link, or go to Booking for review (goods-in 3.7, 4.10).
  const against = row.bookingId === null ? undefined : receiptsOf(row, row.bookingId, grnId, issued);
  let reviewed = false;
  if (against !== undefined) {
    const planned = await dependencies.booking.receiptsAtIssue(context, against);
    if (planned.kind === 'refusal') return planned;
    reviewed = planned.answer.some((each) => each.kind === 'review');
  }
  const damaged = issued.filter((each) => each.line.entry.damage !== null);
  const held = issued.filter((each) => each.findings.held !== null);
  const short = issued.filter((each) => each.findings.shortage > 0);
  // The kinds of extra pieces the count records as not received: no custody, but a follow-up all the same (4.4, 4.5).
  const notReceived = [
    ...new Set(
      issued
        .filter((each) => each.findings.extra > 0 && each.findings.held === null)
        .map((each) => extraKindOf(each.line)),
    ),
  ];

  // Before any lock above step 1: damage reports available at the unit, with their series (goods-in 4.9, 8.5), and
  // the exception-code series of the follow-ups (access-and-approvals 12.1).
  const stepEight: LockTarget[] = [dependencies.numbering.seriesLockTarget(series.seriesId)];
  let damageSeriesId: string | undefined;
  if (damaged.length > 0) {
    const ready = await dependencies.documents.countDamageReady(context, place);
    if (ready.kind === 'refusal') return ready;
    damageSeriesId = ready.answer.seriesId;
    stepEight.push(...ready.answer.series);
  }
  if (held.length > 0 || short.length > 0 || notReceived.length > 0 || reviewed) {
    const codes = await dependencies.exceptions.codeSeriesTarget(context);
    if (codes.kind === 'refused') return refusalOf(codes.refusal);
    stepEight.push(codes.value);
  }

  // The owner each receipt origin records: the brand's Agreement version in force on the arrival date (PRD-ORG-014).
  const terms = await termsInForce(context, { brandId: row.brandId }, row.arrivalDate, SHOW_MARGINS);
  const agreement =
    terms === undefined ? undefined : { versionId: terms.versionId, brandId: row.brandId, terms: terms.terms };
  const owner = receiptOwner(agreement, row.legalEntityId);

  // The GRN's one ledger request: the receipt counts first, then the holds on the origins they make (13.16).
  const at = { siteId: row.siteId, businessUnitId: row.businessUnitId, locationId: row.receivingLocationId };
  const items: LedgerItem[] = issued
    .filter((each) => each.originId !== null)
    .map((each) => receiptCount(row, each, owner));
  const holdItems: { readonly issued: IssuedLine; readonly kind: 'held' | 'damage'; readonly index: number }[] = [];
  for (const each of held) {
    const part = each.findings.held;
    if (part === null) throw new CommandDefect('A held line with nothing held');
    holdItems.push({ issued: each, kind: 'held', index: items.length });
    items.push({
      kind: 'place-hold',
      lineId: each.id,
      holdKind: part.kind === 'excess' ? 'excess' : 'quarantine',
      reason: HOLD_REASONS[part.kind],
      at,
      condition: conditionOf(each.line),
      goods: [goodsOf(each, part.quantity)],
    });
  }
  for (const each of damaged) {
    const damage = each.line.entry.damage;
    if (damage === null) continue;
    holdItems.push({ issued: each, kind: 'damage', index: items.length });
    // On the goods in the condition the count receives them in, held or not (stock-ledger 13.17; RR-571).
    items.push(
      dependencies.documents.countDamageHold(
        each.id,
        at,
        goodsOf(each, damage.quantity),
        damage.description,
        conditionOf(each.line),
      ),
    );
  }
  let holdIds: readonly string[] = [];
  let values: readonly ItemValue[] = [];
  let movementIds: readonly string[] = [];
  if (items.length === 0) {
    // Nothing counted is received, as a delivery short of every piece is: no custody, so no ledger request (4.4).
    await context.lock(LOCK_STEP.numberSeries, once(stepEight));
  } else {
    const planned = await dependencies.ledger.plan(context, {
      source: {
        module: RECEIVING_MODULE,
        recordType: GRN_SOURCE_TYPE,
        recordId: grnId,
        versionId: grnId,
        importKind: 'none',
      },
      actor: { kind: 'user', userId: actor.userId, roleAssignmentId: actor.roleAssignmentId },
      items,
      idempotencyKey,
    });
    if (planned.kind === 'refused') return refusalOf(planned.refusal);
    const locked = await dependencies.ledger.lock(context, planned.value);
    const periods = await dependencies.ledger.holdPeriods(context, planned.value);
    if (periods.kind === 'refused') return refusalOf(periods.refusal);
    await context.lock(LOCK_STEP.numberSeries, once([...periods.value, ...stepEight]));
    const checked = await dependencies.ledger.recheck(context, locked);
    if (checked.kind === 'refused') return refusalOf(checked.refusal);
    const written = await dependencies.ledger.write(context, checked.value, { kind: 'screen' });
    if (written.kind === 'refused') return refusalOf(written.refusal);
    // The holds are written in the order of their items, and nothing of this request releases one (13.16).
    holdIds = written.value.holdIds;
    if (holdIds.length !== holdItems.length) throw new CommandDefect('A GRN wrote another number of holds');
    values = checked.value.itemValues;
    movementIds = written.value.movementIds;
  }
  const holdOf = (index: number) => {
    const position = holdItems.findIndex((each) => each.index === index);
    const holdId = holdIds[position];
    const value = values[index];
    if (holdId === undefined || value === undefined) throw new CommandDefect('A GRN hold was not written');
    return { holdId, value };
  };

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

  // The damage the count found, each line's report on its hold, reported by whoever issues the GRN (goods-in 8.5).
  const reports = new Map<string, string>();
  if (damageSeriesId !== undefined) {
    const recorded = await dependencies.documents.recordCountDamage(context, actor, {
      seriesId: damageSeriesId,
      place: {
        scope: scopeColumns(row),
        mappingVersionId: row.mappingVersionId,
        locationId: row.receivingLocationId,
      },
      lines: holdItems
        .filter((each) => each.kind === 'damage')
        .map((each) => {
          const damage = each.issued.line.entry.damage;
          if (damage === null || each.issued.originId === null) throw new CommandDefect('A damage hold of no damage');
          return {
            grnLineId: each.issued.id,
            receiptOriginId: each.issued.originId,
            skuId: each.issued.line.entry.skuId,
            condition: conditionOf(each.issued.line),
            ...holdOf(each.index),
            quantity: damage.quantity,
            description: damage.description,
            photo: damage.photo,
          };
        }),
      idempotencyKey,
    });
    if (recorded.kind === 'refusal') return recorded;
    for (const report of recorded.answer) reports.set(report.grnLineId, report.damageReportId);
  }

  await context.tx.insert(grnLine).values(
    issued.map(({ line, id, lineNumber }) => ({
      id,
      grnId,
      lineNumber,
      countEntryId: line.entry.id,
      ...scopeColumns(row),
      ...grnLineContentColumns(contentOf(line.entry)),
      damageReportId: reports.get(id) ?? null,
      countedByUserIds: [...line.countedBy],
    })),
  );

  // Against a booking, each line that delivers pieces links to the booking line it matches through `booking`'s receipt
  // link, signed by whoever issues the GRN, or goes to Booking for review; its outcome is kept on the GRN (goods-in
  // 3.7, 4.10; PRD-BKG-007; POL-05.08).
  let reviews = 0;
  if (against !== undefined) {
    const linked = await dependencies.booking.linkReceiptsAtIssue(context, actor, against);
    if (linked.kind === 'refusal') return linked;
    if (linked.answer.some((each) => each.kind === 'review') !== reviewed) {
      throw new CommandDefect('A GRN line linked otherwise than planned under the same lock');
    }
    if (linked.answer.length > 0) {
      await context.tx.insert(grnLineBooking).values(
        linked.answer.map((each) => ({
          id: uuidv7(),
          grnId,
          grnLineId: each.grnLineId,
          ...scopeColumns(row),
          bookingId: against.bookingId,
          outcome: each.kind,
          reason: each.kind === 'review' ? each.reason : null,
          bookingLineKey: each.lineKey,
          receiptLinkId: each.kind === 'linked' ? each.linkId : null,
        })),
      );
    }
    reviews = linked.answer.filter((each) => each.kind === 'review').length;
  }

  // Each held line, its first version and its decision's request, from a Booking approver who neither counted the
  // goods nor issued the GRN (goods-in 4.6; PRD-REC-013, POL-02.07), on their cost, Unknown before their PT
  // (PRD-DMG-005; DM-8).
  const facts = factsOf(row);
  const heldLines: {
    readonly id: string;
    readonly kind: keyof typeof EXTRA_EXCEPTION_TYPES;
    readonly versionId: string;
  }[] = [];
  for (const each of holdItems.filter((item) => item.kind === 'held')) {
    const { issued: line } = each;
    const heldPart = line.findings.held;
    if (heldPart === null || line.originId === null) throw new CommandDefect('A held line with nothing held');
    const heldLineId = uuidv7();
    const versionId = uuidv7();
    await context.tx.insert(heldLine).values({
      id: heldLineId,
      grnId,
      grnLineId: line.id,
      ...scopeColumns(row),
      kind: heldPart.kind,
      quantity: heldPart.quantity,
      receiptOriginId: line.originId,
      holdId: holdOf(each.index).holdId,
    });
    await context.tx.insert(heldLineVersion).values({
      id: versionId,
      heldLineId,
      versionNumber: 1,
      ...scopeColumns(row),
      kind: 'issued',
      preparedByUserId: actor.userId,
    });
    await dependencies.access.requestApproval(context, {
      actionType: HELD_LINE_DECISION,
      document: { module: RECEIVING_MODULE, recordType: HELD_LINE_TYPE, recordId: heldLineId, versionId },
      value: { kind: 'unknown' },
      preparers: receiversOfCountLine(line.line, actor),
      requestedBy: actor,
      facts,
    });
    heldLines.push({ id: heldLineId, kind: heldPart.kind, versionId });
  }

  // The follow-ups to Booking in My work, as the routing of each type at the Site names them (goods-in 2, 4.5, 4.9;
  // POL-02.16; PRD-EXC-001): the GRN's shortage; each held line, until its goods are taken in; and the extra pieces of
  // each kind recorded as not received, which stay on the GRN as a record.
  const exceptionFacts = exceptionFactsOf(row);
  const raisedBy = { kind: 'user' as const, id: actor.userId };
  if (short.length > 0) {
    const raised = await dependencies.exceptions.raise(context, {
      raisingEvent: `${SHORTAGE_EXCEPTION_TYPE}:${grnId}`,
      typeCode: SHORTAGE_EXCEPTION_TYPE,
      facts: exceptionFacts,
      links: [{ module: RECEIVING_MODULE, recordType: GRN_TYPE, recordId: grnId, versionId: null }],
      exposure: { kind: 'unknown' },
      raisedBy,
      roleAssignmentId: actor.roleAssignmentId,
    });
    if (raised.kind === 'refused') return refusalOf(raised.refusal);
  }
  for (const kind of notReceived) {
    const typeCode = EXTRA_EXCEPTION_TYPES[kind];
    const raised = await dependencies.exceptions.raise(context, {
      raisingEvent: `${typeCode}:${grnId}`,
      typeCode,
      facts: exceptionFacts,
      links: [{ module: RECEIVING_MODULE, recordType: GRN_TYPE, recordId: grnId, versionId: null }],
      exposure: { kind: 'unknown' },
      raisedBy,
      roleAssignmentId: actor.roleAssignmentId,
    });
    if (raised.kind === 'refused') return refusalOf(raised.refusal);
  }
  // The lines sent to Booking for review, one follow-up a GRN, linking to it (goods-in 2, 3.7, 4.10).
  if (reviews > 0) {
    const raised = await dependencies.exceptions.raise(context, {
      raisingEvent: `${BOOKING_REVIEW_EXCEPTION_TYPE}:${grnId}`,
      typeCode: BOOKING_REVIEW_EXCEPTION_TYPE,
      facts: exceptionFacts,
      links: [{ module: RECEIVING_MODULE, recordType: GRN_TYPE, recordId: grnId, versionId: null }],
      exposure: { kind: 'unknown' },
      raisedBy,
      roleAssignmentId: actor.roleAssignmentId,
    });
    if (raised.kind === 'refused') return refusalOf(raised.refusal);
  }
  for (const each of heldLines) {
    const typeCode = EXTRA_EXCEPTION_TYPES[each.kind];
    const raised = await dependencies.exceptions.raise(context, {
      raisingEvent: `${typeCode}:${each.id}`,
      typeCode,
      facts: exceptionFacts,
      links: [{ module: RECEIVING_MODULE, recordType: HELD_LINE_TYPE, recordId: each.id, versionId: each.versionId }],
      exposure: { kind: 'unknown' },
      raisedBy,
      roleAssignmentId: actor.roleAssignmentId,
    });
    if (raised.kind === 'refused') return refusalOf(raised.refusal);
  }

  await audited(context, dependencies.audit, actor, row, {
    record: { type: GRN_TYPE, id: grnId },
    operation: 'issue-grn',
    changes: [
      valueChange('arrivalId', null, row.id),
      valueChange('number', null, allocated.value.formattedText),
      valueChange('lines', null, issued.length),
      valueChange('owner', null, { ...ownerColumns(owner) }),
      valueChange('agreementVersionId', null, agreement?.versionId ?? null),
      valueChange('movements', null, [...movementIds]),
      valueChange('holds', null, [...holdIds]),
      valueChange(
        'heldLines',
        null,
        heldLines.map((each) => each.id),
      ),
      valueChange('damageReports', null, [...reports.values()]),
      valueChange('bookingId', null, row.bookingId),
      valueChange('bookingReviews', null, reviews),
    ],
    idempotencyKey,
  });
  await context.publish(grnIssuedEvent, {
    subject: { module: RECEIVING_MODULE, recordType: GRN_TYPE, recordId: grnId },
    scope: facts,
    payload: { grnId, arrivalId: row.id },
  });
  return { kind: 'success', answer: { grnId, number: allocated.value.formattedText } };
}

/**
 * The lines of a GRN that deliver pieces, against the booking its Arrival names (goods-in 3.6, 3.7, 4.10): each with
 * the goods it counted, as the booking line is matched on them, and the pieces it received, in any condition, never
 * those recorded as not received; unidentified goods carry no identity, so they match no line. A line that received
 * nothing delivers nothing, so it neither links nor goes to review. **Design choice.**
 */
function receiptsOf(row: ArrivalRow, bookingId: string, grnId: string, issued: readonly IssuedLine[]): ReceiptsAtIssue {
  return {
    bookingId,
    grn: { grnId, siteId: row.siteId },
    delivery: { siteId: row.siteId, supplierPartyId: row.supplierPartyId, arrivalDate: row.arrivalDate },
    receipts: issued
      .filter((each) => each.findings.received > 0)
      .map((each) => {
        const { entry } = each.line;
        return {
          grnLineId: each.id,
          goods:
            entry.goods === 'unidentified' || entry.styleCode === null
              ? null
              : { styleCode: entry.styleCode, colour: entry.colour, size: entry.size?.code ?? null },
          quantity: each.findings.received,
        };
      }),
  };
}

/**
 * Whoever received a count line's goods: everyone who counted it, and whoever issues the GRN (goods-in 4.3, 4.6;
 * PRD-REC-013).
 */
function receiversOfCountLine(line: CurrentLine, actor: Actor): string[] {
  return [...new Set([...line.countedBy, actor.userId])];
}

/** The kind of a line's extra pieces: excess for goods on the invoice, else what the goods are (goods-in 4.4). */
function extraKindOf(line: CurrentLine): keyof typeof EXTRA_EXCEPTION_TYPES {
  return line.entry.goods === 'on-invoice' ? 'excess' : line.entry.goods;
}

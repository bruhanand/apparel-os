import type {
  Arrival,
  ArrivalDraft,
  CountLineDraft,
  CountLineRemoval,
  GrnBookingLinksDraft,
  GrnIssue,
  HeldLineProductDraft,
  HeldLineRead,
  Inbox,
  InboxQuery,
  InvoiceDraft,
  PhotosDraft,
  RecountDraft,
  RecountRead,
} from '@apparel-os/schemas';
import type { LockTarget, TransactionContext } from '../../kernel/index.js';
import type { AccessInterface, RecordFacts } from '../access/index.js';
import type { AuditInterface } from '../audit/index.js';
import type { BookingInterface } from '../booking/index.js';
import type { ConfigurationInterface } from '../configuration/index.js';
import type { ExceptionsInterface } from '../exceptions/index.js';
import type { FilesImportsInterface } from '../files-imports/index.js';
import type { NumberingInterface } from '../numbering/index.js';
import { unitReadiness } from '../organisation/index.js';
import type { StockDocumentsInterface } from '../stock/documents/index.js';
import type { StockLedgerInterface } from '../stock/ledger/index.js';
import { attachPhotos, recordArrival, recordInvoice } from './commands/arrival.js';
import { arrivalRow, entriesOf, factsOf, type Actor } from './commands/common.js';
import { removeCountLine, saveCountLine } from './commands/count.js';
import { nameHeldLineProduct } from './commands/name-held-line-product.js';
import { issueGrn } from './commands/issue.js';
import { linkToBooking } from './commands/link-to-booking.js';
import { clearPtMark, type PtMarkClearReason } from './commands/clear-pt-mark.js';
import { proposeRecount } from './commands/propose-recount.js';
import { ptMarkLock, type PtMarkChange } from './commands/pt-mark.js';
import { setPtMark } from './commands/set-pt-mark.js';
import { grnRow } from './queries/grns.js';
import { grnForPt, ptMarkOf, type GrnForPt, type PtMark } from './queries/pt-mark.js';
import { currentLines } from './domain/lines.js';
import {
  arrivalFacts,
  arrivalView,
  grnBookingLinksOf,
  inboxOf,
  peopleOf,
  type GrnBookingLinks,
} from './queries/arrivals.js';
import { recountFacts, recountPanelOf } from './queries/recounts.js';
import {
  grnLineViews,
  heldLineFacts,
  heldLineView,
  linesOfGrn,
  ptBasisOf,
  receiptProblems,
  type PtBasis,
  type ReceiptProblemsQuery,
  type Requests,
} from './queries/held-lines.js';

export interface ReceivingDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'authorise' | 'requestApproval' | 'requestLockTargets'>;
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  readonly numbering: Pick<NumberingInterface, 'liveSeries' | 'seriesLockTarget' | 'allocate'>;
  readonly ledger: StockLedgerInterface;
  readonly exceptions: Pick<ExceptionsInterface, 'codeSeriesTarget' | 'raise'>;
  /** `stock` · documents, which raises the damage reports at the count (goods-in 10.2). */
  readonly documents: Pick<
    StockDocumentsInterface,
    'countDamageReady' | 'countDamageHold' | 'recordCountDamage' | 'damageOfGrnLines'
  >;
  /** `booking`, whose bookings an Arrival is received against and whose receipt links its GRN lines take (10.2). */
  readonly booking: Pick<
    BookingInterface,
    | 'bookingFacts'
    | 'bookingLockTarget'
    | 'receivableBooking'
    | 'receiptsAtIssue'
    | 'linkReceiptsAtIssue'
    | 'linkReceiptsLater'
    | 'receiptsOfGrnLines'
    | 'grnLinesDelivering'
  >;
}

/**
 * What issuing a GRN needs besides create on the GRN itself (goods-in 4.9, 4.10, 8.5): create on damage reports while
 * the count holds damage, since the issuer reports it; and a grant on the booking the Arrival names, at its Site and
 * brand, since its receipt links are scoped as the booking is (3.10).
 */
export interface IssueNeeds {
  readonly damageReport: boolean;
  readonly bookingId: string | null;
}

/**
 * `receiving`'s interface (module-map section 5; goods-in 10.1): the Receive Goods inbox, the Arrival with its invoices
 * and photos, the count with its findings, the issue of a GRN with its holds, damage reports and follow-ups, the held
 * lines Booking decides, and what other modules read of a GRN (goods-in 4.1 to 4.6, 4.9, 5.1, 5.4, 9.3; S2-F02-T02,
 * S2-F02-T03). Every operation joins the caller's transaction through its context (code-house-rules 8.1); the caller
 * has authorised it. The services it acts through are handed to it; the masters of `organisation` and `merchandise` it
 * reads through their interfaces' read functions, as stage 1 modules do.
 */
export class Receiving {
  constructor(private readonly dependencies: ReceivingDependencies) {}

  /** The facts a new Arrival at the unit would carry, which its route authorises with; undefined for no such unit. */
  async newArrivalFacts(
    context: TransactionContext,
    businessUnitId: string,
    brandId: string,
    today: string,
  ): Promise<RecordFacts | undefined> {
    const unit = await unitReadiness(context, businessUnitId, today);
    if (unit === undefined) return undefined;
    return {
      siteId: unit.siteId,
      businessUnitId,
      brandId,
      ...(unit.storeId === null ? {} : { storeId: unit.storeId }),
      ...(unit.mapping.state === 'none' ? {} : { legalEntityId: unit.mapping.legalEntityId }),
    };
  }

  /** The facts of an Arrival the reader may see, which every route on it authorises with (5.3); else undefined. */
  arrivalFacts(context: TransactionContext, arrivalId: string): Promise<RecordFacts | undefined> {
    return arrivalFacts(context, arrivalId);
  }

  recordArrival(context: TransactionContext, actor: Actor, draft: ArrivalDraft) {
    return recordArrival(context, this.dependencies, actor, draft);
  }

  recordInvoice(context: TransactionContext, actor: Actor, arrivalId: string, draft: InvoiceDraft) {
    return recordInvoice(context, this.dependencies, actor, arrivalId, draft);
  }

  attachPhotos(context: TransactionContext, actor: Actor, arrivalId: string, draft: PhotosDraft) {
    return attachPhotos(context, this.dependencies, actor, arrivalId, draft);
  }

  saveCountLine(context: TransactionContext, actor: Actor, arrivalId: string, draft: CountLineDraft) {
    return saveCountLine(context, this.dependencies, actor, arrivalId, draft);
  }

  removeCountLine(
    context: TransactionContext,
    actor: Actor,
    arrivalId: string,
    lineId: string,
    draft: CountLineRemoval,
  ) {
    return removeCountLine(context, this.dependencies, actor, arrivalId, lineId, draft);
  }

  issueGrn(context: TransactionContext, actor: Actor, arrivalId: string, draft: GrnIssue, idempotencyKey: string) {
    return issueGrn(context, this.dependencies, actor, arrivalId, draft, idempotencyKey);
  }

  /**
   * What issuing the Arrival's GRN needs besides create on the GRN (goods-in 4.9, 4.10, 8.5): create on damage reports
   * while the count holds damage, since the issuer reports it; and the booking it names, fixed when it was recorded.
   * Read before any lock, for the route to authorise and hold: a line saved after this read changes the Arrival's
   * version, so the command refuses the issue as stale under the lock (code-house-rules 12.7), and the count it issues
   * is the one read here.
   */
  async issueAlsoNeeds(context: TransactionContext, arrivalId: string): Promise<IssueNeeds> {
    const row = await arrivalRow(context, arrivalId);
    if (row === undefined) return { damageReport: false, bookingId: null };
    const lines = currentLines(await entriesOf(context, row.id));
    return { damageReport: lines.some((line) => line.entry.damage !== null), bookingId: row.bookingId };
  }

  /**
   * The scope facts of a booking the reader may see, which receiving against it, and linking GRN lines to it later,
   * authorise with (goods-in 3.7, 4.10; access-and-approvals 5.3); undefined when the reader may not see it.
   */
  bookingFacts(context: TransactionContext, bookingId: string): Promise<RecordFacts | undefined> {
    return this.dependencies.booking.bookingFacts(context, bookingId);
  }

  /** The facts of a GRN's Arrival the reader may see, which a later booking link authorises with; else undefined. */
  async grnFacts(context: TransactionContext, grnId: string): Promise<RecordFacts | undefined> {
    const issued = await grnRow(context, grnId);
    if (issued === undefined) return undefined;
    const row = await arrivalRow(context, issued.arrivalId);
    return row === undefined ? undefined : factsOf(row);
  }

  /**
   * Booking's later link of GRN lines to the lines of one booking (goods-in 3.7, 4.10; PRD-BKG-008; POL-05.08): those
   * within the window and the outstanding link now; late or excess ones are proposed for a different person's approval.
   */
  linkToBooking(context: TransactionContext, actor: Actor, grnId: string, draft: GrnBookingLinksDraft) {
    return linkToBooking(context, this.dependencies, actor, grnId, draft);
  }

  /**
   * Proposes a recount of the GRN's lines with a reason, for a different person's approval (goods-in 4.7, 4.11;
   * PRD-REC-019): refused while the GRN's PT is attached, while another recount of it waits, and for a line a recount
   * does not change.
   */
  proposeRecount(context: TransactionContext, actor: Actor, grnId: string, draft: RecountDraft) {
    return proposeRecount(context, this.dependencies, actor, grnId, draft);
  }

  /** The facts of a recount the reader may see, which its read authorises with (5.3); else undefined. */
  recountFacts(context: TransactionContext, recountId: string): Promise<RecordFacts | undefined> {
    return recountFacts(context, recountId);
  }

  /** A recount with the GRN lines it names, as its approval's panel shows it (goods-in 4.11), or undefined. */
  async readRecount(
    context: TransactionContext,
    recountId: string,
    named: (userIds: readonly string[]) => Promise<ReadonlyMap<string, string>>,
    requests: Requests,
  ): Promise<Omit<RecountRead, 'asOf'> | undefined> {
    const panel = await recountPanelOf(context, recountId, requests, async (grnId, grnLineIds) => {
      const lines = (await linesOfGrn(context, grnId)).filter((line) => grnLineIds.includes(line.id));
      return grnLineViews(context, lines, requests);
    });
    if (panel === undefined) return undefined;
    const { recount } = panel;
    const names = await named([
      recount.proposedBy,
      ...(recount.decision === null ? [] : [recount.decision.decidedBy]),
      ...panel.lines.flatMap((line) => line.countedBy),
    ]);
    return { ...panel, people: [...names].map(([userId, name]) => ({ userId, name })) };
  }

  /** The facts of a held line the reader may see, which its routes authorise with (5.3); else undefined. */
  heldLineFacts(context: TransactionContext, heldLineId: string): Promise<RecordFacts | undefined> {
    return heldLineFacts(context, heldLineId);
  }

  /** Names the product of unidentified goods held at the count, before they are taken in (goods-in 4.6). */
  nameHeldLineProduct(context: TransactionContext, actor: Actor, heldLineId: string, draft: HeldLineProductDraft) {
    return nameHeldLineProduct(context, this.dependencies, actor, heldLineId, draft);
  }

  /**
   * One Arrival as the reader may see it, or undefined; `named` gives the names of the people it names, from
   * `access` (access-and-approvals 12.2), an unknown one left out; `requests` the latest request of each held line's
   * version.
   */
  async readArrival(
    context: TransactionContext,
    arrivalId: string,
    today: string,
    named: (userIds: readonly string[]) => Promise<ReadonlyMap<string, string>>,
    requests: Requests,
  ): Promise<Arrival | undefined> {
    const row = await arrivalRow(context, arrivalId);
    if (row === undefined) return undefined;
    const arrival = await arrivalView(context, this.dependencies, row, today, requests, (lineIds) =>
      this.dependencies.booking.receiptsOfGrnLines(context, lineIds),
    );
    const names = await named(peopleOf(arrival));
    return { ...arrival, people: [...names].map(([userId, name]) => ({ userId, name })) };
  }

  /** A held line with its GRN line, as its decision's panel shows it (goods-in 4.6), or undefined. */
  async readHeldLine(
    context: TransactionContext,
    heldLineId: string,
    named: (userIds: readonly string[]) => Promise<ReadonlyMap<string, string>>,
    requests: Requests,
  ): Promise<Omit<HeldLineRead, 'asOf'> | undefined> {
    const view = await heldLineView(context, heldLineId, requests);
    if (view === undefined) return undefined;
    const decidedBy = view.line.heldLine?.decision?.decidedBy;
    const names = await named([...view.line.countedBy, ...(decidedBy === undefined ? [] : [decidedBy])]);
    return { ...view, people: [...names].map(([userId, name]) => ({ userId, name })) };
  }

  /**
   * What `merchandise` · PT reads of a GRN before its PT (goods-in 5.1, 5.4): whether every held line and every damage
   * report on its lines is decided, and its good pieces per style and size. Undefined when the reader may not see it.
   */
  ptBasis(context: TransactionContext, grnId: string): Promise<PtBasis | undefined> {
    return ptBasisOf(context, grnId, (lineIds) => this.dependencies.documents.damageOfGrnLines(context, lineIds));
  }

  /**
   * The bookings the GRN's lines are linked to, as far as the reader may see them, each with its lines: what the PT
   * review shows (goods-in 6.2; code review 7 of stage 2).
   */
  grnBookingLinks(context: TransactionContext, grnId: string): Promise<GrnBookingLinks[]> {
    return grnBookingLinksOf(context, grnId, (lineIds) =>
      this.dependencies.booking.receiptsOfGrnLines(context, lineIds),
    );
  }

  /** The GRN as `merchandise` · PT names it, with its number and scope facts, or undefined (goods-in 5.7). */
  grnForPt(context: TransactionContext, grnId: string): Promise<GrnForPt | undefined> {
    return grnForPt(context, grnId);
  }

  /**
   * The GRN's row as a lock target, exclusively at step 1 (code-house-rules 8.2): what a caller of setPtMark or
   * clearPtMark locks with its own rows first, and what a recount locks (goods-in 4.7, 5.8).
   */
  ptMarkLock(grnId: string): LockTarget {
    return ptMarkLock(grnId);
  }

  /** The GRN's "PT attached" mark now, as the reader may see it (goods-in 5.8). */
  ptMark(context: TransactionContext, grnId: string): Promise<PtMark> {
    return ptMarkOf(context, grnId);
  }

  /**
   * Sets the GRN's "PT attached" mark for a PT revision submitted for it, under the GRN's lock the caller took; refused
   * while it is set (goods-in 5.1, 5.8; DEC-137).
   */
  setPtMark(context: TransactionContext, actor: Actor, change: PtMarkChange) {
    return setPtMark(context, this.dependencies.audit, actor, change);
  }

  /**
   * Clears the mark the PT revision set: its draft withdrawn, or, with S2-F06-T01 and S2-F09-T01, the PT rejected or
   * reversed (goods-in 5.8).
   */
  clearPtMark(
    context: TransactionContext,
    actor: Actor,
    change: PtMarkChange & { readonly reason: PtMarkClearReason },
  ) {
    return clearPtMark(context, this.dependencies.audit, actor, change);
  }

  /** The receipt problems read model of the stage 2 report (goods-in 9.3), as the reader may see it. */
  receiptProblems(context: TransactionContext, query: ReceiptProblemsQuery, requests: Requests) {
    return receiptProblems(context, query, requests);
  }

  /** The Receive Goods inbox of a Site (goods-in 4.1), or undefined when no Site has the identifier. */
  inbox(
    context: TransactionContext,
    siteId: string,
    query: InboxQuery,
    today: string,
    covered: (facts: readonly RecordFacts[]) => Promise<readonly boolean[]>,
  ): Promise<Omit<Inbox, 'asOf'> | undefined> {
    return inboxOf(context, this.dependencies, siteId, query, today, covered, (lineIds) =>
      this.dependencies.documents.damageOfGrnLines(context, lineIds),
    );
  }
}

export type ReceivingInterface = Receiving;

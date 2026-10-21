import type {
  Arrival,
  ArrivalDraft,
  CountLineDraft,
  CountLineRemoval,
  GrnIssue,
  Inbox,
  InboxQuery,
  InvoiceDraft,
  PhotosDraft,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../kernel/index.js';
import type { AccessInterface, RecordFacts } from '../access/index.js';
import type { AuditInterface } from '../audit/index.js';
import type { ConfigurationInterface } from '../configuration/index.js';
import type { FilesImportsInterface } from '../files-imports/index.js';
import type { NumberingInterface } from '../numbering/index.js';
import { unitReadiness } from '../organisation/index.js';
import type { StockLedgerInterface } from '../stock/ledger/index.js';
import { attachPhotos, recordArrival, recordInvoice } from './commands/arrival.js';
import { arrivalRow, type Actor } from './commands/common.js';
import { removeCountLine, saveCountLine } from './commands/count.js';
import { issueGrn } from './commands/issue.js';
import { arrivalFacts, arrivalView, inboxOf, peopleOf } from './queries/arrivals.js';

export interface ReceivingDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'authorise'>;
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  readonly numbering: Pick<NumberingInterface, 'liveSeries' | 'seriesLockTarget' | 'allocate'>;
  readonly ledger: StockLedgerInterface;
}

/**
 * `receiving`'s interface (module-map section 5; goods-in 10.1): in its first piece the Receive Goods inbox, the
 * Arrival with its invoices and photos, the count and the issue of a GRN whose lines match their invoice quantities
 * (goods-in 4.1 to 4.5; S2-F02-T02). Every operation joins the caller's transaction through its context
 * (code-house-rules 8.1); the caller has authorised it. The services it acts through are handed to it; the masters of
 * `organisation` and `merchandise` it reads through their interfaces' read functions, as stage 1 modules do.
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
   * One Arrival as the reader may see it, or undefined; `named` gives the names of the people it names, from
   * `access` (access-and-approvals 12.2), an unknown one left out.
   */
  async readArrival(
    context: TransactionContext,
    arrivalId: string,
    today: string,
    named: (userIds: readonly string[]) => Promise<ReadonlyMap<string, string>>,
  ): Promise<Arrival | undefined> {
    const row = await arrivalRow(context, arrivalId);
    if (row === undefined) return undefined;
    const arrival = await arrivalView(context, this.dependencies, row, today);
    const names = await named(peopleOf(arrival));
    return { ...arrival, people: [...names].map(([userId, name]) => ({ userId, name })) };
  }

  /** The Receive Goods inbox of a Site (goods-in 4.1), or undefined when no Site has the identifier. */
  inbox(
    context: TransactionContext,
    siteId: string,
    query: InboxQuery,
    today: string,
    covered: (facts: readonly RecordFacts[]) => Promise<readonly boolean[]>,
  ): Promise<Omit<Inbox, 'asOf'> | undefined> {
    return inboxOf(context, this.dependencies, siteId, query, today, covered);
  }
}

export type ReceivingInterface = Receiving;

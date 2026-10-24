import { PT_IMPORT_TARGET, type FieldClass, type PtReversalDraft } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, LatestRequest, RecordFacts } from '../../access/index.js';
import type { AuditActor, AuditInterface } from '../../audit/index.js';
import type { ConfigurationInterface } from '../../configuration/index.js';
import type { ExceptionsInterface } from '../../exceptions/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import type { StockLedgerInterface } from '../../stock/ledger/index.js';
import type { FilesImportsInterface, HandlerBatch, ImportHandler } from '../../files-imports/index.js';
import type { ReceivingInterface } from '../../receiving/index.js';
import { downloadPt, type DownloadReader } from './commands/download-pt.js';
import { ptImportHandler } from './commands/import-pt.js';
import { withdrawPt, type Actor } from './commands/withdraw-pt.js';
import { postAgain } from './commands/post-again.js';
import { proposeReversal } from './commands/propose-reversal.js';
import { postRequested, type PtPostingPublisher, type PtPostingServices } from './commands/post-requested.js';
import { raiseForFailure } from './commands/raise-posting-refused.js';
import type { PtPosting } from './jobs/posting.js';
import { grnPtView } from './queries/grn-pt.js';
import { revisionReview, type RevisionPage } from './queries/revision.js';
import { ptPreviewOf, type PreviewPage } from './queries/preview.js';
import { revisionFacts } from './queries/pt-records.js';
import { readPtReversal, reversalFacts } from './queries/reversal.js';
import { templateListsOf } from './queries/template-lists.js';

export interface PtDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<
    AccessInterface,
    | 'requestApproval'
    | 'requestLockTargets'
    | 'withdrawRequest'
    | 'verifyUnderLock'
    | 'recordUse'
    | 'authorise'
    | 'approvalLockTargets'
    | 'approvalRequestsOf'
    | 'partyNames'
  >;
  readonly receiving: Pick<
    ReceivingInterface,
    'ptBasis' | 'grnForPt' | 'ptMark' | 'ptMarkLock' | 'setPtMark' | 'clearPtMark' | 'grnBookingLinks' | 'anyAccepted'
  >;
  readonly files: Pick<FilesImportsInterface, 'handlerBatch' | 'blankTemplate' | 'filledTemplate'>;
  /** What a PT's approval posts through (goods-in 6.3; S2-F06-T01): the gate, the ledger and the number series. */
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
  readonly ledger: StockLedgerInterface;
  readonly numbering: Pick<NumberingInterface, 'liveSeries' | 'seriesLockTarget' | 'allocate'>;
  /** Where a refused posting's unfinished-operation exception is raised (books-and-posting 10 step 3; code review 7). */
  readonly exceptions: Pick<ExceptionsInterface, 'raiseInOwnCommand'>;
}

/**
 * `merchandise` · PT's interface (module-map section 5; goods-in 5, 10.1; S2-F04-T02): the PT import handler, which
 * the module registers with `files-imports` at start; a GRN's PT with its mark and revisions; the preview of an
 * uploaded file; the withdrawal of a draft; and the blank template with its lists. Every operation joins the caller's
 * transaction through its context (code-house-rules 8.1); the caller has authorised it. Its approval rule reaches
 * `access` through the composition root (ptApprovals; access-and-approvals 9.8b). It reads `receiving` through its
 * interface (goods-in 10.2) and the catalogue through its read functions.
 */
export class Pt implements PtPosting {
  constructor(private readonly dependencies: PtDependencies) {}

  /** The PT import handler (imports-and-opening-data 13.2; goods-in 5). */
  importHandler(): ImportHandler {
    return ptImportHandler(this.dependencies);
  }

  /** The GRN's facts, as the reader may see it, which a route on its PT authorises with; else undefined. */
  async grnFacts(context: TransactionContext, grnId: string): Promise<RecordFacts | undefined> {
    return (await this.dependencies.receiving.grnForPt(context, grnId))?.facts;
  }

  /** A revision's PT and facts, as the reader may see it, which its routes authorise with; else undefined. */
  revisionFacts(context: TransactionContext, revisionId: string) {
    return revisionFacts(context, revisionId);
  }

  /** The PT of a GRN as its screen reads it, or undefined when the reader may not see the GRN (goods-in 5.7, 5.8). */
  grnPt(
    context: TransactionContext,
    grnId: string,
    requests: (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>,
    masked: ReadonlySet<FieldClass>,
  ) {
    return grnPtView(context, this.dependencies.receiving, grnId, requests, masked);
  }

  /** A batch of the PT target as its owner reads it, or undefined when the reader may not see it. */
  handlerBatch(context: TransactionContext, batchId: string): Promise<HandlerBatch | undefined> {
    return this.dependencies.files.handlerBatch(context, batchId);
  }

  /** The preview of an uploaded PT file (goods-in 5.6), or undefined when the batch is no PT file's. */
  preview(context: TransactionContext, batch: HandlerBatch, page: PreviewPage, masked: ReadonlySet<FieldClass>) {
    return ptPreviewOf(context, this.dependencies.receiving, batch, page, masked);
  }

  /**
   * The services a revision's decision acts through (goods-in 6.3; access-and-approvals 9.8b), which the composition
   * root hands the decision's effect when it runs (ptApprovals).
   */
  decisionServices(): PtPostingServices {
    const { audit, access, receiving, configuration, ledger, numbering, exceptions } = this.dependencies;
    return { audit, access, receiving, configuration, ledger, numbering, exceptions };
  }

  /**
   * The posting job's step of a large PT's approval (goods-in 6.6; stock-ledger 10.6): posts the revision a request
   * names, or writes why it could not (commands/post-requested.ts).
   */
  postRequested(context: TransactionContext, publisher: PtPostingPublisher, postRequestId: string) {
    return postRequested(context, this.decisionServices(), publisher, postRequestId);
  }

  /** The unfinished-operation exception of a queued posting's failure, raised by its consumer (code review 7). */
  raisePostingFailure(context: TransactionContext, raisedBy: AuditActor, failureId: string) {
    return raiseForFailure(context, this.dependencies.exceptions, raisedBy, failureId);
  }

  /**
   * Posts a failed PT again once its cause is fixed: a further request naming the same decision (goods-in 6.6;
   * access-and-approvals 9.8 step 5; books-and-posting 10 step 5; commands/post-again.ts).
   */
  postAgain(context: TransactionContext, actor: Actor, revisionId: string) {
    return postAgain(context, this.dependencies, actor, revisionId);
  }

  /** A PT revision as its approver reviews it and its GRN's screen shows it (goods-in 6.2, 6.6), or undefined. */
  revision(
    context: TransactionContext,
    revisionId: string,
    request: LatestRequest | undefined,
    page: RevisionPage,
    masked: ReadonlySet<FieldClass>,
  ) {
    return revisionReview(context, this.dependencies.receiving, revisionId, request, page, masked);
  }

  /**
   * An Official PT as an XLSX file in its template's columns, with the access record of each restricted class it
   * carries, cost and margin left out where masked (goods-in 6.5, 6.6; numbering-and-audit 5.1), or the refusal.
   */
  download(context: TransactionContext, reader: DownloadReader, revisionId: string, masked: ReadonlySet<FieldClass>) {
    return downloadPt(context, this.dependencies, reader, revisionId, masked);
  }

  /** Proposes the reversal of an Official PT revision before the scan-in, with a reason (goods-in 6.4, 6.7). */
  proposeReversal(context: TransactionContext, actor: Actor, revisionId: string, draft: PtReversalDraft) {
    return proposeReversal(context, this.dependencies, actor, revisionId, draft);
  }

  /** A reversal's scope facts, as the reader may see it, which its routes authorise with; else undefined. */
  reversalFacts(context: TransactionContext, reversalId: string) {
    return reversalFacts(context, reversalId);
  }

  /**
   * A reversal as its approver reads it in My work (goods-in 6.7, section 11), read as the reader: not found for one
   * they may not see; refused without view on the PT.
   */
  readReversal(context: TransactionContext, actorId: string, reversalId: string) {
    return readPtReversal(context, this.dependencies, actorId, reversalId);
  }

  /** Withdraws a draft PT revision (goods-in 5.7). */
  withdraw(context: TransactionContext, actor: Actor, revisionId: string, versionToken: string) {
    return withdrawPt(context, this.dependencies, actor, revisionId, versionToken);
  }

  /**
   * The blank template of a Confirmed PT layout version with the lists its values must be on (goods-in section 11), its
   * lists sheet named as the screen asks; undefined when the layout version is no Confirmed PT layout.
   */
  async template(
    context: TransactionContext,
    request: { readonly layoutVersionId: string; readonly listsSheet: string; readonly date: string },
  ): Promise<{ readonly fileName: string; readonly bytes: Buffer } | CommandRefusal | undefined> {
    const lists = await templateListsOf(context, request.date);
    if ('code' in lists) return lists;
    return this.dependencies.files.blankTemplate(context, {
      layoutVersionId: request.layoutVersionId,
      target: PT_IMPORT_TARGET,
      listsSheet: request.listsSheet,
      lists,
    });
  }
}

export type PtInterface = Pt;

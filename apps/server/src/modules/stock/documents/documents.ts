import type {
  DamageDecisionRenewal,
  DamagedGoods,
  DamageReport,
  DamageReportDraft,
  DamageReversalDraft,
} from '@apparel-os/schemas';
import { DAMAGE_REPORT_TYPE } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, LatestRequest, RecordFacts } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { ConfigurationInterface } from '../../configuration/index.js';
import type { ExceptionsInterface, ExceptionTypeRegistration } from '../../exceptions/index.js';
import type { FilesImportsInterface } from '../../files-imports/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import {
  sourceOfLine,
  type LedgerItem,
  type LineSource,
  type NamedGoods,
  type Place,
  type StockLedgerInterface,
} from '../ledger/index.js';
import { proposeReversal } from './commands/propose-reversal.js';
import { renewDecision } from './commands/renew-decision.js';
import type { Actor } from './commands/common.js';
import { countDamageReady } from './commands/count-damage-ready.js';
import { recordCountDamage } from './commands/record-count-damage.js';
import { newReportFacts, reportDamage, type ReportOptions } from './commands/report.js';
import { damageOfGrnLines, type GrnLineDamage } from './queries/grn-lines.js';
import type { ReportedCondition } from './domain/goods.js';
import { damageHoldItem } from './domain/items.js';
import { DAMAGE_EXCEPTION_TYPE, DOCUMENTS_MODULE } from './domain/kinds.js';
import { damageDecided, reportFacts, reportOfReversal, reportView } from './queries/reports.js';

export interface StockDocumentsDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'requestLockTargets'>;
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  readonly numbering: Pick<NumberingInterface, 'liveSeries' | 'seriesLockTarget' | 'allocate'>;
  readonly ledger: StockLedgerInterface;
  readonly exceptions: Pick<ExceptionsInterface, 'codeSeriesTarget' | 'raise'>;
}

/**
 * The exception a damage report raises (goods-in 8.2; access-and-approvals 12.1, 12.4; PRD-EXC-001): of the category
 * damage, linking to the report, routed to Operations as its routing at the Site says (POL-02.16). It closes once the
 * report is decided, confirmed or rejected (PRD-EXC-002). Its evidence carries no restricted class (RR-453).
 */
export const damageExceptionType: ExceptionTypeRegistration = {
  code: DAMAGE_EXCEPTION_TYPE,
  category: 'damage',
  module: DOCUMENTS_MODULE,
  linksTo: [DAMAGE_REPORT_TYPE],
  evidenceClasses: [],
  resolutionCheck: damageDecided,
};

/**
 * `stock` · documents' interface (module-map section 5; goods-in 8, 10.1, 10.2): in its first piece the damage reports
 * (S2-F08-T01). Every operation joins the caller's transaction through its context (code-house-rules 8.1); the caller
 * has authorised it.
 *
 * **The interface `receiving` calls** (goods-in 10.2): `reportDamage`, inside receiving's own command, joins its
 * transaction and commits or rolls back with it. It takes its locks from step 2 on, the ledger's at steps 2 to 6 and the
 * damage-report and exception-code series at step 8 (stock-ledger 10.3), so the caller calls it before taking any lock
 * above step 1 of its own, as the damage route does; the lock helper refuses a step taken twice (code-house-rules 8.2).
 * Damage at the count, whose hold is an item of the GRN's own ledger request, takes the three steps of
 * `countDamageReady`, `countDamageHold` and `recordCountDamage` instead (goods-in 4.9, 8.5; S2-F02-T03).
 */
export class StockDocuments {
  constructor(private readonly dependencies: StockDocumentsDependencies) {}

  /**
   * The source whose line a draft's GRN line is, as the receipt origin the line made names it, which the damage route
   * passes on as `receiving` names its own GRN (goods-in 8.5); undefined for a product, or a line that made no origin
   * the reader may see.
   */
  async lineSourceOf(context: TransactionContext, goods: DamagedGoods): Promise<LineSource | undefined> {
    return goods.kind === 'grn-line' ? sourceOfLine(context, goods.grnLineId) : undefined;
  }

  /** The facts a new report of the draft would carry, which its route authorises with (5.3), or why it has none. */
  newReportFacts(
    context: TransactionContext,
    draft: DamageReportDraft,
    today: string,
    lineSource: LineSource | undefined,
  ): Promise<RecordFacts | CommandRefusal> {
    return newReportFacts(context, draft, today, lineSource);
  }

  /** The facts of a report the reader may see, which every route on it authorises with (5.3); else undefined. */
  reportFacts(context: TransactionContext, reportId: string): Promise<RecordFacts | undefined> {
    return reportFacts(context, reportId);
  }

  /**
   * Report damage (goods-in 8.2): the hold at once, the number, the decision's request and the exception. The caller
   * names the source whose line a GRN line is (`receiving` its own GRN); a line of another source names no goods.
   */
  reportDamage(context: TransactionContext, reporter: Actor, draft: DamageReportDraft, options?: ReportOptions) {
    return reportDamage(context, this.dependencies, reporter, draft, options);
  }

  /**
   * Damage the count finds, step 1 (goods-in 4.9, 8.5; S2-F02-T03): before the GRN takes any lock, whether damage
   * reports are available at the unit, and the series the GRN holds at step 8 with its own.
   */
  countDamageReady(context: TransactionContext, place: { readonly siteId: string; readonly businessUnitId: string }) {
    return countDamageReady(context, this.dependencies, place);
  }

  /**
   * Damage the count finds, step 2: a damaged line's damage hold, an item of the GRN's own ledger request, on the goods
   * its count makes in the condition it counts them in, held or not (stock-ledger 6.1, 13.16, 13.17; RR-571), as a
   * report's own hold is.
   */
  countDamageHold(
    lineId: string,
    at: Place,
    goods: NamedGoods,
    description: string,
    condition: ReportedCondition,
  ): LedgerItem {
    return damageHoldItem(lineId, at, goods, description, condition);
  }

  /** Damage the count finds, step 3: once the GRN's request is written, each line's report on its hold. */
  recordCountDamage(
    context: TransactionContext,
    reporter: Actor,
    input: Parameters<typeof recordCountDamage>[3],
  ): ReturnType<typeof recordCountDamage> {
    return recordCountDamage(context, this.dependencies, reporter, input);
  }

  /**
   * Where the damage reports on GRN lines stand, whatever the reader may see of them (goods-in 4.9, 5.1): each report's
   * quantity and state, through a narrowly authorised read (DEC-117).
   */
  damageOfGrnLines(context: TransactionContext, grnLineIds: readonly string[]): Promise<readonly GrnLineDamage[]> {
    return damageOfGrnLines(context, grnLineIds);
  }

  /** Ask for a report's decision again, on the goods' cost now (goods-in 8.5). */
  renewDecision(context: TransactionContext, actor: Actor, reportId: string, draft: DamageDecisionRenewal) {
    return renewDecision(context, this.dependencies, actor, reportId, draft);
  }

  /** Propose a reversal of a report's confirmation (goods-in 8.3; PRD-STK-017). */
  proposeReversal(context: TransactionContext, actor: Actor, reportId: string, draft: DamageReversalDraft) {
    return proposeReversal(context, this.dependencies, actor, reportId, draft);
  }

  /** The report a reversal belongs to, as the reader may see it, or undefined (goods-in 8.3). */
  reportOfReversal(context: TransactionContext, reversalId: string): Promise<string | undefined> {
    return reportOfReversal(context, reversalId);
  }

  /** One report as the reader may see it, or undefined; `requests` gives each round's and reversal's latest request. */
  readReport(
    context: TransactionContext,
    reportId: string,
    requests: (versionIds: readonly string[]) => Promise<ReadonlyMap<string, LatestRequest>>,
  ): Promise<DamageReport | undefined> {
    return reportView(context, reportId, requests);
  }
}

export type StockDocumentsInterface = StockDocuments;
export type { Actor as DamageActor, ReportOptions as DamageReportOptions };

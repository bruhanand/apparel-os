import {
  STOCK_BALANCE_TYPE,
  STOCK_REPORT_EXPORT_CAP,
  type ReportExport,
  type StockReportFilters,
} from '@apparel-os/schemas';
import type {
  CommandOutcome,
  IdempotentAnswer,
  JsonValue,
  ReplayAuthorisation,
  RequestContent,
} from '../../../kernel/index.js';
import { replayRefusal } from '../../access/index.js';
import { stockReportSheets } from '../domain/report-sheets.js';
import { BUSINESS_DATE_NOT_SET, EXPORT_TOO_LARGE } from '../domain/refusals.js';
import { readerAuthority, ReadRefused } from '../queries/authority.js';
import { stockReport } from '../queries/stock-report.js';
import { workbookOf } from '../writers/xlsx.js';
import { recordCostExport } from './cost-export-access.js';
import type { ExportDependencies, Exporter } from './export-stock-search.js';

// Export the stock report as XLSX, as it is shown (goods-in 9.1, 9.5; code-house-rules 12.1 "Reads"; numbering-and-
// audit 5.1; PRD-SEC-007, PRD-ACS-008; S2-F11-T02). A command, as stock search's export is, since a file with cost is
// an export of a restricted field: it reads the report through the read-model gateway in its own transaction under the
// reader's own actor and grants, at most STOCK_REPORT_EXPORT_CAP rows and refused past them; holds the authority to
// export cost at each place and brand whose cost the file carries at step 0, and writes the sensitive-access record of
// each (`reports.stock_report_export`) before the bytes are given. Its answer is never kept under the key: a replay is
// not repeatable (code-house-rules 12.4; DEC-114).

/** The record an export's access records name: the export itself, which keeps no row (numbering-and-audit 5.2). */
const EXPORT_RECORD = { module: 'reports', type: 'stock_report_export' } as const;

export async function exportStockReport(
  deps: ExportDependencies,
  exporter: Exporter,
  filters: StockReportFilters,
  key: string,
  content: RequestContent,
): Promise<IdempotentAnswer<JsonValue>> {
  // A replay is answered only while the exporter may still read stock balances at all (CH-14).
  const authoriseReplay: ReplayAuthorisation = async (context) => {
    const checked = await deps.access.authoriseEach(
      context,
      { actorId: exporter.userId, action: 'view', recordType: STOCK_BALANCE_TYPE },
      [],
    );
    return checked.kind === 'refused'
      ? { kind: 'refused', refusal: replayRefusal(checked.refusal) }
      : { kind: 'allowed' };
  };
  return deps.helper.run(
    {
      commandName: 'reports.export-stock-report',
      organisation: exporter.organisation,
      correlationId: exporter.correlationId,
      actor: { kind: 'actor', actorId: exporter.userId },
    },
    {
      key,
      content,
      authoriseReplay,
      work: async (context): Promise<CommandOutcome<JsonValue>> => {
        const date = await context.businessDate();
        if (date.kind === 'not-set') return { kind: 'refusal', refusal: BUSINESS_DATE_NOT_SET, causedBySecret: false };
        let read;
        try {
          read = await stockReport(
            deps.gateway,
            deps.access,
            context,
            { filters, limit: STOCK_REPORT_EXPORT_CAP, today: date.date },
            readerAuthority(deps.access, context, exporter.userId),
          );
        } catch (error) {
          if (error instanceof ReadRefused) return { kind: 'refusal', refusal: error.refusal, causedBySecret: false };
          throw error;
        }
        if (read.report.next !== null) return { kind: 'refusal', refusal: EXPORT_TOO_LARGE, causedBySecret: false };
        const refused = await recordCostExport(
          deps.access,
          deps.audit,
          context,
          exporter,
          EXPORT_RECORD,
          read.costShown,
        );
        if (refused !== undefined) return { kind: 'refusal', refusal: refused, causedBySecret: false };
        const bytes = await workbookOf(stockReportSheets(read.report, date.timezone));
        const answer: ReportExport = {
          fileName: `stock-report-${date.date}.xlsx`,
          contentBase64: bytes.toString('base64'),
        };
        return { kind: 'success', answer: { ...answer }, shows: 'restricted-value' };
      },
    },
  );
}

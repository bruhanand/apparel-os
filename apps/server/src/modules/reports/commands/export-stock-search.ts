import {
  STOCK_BALANCE_TYPE,
  STOCK_SEARCH_EXPORT_CAP,
  type StockSearchExport,
  type StockSearchFilters,
} from '@apparel-os/schemas';
import type {
  CommandOutcome,
  IdempotencyHelper,
  IdempotentAnswer,
  JsonValue,
  ReadModelGateway,
  ReplayAuthorisation,
  RequestContent,
  RoutedOrganisation,
} from '../../../kernel/index.js';
import { replayRefusal, type AccessInterface } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { stockSearchSheets } from '../domain/export.js';
import { recordCostExport } from './cost-export-access.js';
import { BUSINESS_DATE_NOT_SET, EXPORT_TOO_LARGE } from '../domain/refusals.js';
import { readerAuthority, ReadRefused } from '../queries/authority.js';
import { searchStock } from '../queries/stock-search.js';
import { workbookOf } from '../writers/xlsx.js';

// Export a stock search as XLSX, as it is shown (goods-in 9.1, 9.4; code-house-rules 12.1 "Reads"; numbering-and-audit
// 5.1; PRD-SEC-007, PRD-ACS-008; S2-F11-T01). A command, since a file with cost is an export of a restricted field: it
// reads the search through the read-model gateway in its own transaction, under the reader's own actor and grants, as
// the search's read does, at most STOCK_SEARCH_EXPORT_CAP results and refused past them; and for each place and brand
// whose cost the file carries it writes one sensitive-access record, all naming the export by an identifier made for it
// (`reports.stock_search_export`), in the same transaction, before the bytes are given. Cost is not encrypted, so it
// asks for no fresh authenticator code (access-and-approvals 3.3, 6). The answer is never kept under the key: a replay
// is not repeatable (code-house-rules 12.4; DEC-114), as a file's download.

export interface ExportDependencies {
  readonly helper: IdempotencyHelper;
  readonly gateway: ReadModelGateway;
  readonly access: AccessInterface;
  readonly audit: AuditInterface;
}

export interface Exporter {
  readonly organisation: RoutedOrganisation;
  readonly userId: string;
  readonly correlationId: string;
  readonly networkAddress: string;
}

/** The record an export's access records name: the export itself, which keeps no row (numbering-and-audit 5.2). */
const EXPORT_RECORD = { module: 'reports', type: 'stock_search_export' } as const;

export async function exportStockSearch(
  deps: ExportDependencies,
  exporter: Exporter,
  filters: StockSearchFilters,
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
      commandName: 'reports.export-stock-search',
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
          read = await searchStock(
            deps.gateway,
            context,
            { filters, limit: STOCK_SEARCH_EXPORT_CAP, today: date.date },
            readerAuthority(deps.access, context, exporter.userId),
          );
        } catch (error) {
          if (error instanceof ReadRefused) return { kind: 'refusal', refusal: error.refusal, causedBySecret: false };
          throw error;
        }
        if (read.search.next !== null) return { kind: 'refusal', refusal: EXPORT_TOO_LARGE, causedBySecret: false };
        const refused = await recordCostExport(
          deps.access,
          deps.audit,
          context,
          exporter,
          EXPORT_RECORD,
          read.costShown,
        );
        if (refused !== undefined) return { kind: 'refusal', refusal: refused, causedBySecret: false };
        const bytes = await workbookOf(stockSearchSheets(read.search, date.timezone));
        const answer: StockSearchExport = {
          fileName: `stock-search-${date.date}.xlsx`,
          contentBase64: bytes.toString('base64'),
        };
        return { kind: 'success', answer: { ...answer }, shows: 'restricted-value' };
      },
    },
  );
}

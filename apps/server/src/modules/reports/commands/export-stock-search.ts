import { STOCK_SEARCH_EXPORT_CAP, type StockSearchFilters } from '@apparel-os/schemas';
import type { IdempotentAnswer, JsonValue, RequestContent } from '../../../kernel/index.js';
import { stockSearchSheets } from '../domain/export.js';
import { searchStock } from '../queries/stock-search.js';
import { exportWithCost, type ExportDependencies, type Exporter } from './cost-export.js';

// Export a stock search as XLSX, as it is shown (goods-in 9.1, 9.4; S2-F11-T01): at most STOCK_SEARCH_EXPORT_CAP
// results, through the export step stock search and the stock report share (cost-export.ts), its access records naming
// the export as `reports.stock_search_export`.

export function exportStockSearch(
  deps: ExportDependencies,
  exporter: Exporter,
  filters: StockSearchFilters,
  key: string,
  content: RequestContent,
): Promise<IdempotentAnswer<JsonValue>> {
  return exportWithCost(
    deps,
    exporter,
    {
      commandName: 'reports.export-stock-search',
      record: { module: 'reports', type: 'stock_search_export' },
      fileStem: 'stock-search',
      read: async (reading) => {
        const read = await searchStock(reading, { filters, limit: STOCK_SEARCH_EXPORT_CAP });
        return {
          more: read.search.next !== null,
          shown: read.shown,
          sheets: stockSearchSheets(read.search, reading.timeZone),
        };
      },
    },
    key,
    content,
  );
}

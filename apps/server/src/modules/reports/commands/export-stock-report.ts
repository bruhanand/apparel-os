import { STOCK_REPORT_EXPORT_CAP, type StockReportFilters } from '@apparel-os/schemas';
import type { IdempotentAnswer, JsonValue, RequestContent } from '../../../kernel/index.js';
import { stockReportSheets } from '../domain/report-sheets.js';
import { stockReport } from '../queries/stock-report.js';
import { exportWithCost, type ExportDependencies, type Exporter } from './cost-export.js';

// Export the stock report as XLSX, as it is shown (goods-in 9.1, 9.5; S2-F11-T02): at most STOCK_REPORT_EXPORT_CAP
// rows, through the export step stock search and the stock report share (cost-export.ts), its access records naming
// the export as `reports.stock_report_export`.

export function exportStockReport(
  deps: ExportDependencies,
  exporter: Exporter,
  filters: StockReportFilters,
  key: string,
  content: RequestContent,
): Promise<IdempotentAnswer<JsonValue>> {
  return exportWithCost(
    deps,
    exporter,
    {
      commandName: 'reports.export-stock-report',
      record: { module: 'reports', type: 'stock_report_export' },
      fileStem: 'stock-report',
      read: async (reading) => {
        const read = await stockReport(reading, { filters, limit: STOCK_REPORT_EXPORT_CAP });
        return {
          more: read.report.next !== null,
          shown: read.shown,
          sheets: stockReportSheets(read.report, reading.timeZone),
        };
      },
    },
    key,
    content,
  );
}

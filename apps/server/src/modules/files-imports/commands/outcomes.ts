import { normalisedName } from '@apparel-os/schemas';
import { and, desc, eq, ne, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import { knownValue, type ImportHandler } from '../contracts/import-handlers.js';
import { controlTotal, stagedRow } from '../db/schema.js';
import {
  outcomeControlTotals,
  outcomeCounts,
  outcomeMeasures,
  type DocumentResult,
  type OutcomeControlTotal,
  type OutcomeCounts,
  type OutcomeDocument,
  type OutcomeMeasure,
} from '../domain/outcome.js';
import { identityOf, type BatchRow, type LoadedDocument } from './import-common.js';

// The outcome of a batch (imports-and-opening-data 7.4; PRD-IMP-012, PRD-IMP-013; S1-F06-T04): rows read, as the
// reader counted them, against the rows staged; rows ignored; rows, quantities and values accepted, rejected, pending
// and duplicate; and the control totals as reported, summed and accepted. Every row the reader read is staged, as a
// data row of one document or as a row that is not data, so the counts close unless a row was lost between reading
// and staging; Submit and Publish refuse a batch whose counts do not close.

/** The rows the reader read from the imported sheet: its own count (8.1). */
export function rowsReadOf(batch: Pick<BatchRow, 'sheets'>): number {
  return batch.sheets.find((sheet) => sheet.imported)?.rows ?? 0;
}

/**
 * The refusal of a batch whose counts do not close (7.4): the rows staged differ from the rows the reader read, so
 * rows read cannot equal rows ignored plus accepted, rejected, pending and duplicate, whatever became of each document.
 */
export async function countsRefusal(
  context: TransactionContext,
  batch: Pick<BatchRow, 'id' | 'sheets'>,
): Promise<CommandRefusal | undefined> {
  const [row] = await context.tx
    .select({ staged: sql<number>`count(*)::int` })
    .from(stagedRow)
    .where(eq(stagedRow.batchId, batch.id));
  const staged = row?.staged ?? 0;
  const read = rowsReadOf(batch);
  if (staged === read) return undefined;
  return {
    kind: 'refused',
    code: 'files-imports.counts-do-not-close',
    missing: [{ kind: 'import-counts', rowsRead: String(read), rowsStaged: String(staged) }],
  };
}

/** What becomes of a document before any attempt: published, excluded, a duplicate or conflict, or pending (7.2). */
export async function projectedResult(
  context: TransactionContext,
  handler: ImportHandler,
  batch: Pick<BatchRow, 'kind' | 'target'>,
  document: LoadedDocument,
): Promise<Pick<OutcomeDocument, 'result' | 'publishedDocumentId'>> {
  if (document.state === 'Published') return { result: 'published' };
  if (document.excluded) return { result: 'excluded' };
  const { finding } = await identityOf(context, handler, batch, document);
  if (finding.kind === 'duplicate' || finding.kind === 'conflict') {
    return { result: finding.kind, publishedDocumentId: finding.of };
  }
  return { result: 'not-attempted' };
}

export interface BatchOutcome {
  readonly counts: OutcomeCounts;
  readonly measures: OutcomeMeasure[];
  readonly controlTotals: OutcomeControlTotal[];
  readonly documents: OutcomeDocument[];
}

/** The control totals of the last validation run of the batch's current version (8.1). */
async function lastControlTotals(context: TransactionContext, batch: Pick<BatchRow, 'id' | 'versionId'>) {
  const [last] = await context.tx
    .select({ runAt: controlTotal.runAt })
    .from(controlTotal)
    .where(and(eq(controlTotal.batchId, batch.id), eq(controlTotal.batchVersionId, batch.versionId)))
    .orderBy(desc(controlTotal.runAt))
    .limit(1);
  if (last === undefined) return [];
  return context.tx
    .select()
    .from(controlTotal)
    .where(
      and(
        eq(controlTotal.batchId, batch.id),
        eq(controlTotal.batchVersionId, batch.versionId),
        eq(controlTotal.runAt, last.runAt),
      ),
    )
    .orderBy(controlTotal.id);
}

/** The outcome of the documents' results (7.4), each document with its rows. */
export async function batchOutcome(
  context: TransactionContext,
  handler: ImportHandler,
  batch: Pick<BatchRow, 'id' | 'versionId' | 'sheets'>,
  documents: readonly LoadedDocument[],
  results: ReadonlyMap<string, Omit<OutcomeDocument, 'documentId' | 'rows'>>,
): Promise<BatchOutcome> {
  const others = await context.tx
    .select({ role: stagedRow.role, cells: stagedRow.cells })
    .from(stagedRow)
    .where(and(eq(stagedRow.batchId, batch.id), ne(stagedRow.role, 'data')));
  const resultOf = (document: LoadedDocument): DocumentResult =>
    results.get(document.documentId)?.result ?? (document.state === 'Published' ? 'published' : 'not-attempted');
  const outcomeDocuments: OutcomeDocument[] = documents.map((document) => ({
    documentId: document.documentId,
    records: [],
    ...results.get(document.documentId),
    result: resultOf(document),
    rows: document.rows.length,
  }));
  const counts = outcomeCounts({
    rowsRead: rowsReadOf(batch),
    ignoredRows: others.length,
    documents: outcomeDocuments.map((document) => ({ result: document.result, rows: document.rows ?? 0 })),
  });
  const measures = outcomeMeasures(
    handler.measures,
    documents.map((document) => ({
      result: resultOf(document),
      rows: document.rows.map((row) =>
        Object.fromEntries(
          handler.measures
            .flatMap((measure) => [measure.field, ...(measure.evidence === undefined ? [] : [measure.evidence])])
            .map((field) => [field, knownValue(row.values[field])]),
        ),
      ),
    })),
  );
  // The accepted lines of a control total's column, found by the header's label (6.6; G-1, K-1).
  const header = others.find((row) => row.role === 'header');
  const accepted = new Set(
    documents.filter((document) => resultOf(document) === 'published').map((document) => document.documentId),
  );
  const lines = await context.tx
    .select({ documentId: stagedRow.documentId, cells: stagedRow.cells })
    .from(stagedRow)
    .where(and(eq(stagedRow.batchId, batch.id), eq(stagedRow.role, 'data')));
  const acceptedLines = (column: string) => {
    const at = header?.cells.find((cell) => normalisedName(cell.text) === normalisedName(column))?.column;
    if (at === undefined) return undefined;
    return lines
      .filter((line) => line.documentId !== null && accepted.has(line.documentId))
      .map((line) => line.cells.find((cell) => cell.column === at)?.text);
  };
  const totals = (await lastControlTotals(context, batch)).map((total) => ({
    sheet: total.sheet,
    rowNumber: total.rowNumber,
    column: total.columnName,
    reported: total.reported,
    summed: total.summed,
  }));
  return {
    counts,
    measures,
    controlTotals: outcomeControlTotals(totals, acceptedLines),
    documents: outcomeDocuments,
  };
}

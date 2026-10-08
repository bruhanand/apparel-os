import { uuidv7 } from '@apparel-os/domain';
import { and, eq } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import { allocation, series } from '../db/schema.js';
import { formatNumber } from '../domain/format.js';
import { answered, refused, type NumberingResult } from '../domain/kinds.js';
import { partsOf, seriesPattern, seriesRow } from '../queries/series.js';
import { requireHeld } from './lock-target.js';

/** What a document's number is: the allocation, its series and sequence number, and the text people see (3.2). */
export interface Allocated {
  readonly allocationId: string;
  readonly seriesId: string;
  readonly sequenceNumber: number;
  readonly formattedText: string;
}

/** The document a number is for, by its owner's record type and identifier. */
export interface AllocationRequest {
  readonly seriesId: string;
  readonly documentType: string;
  readonly documentId: string;
}

/**
 * Allocate (numbering-and-audit 3.2; PRD-MOD-004, PRD-INT-004): inside the owning module's transaction, from a series
 * the command holds. Takes the series' next number, records the allocation (series, sequence number, formatted text,
 * document kind and reference, time) and moves the series on, so the number commits with its document or not at all
 * and a rollback leaves no gap. A document that already has its number in this kind gets that number again, never a
 * second one (PRD-INT-002).
 */
export async function allocate(
  context: TransactionContext,
  request: AllocationRequest,
): Promise<NumberingResult<Allocated>> {
  requireHeld(context, request.seriesId, 'Allocate');
  if (request.documentType === '') throw new CommandDefect('An allocation names its document type');
  const row = await seriesRow(context, request.seriesId);
  if (row === undefined) return refused('series-not-found');
  const first = (
    await context.tx
      .select()
      .from(allocation)
      .where(
        and(
          eq(allocation.kind, row.kind),
          eq(allocation.documentType, request.documentType),
          eq(allocation.documentId, request.documentId),
        ),
      )
  )[0];
  if (first !== undefined) {
    if (first.seriesId !== row.id) return refused('document-numbered-elsewhere');
    return answered({
      allocationId: first.id,
      seriesId: first.seriesId,
      sequenceNumber: first.sequenceNumber,
      formattedText: first.formattedText,
    });
  }
  if (row.state === 'Paused') return refused('series-paused');
  if (row.state === 'Closed') return refused('series-closed');
  const parts = (await partsOf(context, [row.numberFormatVersionId])).get(row.numberFormatVersionId) ?? [];
  const sequenceNumber = row.nextSequence;
  const formattedText = formatNumber(seriesPattern(row, parts), sequenceNumber);
  if (formattedText === undefined) return refused('series-exhausted');
  const allocationId = uuidv7();
  await context.tx.insert(allocation).values({
    id: allocationId,
    seriesId: row.id,
    kind: row.kind,
    displayScopeKey: row.displayScopeKey,
    displayYear: row.displayYear,
    sequenceNumber,
    formattedText,
    documentType: request.documentType,
    documentId: request.documentId,
    occurredAt: context.startedAt,
  });
  await context.tx
    .update(series)
    .set({ nextSequence: sequenceNumber + 1 })
    .where(eq(series.id, row.id));
  return answered({ allocationId, seriesId: row.id, sequenceNumber, formattedText });
}

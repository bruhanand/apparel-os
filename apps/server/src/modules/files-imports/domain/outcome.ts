import { sumDecimals } from '@apparel-os/calculations';

// What a publish attempt did, for the batch and each document (imports-and-opening-data 7.4; PRD-IMP-012,
// PRD-IMP-013; S1-F06-T01, S1-F06-T04): rows read, rows ignored, and rows, quantities and values accepted, rejected,
// pending and duplicate, with the control totals as reported, summed and accepted. The counts close when rows read
// equal rows ignored plus accepted, rejected, pending and duplicate; Submit and Publish refuse a batch whose counts do
// not. Plain types and rules only (code-house-rules 2).

export interface OutcomeCounts {
  /** Rows the reader read from the imported sheet: its own count, apart from what was staged. */
  readonly rowsRead: number;
  readonly rowsIgnored: number;
  readonly rowsAccepted: number;
  readonly rowsRejected: number;
  readonly rowsPending: number;
  readonly rowsDuplicate: number;
}

/**
 * What became of one document: published (now or at an earlier attempt), refused by its handler or as a conflict
 * (7.2), a duplicate of a published document, excluded by the preparer (3.2), or not attempted yet.
 */
export type DocumentResult = 'published' | 'refused' | 'conflict' | 'duplicate' | 'excluded' | 'not-attempted';

export interface OutcomeDocument {
  readonly documentId: string;
  readonly result: DocumentResult;
  readonly records: readonly { readonly recordType: string; readonly recordId: string }[];
  readonly refusalCode?: string;
  /** The published document it duplicates, conflicts with or revises (7.2, 7.3). */
  readonly publishedDocumentId?: string;
  readonly revisesDocumentId?: string;
  /** Its data rows. */
  readonly rows?: number;
}

/** The sums of one measure the handler names, by result; null is Unknown, never zero (PRD-MOD-015). */
export interface OutcomeMeasure {
  readonly field: string;
  readonly kind: 'quantity' | 'value';
  readonly accepted: string | null;
  readonly rejected: string | null;
  readonly pending: string | null;
  readonly duplicate: string | null;
}

/** A control total as the file reports it, as the lines sum, and as the accepted lines sum (7.4; PRD-EBO-004). */
export interface OutcomeControlTotal {
  readonly sheet: string;
  readonly rowNumber: number;
  readonly column: string;
  readonly reported: string | null;
  readonly summed: string | null;
  readonly accepted: string | null;
}

type Bucket = 'accepted' | 'rejected' | 'pending' | 'duplicate';

/** The count each result goes to: refused, conflicting and excluded documents are rejected. */
export function bucketOf(result: DocumentResult): Bucket {
  switch (result) {
    case 'published':
      return 'accepted';
    case 'duplicate':
      return 'duplicate';
    case 'not-attempted':
      return 'pending';
    default:
      return 'rejected';
  }
}

export function outcomeCounts(input: {
  readonly rowsRead: number;
  readonly ignoredRows: number;
  readonly documents: readonly { readonly result: DocumentResult; readonly rows: number }[];
}): OutcomeCounts {
  const sum = (bucket: Bucket) =>
    input.documents.filter((each) => bucketOf(each.result) === bucket).reduce((total, each) => total + each.rows, 0);
  return {
    rowsRead: input.rowsRead,
    rowsIgnored: input.ignoredRows,
    rowsAccepted: sum('accepted'),
    rowsRejected: sum('rejected'),
    rowsPending: sum('pending'),
    rowsDuplicate: sum('duplicate'),
  };
}

/** Rows read equal rows ignored plus accepted, rejected, pending and duplicate (7.4). */
export function countsClose(counts: OutcomeCounts): boolean {
  return (
    counts.rowsRead ===
    counts.rowsIgnored + counts.rowsAccepted + counts.rowsRejected + counts.rowsPending + counts.rowsDuplicate
  );
}

const DECIMAL = /^\d+(?:\.\d+)?$/;

/** The exact sum of the lines, or null (Unknown) when a line is not a known decimal (PRD-MOD-015). */
export function sumOrUnknown(texts: readonly (string | undefined)[]): string | null {
  const known = texts.filter((text): text is string => text !== undefined && DECIMAL.test(text.trim()));
  if (known.length !== texts.length) return null;
  return sumDecimals(known.map((text) => text.trim()));
}

/**
 * The quantities and values of the handler's measures, by result (7.4). A measure that stands on evidence counts a row
 * without it as Unknown, so a value without its evidence is never summed as known (imports-and-opening-data 10.2;
 * POL-14.03; PRD-MOD-015).
 */
export function outcomeMeasures(
  measures: readonly { readonly field: string; readonly kind: 'quantity' | 'value'; readonly evidence?: string }[],
  documents: readonly {
    readonly result: DocumentResult;
    readonly rows: readonly Readonly<Record<string, string | undefined>>[];
  }[],
): OutcomeMeasure[] {
  return measures.map((measure) => {
    const of = (bucket: Bucket) =>
      sumOrUnknown(
        documents
          .filter((document) => bucketOf(document.result) === bucket)
          .flatMap((document) =>
            document.rows.map((row) =>
              measure.evidence === undefined || row[measure.evidence] !== undefined ? row[measure.field] : undefined,
            ),
          ),
      );
    return {
      field: measure.field,
      kind: measure.kind,
      accepted: of('accepted'),
      rejected: of('rejected'),
      pending: of('pending'),
      duplicate: of('duplicate'),
    };
  });
}

/** Each control total with the sum of its column over the accepted lines, which `acceptedLines` gives (7.4). */
export function outcomeControlTotals(
  totals: readonly Omit<OutcomeControlTotal, 'accepted'>[],
  acceptedLines: (column: string) => readonly (string | undefined)[] | undefined,
): OutcomeControlTotal[] {
  return totals.map((total) => {
    const lines = acceptedLines(total.column);
    return { ...total, accepted: lines === undefined ? null : sumOrUnknown(lines) };
  });
}

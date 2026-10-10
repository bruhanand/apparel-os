// What a publish attempt did, for the batch and each document (imports-and-opening-data 7.4; PRD-IMP-012,
// PRD-IMP-013). As built for the tracer (S1-F06-T01): rows read, ignored, accepted, rejected, pending and duplicate,
// counted in staged rows. Quantities, values and control totals, the counts-close check and the outcomes report are
// S1-F06-T04's. Plain types and rules only (code-house-rules 2).

export interface OutcomeCounts {
  readonly rowsRead: number;
  readonly rowsIgnored: number;
  readonly rowsAccepted: number;
  readonly rowsRejected: number;
  readonly rowsPending: number;
  readonly rowsDuplicate: number;
}

export interface OutcomeDocument {
  readonly documentId: string;
  readonly result: 'published' | 'refused' | 'not-attempted';
  readonly records: readonly { readonly recordType: string; readonly recordId: string }[];
  readonly refusalCode?: string;
}

/**
 * The counts of an attempt: every data row of a published document is accepted, of a refused one rejected, of one not
 * attempted pending; rows that are not data are ignored. None is a duplicate until duplicate control (S1-F06-T04).
 */
export function outcomeCounts(
  ignoredRows: number,
  documents: readonly { readonly result: OutcomeDocument['result']; readonly rows: number }[],
): OutcomeCounts {
  const sum = (result: OutcomeDocument['result']) =>
    documents.filter((each) => each.result === result).reduce((total, each) => total + each.rows, 0);
  const rowsAccepted = sum('published');
  const rowsRejected = sum('refused');
  const rowsPending = sum('not-attempted');
  return {
    rowsRead: ignoredRows + rowsAccepted + rowsRejected + rowsPending,
    rowsIgnored: ignoredRows,
    rowsAccepted,
    rowsRejected,
    rowsPending,
    rowsDuplicate: 0,
  };
}

import type { ImportBatchState, ImportKind, IssueSeverity, MissingItem } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditScope } from '../../audit/index.js';
import type { HandlerDocument } from '../contracts/import-handlers.js';
import { currentIssues } from '../commands/review.js';
import { documentsOf, factsOfBatch, visibleBatch } from '../commands/import-common.js';

// A batch as the module whose handler fills it reads it (imports-and-opening-data 13.1 "Reads", 13.2 "As built" with
// S2-F04-T02): its state and version, its scope facts and the record it is about, its documents as the handler is
// given them, and its kept validation report's issues by row and column, without the staged cells. So a target module
// shows its own preview of a large file without reading every cell (RR-540). Read under the reader's actor: a batch
// row-level security hides is not found. The caller authorises the reader on the batch with its facts.

export interface HandlerBatch {
  readonly batchId: string;
  readonly code: string;
  readonly versionId: string;
  readonly state: ImportBatchState;
  readonly kind: ImportKind;
  readonly target: string;
  /** Whether the batch's current version was submitted for review (13.1). */
  readonly submitted: boolean;
  readonly facts: AuditScope;
  readonly subject?: { readonly recordType: string; readonly recordId: string };
  readonly documents: readonly HandlerDocument[];
  /** The issues of the last validation of the current version, none before it is validated (8). */
  readonly issues: readonly {
    readonly issueId: string;
    readonly class: string;
    readonly severity: IssueSeverity;
    readonly code: string;
    readonly rowNumber?: number;
    readonly column?: string;
    readonly field?: string;
    readonly missing: readonly MissingItem[];
    /** Who marked a Warning seen (8 "As built"). */
    readonly seenBy?: string;
  }[];
}

export async function handlerBatch(context: TransactionContext, batchId: string): Promise<HandlerBatch | undefined> {
  const batch = await visibleBatch(context, batchId);
  if (batch === undefined) return undefined;
  const documents = (await documentsOf(context, batch)).filter((document) => !document.excluded);
  const issues = await currentIssues(context, batch);
  return {
    batchId: batch.id,
    code: batch.code,
    versionId: batch.versionId,
    state: batch.state,
    kind: batch.kind,
    target: batch.target,
    submitted: batch.submittedVersionId === batch.versionId,
    facts: factsOfBatch(batch),
    ...(batch.subjectRecordType === null || batch.subjectRecordId === null
      ? {}
      : { subject: { recordType: batch.subjectRecordType, recordId: batch.subjectRecordId } }),
    documents,
    issues: issues.map((issue) => ({
      issueId: issue.id,
      class: issue.class,
      severity: issue.severity,
      code: issue.code,
      ...(issue.rowNumber === null ? {} : { rowNumber: issue.rowNumber }),
      ...(issue.columnLetters === null ? {} : { column: issue.columnLetters }),
      ...(issue.field === null ? {} : { field: issue.field }),
      // A value worked out from a restricted column is never named here: the caller masks nothing (section 11).
      missing: issue.restrictedClass === null ? issue.missing : [],
      ...(issue.seenByUserId === null ? {} : { seenBy: issue.seenByUserId }),
    })),
  };
}

import type { FieldClass } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AuditScope } from '../../audit/index.js';

/**
 * The evidence of an approval decision (access-and-approvals 9.5; PRD-ACS-010, POL-02.23; S1-F08-T03): a contract
 * `access` defines and `files-imports` implements with its Attach (imports-and-opening-data 13.1), handed to `access`
 * by the composition root at start (module-map section 3, rule 6). `files-imports` uses `access`, so `access` never
 * depends on it: the decision links each stored file in its own transaction through this contract, and a decision that
 * does not commit leaves no link.
 */
export interface DecisionEvidence {
  attach(context: TransactionContext, request: DecisionEvidenceLink): Promise<{ readonly attachmentId: string }>;
}

/** One stored file linked to the document decided, as the decision's evidence. */
export interface DecisionEvidenceLink {
  readonly storedFileId: string;
  /** The receipt Store a file answered for this hand-in (imports-and-opening-data 11, 15.1). */
  readonly fileReceiptId: string;
  /**
   * The document decided, at the version decided: its record type is the one approve is granted on, so a reader of
   * the evidence needs view on that type covering the document's facts (imports-and-opening-data 11).
   */
  readonly record: {
    readonly module: string;
    readonly type: string;
    readonly id: string;
    readonly versionId: string;
  };
  /** The kind of evidence, with the restricted classes the action's approval rule declares for it. */
  readonly evidence: { readonly kind: string; readonly restrictedClasses: readonly FieldClass[] };
  readonly scope: AuditScope;
  readonly attachedBy: { readonly kind: 'user'; readonly id: string };
  readonly roleAssignmentId: string;
}

/** The token the composition root provides the implementation under. */
export const DECISION_EVIDENCE = 'access.DecisionEvidence';

/** The kind of evidence a decision's files are attached as. */
export const DECISION_EVIDENCE_KIND = 'access.approval-decision';

import type { TransactionContext } from '../../../kernel/index.js';

/**
 * The evidence of a policy's signature and of its validation (module-map 4.4, section 3 rule 6; DEC-092, DEC-116;
 * S1-F04-T01): a contract `configuration` defines and `files-imports` implements with its Attach (imports-and-opening-
 * data 13.1), handed over by the composition root at start. `files-imports` uses `configuration`, so `configuration`
 * never depends on it: each stored file is linked in the recording command's own transaction, and a record that does
 * not commit leaves no link.
 */
export interface PolicyEvidence {
  attach(context: TransactionContext, request: PolicyEvidenceLink): Promise<{ readonly attachmentId: string }>;
}

/** One stored file linked to a policy's signature or validation, as its evidence. */
export interface PolicyEvidenceLink {
  readonly storedFileId: string;
  /** The receipt Store a file answered for this hand-in (imports-and-opening-data 11, 15.1). */
  readonly fileReceiptId: string;
  /** The record it evidences: its type is the one a reader needs view on (imports-and-opening-data 11). */
  readonly record: { readonly module: 'configuration'; readonly type: string; readonly id: string };
  /** The kind of evidence; a policy's evidence carries no restricted field class. */
  readonly evidence: { readonly kind: string; readonly restrictedClasses: readonly [] };
  readonly attachedBy: { readonly kind: 'user'; readonly id: string };
  readonly roleAssignmentId: string;
}

/** The token the composition root provides the implementation under. */
export const POLICY_EVIDENCE = 'configuration.PolicyEvidence';

import type { DocumentPreview, ImportKind, ValueSuggestion } from '@apparel-os/schemas';
import type { CommandRefusal, LockTarget, TransactionContext } from '../../../kernel/index.js';
import type { AuthoriseRequest } from '../../access/index.js';
import type { EffectiveValue } from '../domain/report.js';

// The import handler contract (imports-and-opening-data 13.2; module-map 4.7 "Register an import handler", section 3
// rule 6; structure-and-masters 7). files-imports never writes another module's records (PRD-MOD-002): a target
// module registers a handler at start, and Publish hands it the reviewed rows in the transaction it is given. A contract
// files-imports defines and the target module implements: files-imports never depends on that module.
//
// As built (S1-F06-T01, S1-F06-T03): the record type, the kinds and effects, the fields of a staged row, the
// permission its publish needs, the review it requires, a preview that writes nothing and runs its reference checks,
// suggestions from its own records, the check of a mapping rule whose target it owns, and publish. As built with
// S1-F06-T04: the scope of its source identity (7.1), whether it supports governed revisions (7.3), the permission
// its publish needs for each kind it accepts, the measures an outcome sums (7.4), and the rows its publish locks with
// the batch at step 1 (code-house-rules 8.2).

/** One field of the handler's staged row: its name and whether a document needs it known (PRD-MOD-015). */
export interface ImportField {
  readonly name: string;
  readonly required: boolean;
}

/**
 * A staged row as the handler is given it: its values, each with its origin (Supplied, Calculated, Mapped, Entered by a
 * person) or Unknown. A person's entry stands for the value staged from the file (section 5).
 */
export interface HandlerRow {
  readonly stagedRowId: string;
  readonly sheet: string;
  readonly rowNumber: number;
  readonly values: Readonly<Record<string, EffectiveValue>>;
}

/** The value a handler reads from a staged value: the known text, or undefined when Unknown (PRD-MOD-015). */
export function knownValue(value: EffectiveValue | undefined): string | undefined {
  return value === undefined || value.kind === 'unknown' ? undefined : value.value;
}

/**
 * The review a handler requires (3.1 step 8, 13.2): the preparer's submission after the preview, where the records it
 * creates have their own approvals; or an approval rule in `access` bound to the exact batch version.
 */
export type ImportReview = { readonly kind: 'submission' } | { readonly kind: 'approval'; readonly actionType: string };

/** One document of a batch, with its data rows, and the batch's kind, which says what publishing it does (4.1). */
export interface HandlerDocument {
  readonly documentId: string;
  readonly reference: string;
  readonly kind: ImportKind;
  readonly rows: readonly HandlerRow[];
}

/**
 * Whether a handler supports governed revisions (7.3), and what reversing means for its records: `none`, so a
 * changed document is a conflict; or `new-version`, for a master, whose correction is simply a new version
 * (structure-and-masters 2.2), published by an update batch.
 */
export type ImportRevisions = 'none' | 'new-version';

/** A field an outcome sums by result: a quantity or a value (7.4; PRD-IMP-013). */
export interface ImportMeasure {
  readonly field: string;
  readonly kind: 'quantity' | 'value';
}

/** Where a published record came from: the batch, its code, the document and its staged rows (section 5). */
export interface ImportSource {
  readonly batchId: string;
  readonly batchCode: string;
  readonly documentId: string;
  readonly stagedRowIds: readonly string[];
  readonly firstRowNumber: number;
}

/** The permission a document's publish needs: the action, the record type, and its facts where a place scopes it. */
export type ImportNeed = Pick<AuthoriseRequest, 'action' | 'recordType' | 'facts' | 'movesTo'>;

/** The person publishing, with the assignment Authorise found for the handler's own permission on the document. */
export interface ImportPublisher {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

export type HandlerPublished =
  | {
      readonly kind: 'published';
      readonly records: readonly { readonly recordType: string; readonly recordId: string }[];
    }
  | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

export interface ImportHandler {
  /** The target a batch names, such as `merchandise`. */
  readonly target: string;
  /** The record type it fills. */
  readonly recordType: string;
  /** The kinds it accepts (4.2); Start an import refuses any other. */
  readonly kinds: readonly ImportKind[];
  /** The effects it may have (4.2). */
  readonly effects: 'master-records';
  /** The fields of its staged row. */
  readonly fields: readonly ImportField[];
  /** The fields an outcome sums as quantities and values (7.4); none for a master. */
  readonly measures: readonly ImportMeasure[];
  /**
   * The scope key of a document's source identity (7.1): for a master create or update, the record type. With the
   * target and the document reference it is the idempotency key of publishing (PRD-INT-002).
   */
  sourceScope(document: Pick<HandlerDocument, 'reference' | 'rows'>): string;
  /** Whether it supports governed revisions (7.3). */
  readonly revisions: ImportRevisions;
  /**
   * The permission publishing one document needs beside the batch's, with the scope facts of the place the document
   * changes, as a person's change of the same record would be authorised: held at step 0 with the batch's, so
   * publishing goes through the same checks as a person's change (structure-and-masters 6.1, 7; module-map section 3,
   * rule 8). Each document is authorised against its own place, so a Store-scoped preparer publishes only within
   * their scope (product owner, 10 Oct 2026). A record type no place scopes names no facts.
   */
  publishNeeds(context: TransactionContext, document: HandlerDocument): Promise<ImportNeed>;
  /**
   * The rows of its own that publishing the document locks, which Publish locks with the batch at step 1 in one call
   * (code-house-rules 8.2 "Rows of other modules"); its Maintain operation then finds them held.
   */
  lockTargets(context: TransactionContext, document: HandlerDocument): Promise<LockTarget[]>;
  /** The review it requires (3.1 step 8). */
  readonly review: ImportReview;
  /**
   * Exact or close matches for a field's value from its own records, for a person to accept (section 5; PRD-IMP-009):
   * codes through Resolve a code, words by trigram search. None where the field has none.
   */
  suggestions(context: TransactionContext, field: string, value: string | undefined): Promise<ValueSuggestion[]>;
  /**
   * The check of a mapping rule's target for one of its fields (6.3): undefined when it accepts the target, the
   * refusal otherwise; `files-imports.rule-attribute-unknown` for a field that takes no rule.
   */
  checkRuleTarget(context: TransactionContext, field: string, target: string): Promise<CommandRefusal | undefined>;
  /** What the document would create, worked out without writing; or the issues that stop it (3.1 step 7). */
  preview(context: TransactionContext, document: HandlerDocument): Promise<DocumentPreview>;
  /** Writes its records in the transaction it is given, whole or not at all (PRD-IMP-012). */
  publish(
    context: TransactionContext,
    publisher: ImportPublisher,
    document: HandlerDocument,
    source: ImportSource,
  ): Promise<HandlerPublished>;
}

/** The handlers of the targets whose modules registered one. */
export class ImportHandlers {
  private readonly handlers = new Map<string, ImportHandler>();

  register(handler: ImportHandler): void {
    if (this.handlers.has(handler.target))
      throw new Error(`An import handler for ${handler.target} is already registered`);
    this.handlers.set(handler.target, handler);
  }

  /** The handler of the target that accepts the kind, or undefined (4.2). */
  for(target: string, kind: ImportKind): ImportHandler | undefined {
    const handler = this.handlers.get(target);
    return handler?.kinds.includes(kind) === true ? handler : undefined;
  }

  /** The handler of a target, whatever kind it accepts. */
  ofTarget(target: string): ImportHandler | undefined {
    return this.handlers.get(target);
  }
}

/** The token of the handlers, which target modules register with at start. */
export const IMPORT_HANDLERS = 'files-imports.ImportHandlers';

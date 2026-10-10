import type { DocumentPreview, ImportKind, PermissionAction } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import type { StagedValue } from '../domain/staging.js';

// The import handler contract (imports-and-opening-data 13.2; module-map 4.7 "Register an import handler", section 3
// rule 6; structure-and-masters 7). files-imports never writes another module's records (PRD-MOD-002): a target
// module registers a handler at start, and Publish hands it the reviewed rows in the transaction it is given. A contract
// files-imports defines and the target module implements: files-imports never depends on that module.
//
// As built for the tracer (S1-F06-T01): the record type, the kinds and effects, the fields of a staged row, the
// permission its publish needs, a preview that writes nothing, and publish. Reference checks, suggestions, mapping-rule
// checks and the review a handler requires are S1-F06-T03's; the scope of its source identity and governed revisions
// S1-F06-T04's.

/** One field of the handler's staged row: its name and whether a document needs it known (PRD-MOD-015). */
export interface ImportField {
  readonly name: string;
  readonly required: boolean;
}

/** A staged row as the handler is given it: its values, each Supplied with its origin or Unknown. */
export interface HandlerRow {
  readonly stagedRowId: string;
  readonly sheet: string;
  readonly rowNumber: number;
  readonly values: Readonly<Record<string, StagedValue>>;
}

/** One document of a batch, with its data rows. */
export interface HandlerDocument {
  readonly documentId: string;
  readonly reference: string;
  readonly rows: readonly HandlerRow[];
}

/** Where a published record came from: the batch, its code, the document and its staged rows (section 5). */
export interface ImportSource {
  readonly batchId: string;
  readonly batchCode: string;
  readonly documentId: string;
  readonly stagedRowIds: readonly string[];
  readonly firstRowNumber: number;
}

/** The person publishing, with the assignment Authorise found for the handler's own permission. */
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
  /**
   * The permission its publish needs beside the batch's, held at step 0 with it, so publishing goes through the same
   * checks as a person's change (structure-and-masters 7; module-map section 3, rule 8).
   */
  readonly publishNeeds: { readonly action: PermissionAction; readonly recordType: string };
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
}

/** The token of the handlers, which target modules register with at start. */
export const IMPORT_HANDLERS = 'files-imports.ImportHandlers';

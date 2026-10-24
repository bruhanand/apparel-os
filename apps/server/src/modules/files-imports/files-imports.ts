import type { TransactionContext } from '../../kernel/index.js';
import type { DecisionEvidence } from '../access/index.js';
import type { AuditInterface } from '../audit/index.js';
import type { PolicyEvidence } from '../configuration/index.js';
import { attach, type Attached, type AttachRequest } from './commands/attach.js';
import type { AttachedRecordReaders } from './contracts/record-readers.js';
import { handlerBatch, type HandlerBatch } from './queries/handler-batch.js';
import { blankTemplate, filledTemplate, type TemplateList } from './queries/template.js';

/**
 * The files-imports module's interface to other modules (module-map 4.7; imports-and-opening-data 13.1). Only Attach
 * is offered here: Store a file and Read a file are routes, because a file is handed in and served by the app and by
 * no other module (code-house-rules 12.1 "Files"; section 11).
 */
export interface FilesImportsInterface {
  /**
   * Links a stored file to one of the caller's records as evidence, inside the caller's own transaction, so a rollback
   * leaves no link. The caller declares the kind of evidence, the restricted classes it carries and the record's scope
   * facts. Never edits an attachment (PRD-MOD-011).
   */
  attach(context: TransactionContext, request: AttachRequest): Promise<Attached>;
  /**
   * A batch as the module whose handler fills it reads it, for its own preview of the file: state, version, facts,
   * subject, documents as its handler is given them and the kept report's issues; undefined when the reader may not see
   * it (13.2 "As built" with S2-F04-T02). The caller authorises the reader with the batch's facts.
   */
  handlerBatch(context: TransactionContext, batchId: string): Promise<HandlerBatch | undefined>;
  /**
   * The blank template of a Confirmed layout version whose Confirmed mapping fills the target, with the lists its
   * values must be on, as XLSX (goods-in section 11; S2-F04-T02); undefined when there is no such version.
   */
  blankTemplate(
    context: TransactionContext,
    request: {
      readonly layoutVersionId: string;
      readonly target: string;
      readonly listsSheet: string;
      readonly lists: readonly TemplateList[];
    },
  ): Promise<{ readonly fileName: string; readonly bytes: Buffer } | undefined>;
  /**
   * A record's rows written in the columns of the layout version it was imported with, each field's value in the
   * column the mapping version reads it from, as XLSX (goods-in 6.5; S2-F06-T01); undefined when either version is not
   * found. The caller has authorised the reader of the record and of every value it writes.
   */
  filledTemplate(
    context: TransactionContext,
    request: {
      readonly layoutVersionId: string;
      readonly mappingVersionId: string;
      readonly rows: readonly Readonly<Record<string, string | number | null>>[];
    },
  ): Promise<Buffer | undefined>;
}

/**
 * The decision-evidence contract `access` defines (access-and-approvals 9.5; module-map section 3, rule 6; S1-F08-T03),
 * implemented by Attach: the composition root hands it to `access`, which never depends on files-imports.
 */
export function decisionEvidence(audit: AuditInterface): DecisionEvidence {
  return { attach: (context, request) => attach(context, audit, request) };
}

/**
 * The policy-evidence contract `configuration` defines (module-map 4.4, section 3 rule 6; DEC-116; S1-F04-T01),
 * implemented by Attach: a signature's or a validation's files, which belong to the Organisation as a whole, so carry
 * no scope fact. The composition root hands it to `configuration`, which never depends on files-imports.
 */
export function policyEvidence(audit: AuditInterface): PolicyEvidence {
  return { attach: (context, request) => attach(context, audit, { ...request, scope: {} }) };
}

export class FilesImports implements FilesImportsInterface {
  constructor(
    private readonly audit: AuditInterface,
    private readonly readers?: AttachedRecordReaders,
  ) {}

  attach(context: TransactionContext, request: AttachRequest): Promise<Attached> {
    return attach(context, this.audit, request, this.readers);
  }

  handlerBatch(context: TransactionContext, batchId: string): Promise<HandlerBatch | undefined> {
    return handlerBatch(context, batchId);
  }

  blankTemplate(
    context: TransactionContext,
    request: {
      readonly layoutVersionId: string;
      readonly target: string;
      readonly listsSheet: string;
      readonly lists: readonly TemplateList[];
    },
  ) {
    return blankTemplate(context, request);
  }

  filledTemplate(
    context: TransactionContext,
    request: {
      readonly layoutVersionId: string;
      readonly mappingVersionId: string;
      readonly rows: readonly Readonly<Record<string, string | number | null>>[];
    },
  ) {
    return filledTemplate(context, request);
  }
}

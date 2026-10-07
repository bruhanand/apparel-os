import type { TransactionContext } from '../../kernel/index.js';
import type { AuditInterface } from '../audit/index.js';
import { attach, type Attached, type AttachRequest } from './commands/attach.js';

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
}

export class FilesImports implements FilesImportsInterface {
  constructor(private readonly audit: AuditInterface) {}

  attach(context: TransactionContext, request: AttachRequest): Promise<Attached> {
    return attach(context, this.audit, request);
  }
}

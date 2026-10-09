import type { TransactionContext } from '../../kernel/index.js';
import type { DecisionEvidence } from '../access/index.js';
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

/**
 * The decision-evidence contract `access` defines (access-and-approvals 9.5; module-map section 3, rule 6; S1-F08-T03),
 * implemented by Attach: the composition root hands it to `access`, which never depends on files-imports.
 */
export function decisionEvidence(audit: AuditInterface): DecisionEvidence {
  return { attach: (context, request) => attach(context, audit, request) };
}

export class FilesImports implements FilesImportsInterface {
  constructor(private readonly audit: AuditInterface) {}

  attach(context: TransactionContext, request: AttachRequest): Promise<Attached> {
    return attach(context, this.audit, request);
  }
}

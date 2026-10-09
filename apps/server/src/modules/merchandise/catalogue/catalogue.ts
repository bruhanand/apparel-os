import type { CatalogueKind, VocabularyProposalDraft } from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { Preparer } from '../../organisation/index.js';
import { CataloguePreparation } from './commands/maintain.js';
import { proposeVocabularyValue } from './commands/proposals.js';
import {
  cataloguePage,
  catalogueRecord,
  proposalPage,
  proposalRecord,
  vocabularyOn,
  type PageRequest,
} from './queries/records.js';

export interface CatalogueDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf'>;
}

/**
 * The merchandise catalogue's interface (module-map 4.12; structure-and-masters 4.7), as built by S1-F03-T01: Maintain
 * masters for brands, brand coverage, categories, size sets, attributes and vocabulary values; Propose a vocabulary
 * value, which a different person confirms or rejects through `access`'s Decide; each master's records with their
 * version history; and a vocabulary as of a date. Every operation joins the caller's transaction through its context
 * (code-house-rules 8.1); the caller has authorised it.
 */
export class Catalogue extends CataloguePreparation {
  private readonly approvals: CatalogueDependencies['access'];

  constructor(dependencies: CatalogueDependencies) {
    super(dependencies.audit, dependencies.access);
    this.approvals = dependencies.access;
  }

  private readonly requests = (context: TransactionContext) => (ids: readonly string[]) =>
    this.approvals.approvalRequestsOf(context, ids);

  proposeVocabularyValue(context: TransactionContext, proposer: Preparer, draft: VocabularyProposalDraft) {
    return proposeVocabularyValue(context, { audit: this.audit, access: this.access }, proposer, draft);
  }

  list<K extends CatalogueKind>(context: TransactionContext, kind: K, today: string, page: PageRequest) {
    return cataloguePage(context, kind, page, today, this.requests(context));
  }

  record<K extends CatalogueKind>(context: TransactionContext, kind: K, recordId: string, today: string) {
    return catalogueRecord(context, kind, recordId, today, this.requests(context));
  }

  listProposals(context: TransactionContext, page: PageRequest) {
    return proposalPage(context, page, this.requests(context));
  }

  proposal(context: TransactionContext, proposalId: string) {
    return proposalRecord(context, proposalId, this.requests(context));
  }

  /** An attribute's approved values in force on a date; never an unconfirmed proposal (4.2; PRD-IMP-008). */
  vocabularyOn(context: TransactionContext, attributeId: string, date: string) {
    return vocabularyOn(context, attributeId, date);
  }
}

export type CatalogueInterface = Catalogue;

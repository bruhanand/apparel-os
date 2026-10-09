import type {
  CatalogueKind,
  CodeMappingDraft,
  CodeMappingEnd,
  ProductProposalDraft,
  ResolveCodeQuery,
  VocabularyProposalDraft,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { Preparer } from '../../organisation/index.js';
import { endCodeMapping, mapCode, resolveCode } from './commands/codes.js';
import { CataloguePreparation } from './commands/maintain.js';
import { proposeProduct } from './commands/products.js';
import { proposeVocabularyValue } from './commands/proposals.js';
import { recordTrackingSiteChange, type SiteChangeActor, type SiteChangeRequest } from './commands/tracking.js';
import type { StockPresence } from './contracts/stock-presence.js';
import type { SupplierRoles } from './contracts/supplier-roles.js';
import { codeMappingPage, productProposalPage, productProposalRecord } from './queries/products.js';
import {
  cataloguePage,
  catalogueRecord,
  proposalPage,
  proposalRecord,
  vocabularyOn,
  type PageRequest,
} from './queries/records.js';
import { skuOn } from './queries/sku.js';

export interface CatalogueDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf'>;
  /** Whether a party holds the supplier role, for a code scoped to a supplier (4.3); the parties part implements it. */
  readonly suppliers: SupplierRoles;
  /** The stock-presence contract `stock` · ledger implements (4.4, 4.6); none answers when left out. */
  readonly stockPresence?: StockPresence | undefined;
}

/**
 * The merchandise catalogue's interface (module-map 4.12; structure-and-masters 4.7): Maintain masters for brands, brand
 * coverage, categories, size sets, attributes and vocabulary values (S1-F03-T01), and tracking profiles with each
 * category's link, styles, SKUs and packs (S1-F03-T02); Propose a vocabulary value or a product, which a different
 * person confirms or rejects through `access`'s Decide; map, end and resolve external codes; read a SKU as of a date;
 * record a change to piece-tracked in force at a Site for its labelling count; each master's records with their version
 * history. Every operation joins the caller's transaction through its context (code-house-rules 8.1); the caller has
 * authorised it.
 */
export class Catalogue extends CataloguePreparation {
  private readonly approvals: CatalogueDependencies['access'];
  private readonly suppliers: SupplierRoles;

  constructor(dependencies: CatalogueDependencies) {
    super(dependencies.audit, dependencies.access, dependencies.stockPresence);
    this.approvals = dependencies.access;
    this.suppliers = dependencies.suppliers;
  }

  private readonly requests = (context: TransactionContext) => (ids: readonly string[]) =>
    this.approvals.approvalRequestsOf(context, ids);

  proposeVocabularyValue(context: TransactionContext, proposer: Preparer, draft: VocabularyProposalDraft) {
    return proposeVocabularyValue(context, { audit: this.audit, access: this.access }, proposer, draft);
  }

  /** Propose a product: a new style with its SKUs, or new SKUs of a style (4.2; PRD-MER-013). */
  proposeProduct(context: TransactionContext, proposer: Preparer, draft: ProductProposalDraft) {
    return proposeProduct(context, { audit: this.audit, access: this.access }, proposer, draft);
  }

  /** Map a code to a SKU and unit in a scope (4.3; PRD-MER-006 to PRD-MER-008). */
  mapCode(context: TransactionContext, preparer: Preparer, draft: CodeMappingDraft) {
    return mapCode(context, { audit: this.audit, suppliers: this.suppliers }, preparer, draft);
  }

  /** End a mapping on a date, keeping it as it was before then (4.3; PRD-MER-007). */
  endCodeMapping(context: TransactionContext, preparer: Preparer, mappingId: string, draft: CodeMappingEnd) {
    return endCodeMapping(context, this.audit, preparer, mappingId, draft);
  }

  /** Resolve a code to its SKU and unit, or refuse an ambiguity or no match (4.7; PRD-MER-006, PRD-MER-007). */
  resolveCode(context: TransactionContext, query: ResolveCodeQuery) {
    return resolveCode(context, query);
  }

  /** A SKU as of a date at a Site, with the version identifiers to store (4.7). */
  skuOn(context: TransactionContext, skuId: string, siteId: string, date: string) {
    return skuOn(context, skuId, siteId, date);
  }

  /** What the labelling count calls once complete at a Site: the change to piece-tracked in force there (4.6). */
  recordTrackingSiteChange(context: TransactionContext, actor: SiteChangeActor, request: SiteChangeRequest) {
    return recordTrackingSiteChange(context, this.audit, actor, request);
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

  listProductProposals(context: TransactionContext, page: PageRequest) {
    return productProposalPage(context, page, this.requests(context));
  }

  productProposal(context: TransactionContext, proposalId: string) {
    return productProposalRecord(context, proposalId, this.requests(context));
  }

  listCodeMappings(context: TransactionContext, query: PageRequest & { readonly skuId?: string | undefined }) {
    return codeMappingPage(context, query);
  }

  /** An attribute's approved values in force on a date; never an unconfirmed proposal (4.2; PRD-IMP-008). */
  vocabularyOn(context: TransactionContext, attributeId: string, date: string) {
    return vocabularyOn(context, attributeId, date);
  }
}

export type CatalogueInterface = Catalogue;

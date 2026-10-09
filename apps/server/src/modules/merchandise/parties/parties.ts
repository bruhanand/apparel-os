import type { TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface, OrganisationKeys } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { FilesImportsInterface } from '../../files-imports/index.js';
import { PartiesMaintenance } from './commands/maintain.js';
import {
  agreementPage,
  agreementRecord,
  linkPage,
  openedBankDetails,
  partyPage,
  partyRecord,
  termsInForce,
  type PageRequest,
} from './queries/records.js';

export interface PartiesDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'approvalRequestsOf'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  /** The Organisation keys, under which bank details are sealed (access-and-approvals 6). */
  readonly keys: OrganisationKeys | undefined;
}

/**
 * The parties part's interface (module-map 4.12; structure-and-masters 5.5), as built by S1-F03-T03: Maintain a party
 * or an agreement, Change bank details, Read a party, Read the terms in force, the brand–supplier links, and each
 * record with its version history. Every operation joins the caller's transaction through its context
 * (code-house-rules 8.1); the caller has authorised it, the field classes and the fresh code included.
 */
export class Parties extends PartiesMaintenance {
  private readonly readers: PartiesDependencies['access'];

  constructor(dependencies: PartiesDependencies) {
    super(dependencies);
    this.readers = dependencies.access;
  }

  private readonly requests = (context: TransactionContext) => (ids: readonly string[]) =>
    this.readers.approvalRequestsOf(context, ids);

  listParties(context: TransactionContext, today: string, page: PageRequest = {}) {
    return partyPage(context, page, today, this.requests(context));
  }

  /** Read a party (5.5): the party, its roles and its bank-detail versions, always masked here. */
  readParty(context: TransactionContext, partyId: string, today: string) {
    return partyRecord(context, partyId, today, this.requests(context));
  }

  /** One bank-detail version opened, for the protected Show (access-and-approvals 3.3, 6; DEC-114). */
  openBankDetails(context: TransactionContext, partyId: string, versionId: string) {
    const keys = this.dependencies.keys;
    if (keys === undefined) throw new Error('Bank details open only with the Organisation keys');
    return openedBankDetails(context, keys, partyId, versionId);
  }

  listBrandSupplierLinks(context: TransactionContext, today: string, page: PageRequest = {}) {
    return linkPage(context, page, today);
  }

  listAgreements(context: TransactionContext, today: string, showMargins: boolean, page: PageRequest = {}) {
    return agreementPage(context, page, today, this.requests(context), showMargins);
  }

  readAgreement(context: TransactionContext, agreementId: string, today: string, showMargins: boolean) {
    return agreementRecord(context, agreementId, today, this.requests(context), showMargins);
  }

  /** Read the terms in force (5.5; PRD-ORG-016): of a brand or a supplier on a date, with the version's identifier. */
  termsInForce(
    context: TransactionContext,
    of: { readonly brandId?: string | undefined; readonly partyId?: string | undefined },
    date: string,
    showMargins: boolean,
  ) {
    return termsInForce(context, of, date, showMargins);
  }
}

export type PartiesInterface = Parties;

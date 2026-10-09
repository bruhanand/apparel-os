import { uuidv7 } from '@apparel-os/domain';
import {
  AGREEMENT_CHANGE,
  AGREEMENT_TYPE,
  BANK_DETAILS_CHANGE,
  BANK_DETAILS_TYPE,
  BRAND_SUPPLIER_LINK_TYPE,
  PARTY_TYPE,
  type AgreementDraft,
  type AgreementTerms,
  type AgreementVersionDraft,
  type BankDetailsDraft,
  type BrandSupplierLinkDraft,
  type MissingItem,
  type PartyChanged,
  type PartyDraft,
  type PartyRole,
  type PartyRoleVersionDraft,
  type PartyVersionDraft,
} from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import {
  LOCK_STEP,
  lockTable,
  sqlStateOf,
  type CommandRefusal,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AccessInterface, OrganisationKeys, Preparer } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import type { FilesImportsInterface } from '../../../files-imports/index.js';
import { brandExists, brandInForce } from '../../catalogue/index.js';
import {
  agreement,
  agreementVersion,
  brandSupplierLink,
  brandSupplierLinkVersion,
  party,
  partyBankDetails,
  partyContact,
  partyRole,
  partyTaxIdentity,
  partyVersion,
} from '../db/schema.js';
import { sealBankDetails } from '../domain/bank-seal.js';
import { AGREEMENT_TERMS_FORMAT } from '../domain/kinds.js';
import {
  approvedOn,
  holdsRoleOn,
  inForceOn,
  lineOf,
  refused,
  roleLine,
  staleToken,
  takeEffect,
  today,
  type Line,
  type Outcome,
} from './lines.js';

// Maintain a party or an agreement, and Change bank details (structure-and-masters 2.2, 2.3, 5.1, 5.2, 5.5; module-map
// 4.12; S1-F03-T03): a new record with its first version, or a new version, under the record's lock. A party's
// versions, its roles and the brand–supplier links take effect when recorded, as no source names an approval for them
// (2.3; RR-467's reading); a bank-detail version and an agreement version wait for a different authorised person
// (POL-02.07; GC2-2, GC2-6, DEC-105), decided through `access` (effects.ts). Each change writes its audit record in the
// same transaction (2.5); bank details enter it only as references to their versions (numbering-and-audit 4.3).

type ValueChange = Extract<AuditChange, { kind: 'value' }>;
type Json = ValueChange['after'];
const value = (field: string, after: Json): ValueChange => ({ kind: 'value', field, before: null, after });

export interface MaintainDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  readonly keys: OrganisationKeys | undefined;
}

const UNIQUE_VIOLATION = '23505';
const from = (start: string) => `[${start},)`;
const partyItem = (partyId: string): MissingItem => ({ kind: 'record', recordType: PARTY_TYPE, recordId: partyId });

/** What an agreement's signed agreement carries: margins are restricted, so it carries `margin` (5.2; PRD-ACS-008). */
export const SIGNED_AGREEMENT = { kind: 'merchandise.signed-agreement', restrictedClasses: ['margin'] } as const;

export class PartiesMaintenance {
  constructor(protected readonly dependencies: MaintainDependencies) {}

  private async startOf(context: TransactionContext, validFrom: string): Promise<CommandRefusal | undefined> {
    const date = await today(context);
    if (typeof date !== 'string') return date;
    // GC2-7, DEC-105: no version ever starts on a past date (structure-and-masters 2.2).
    if (validFrom < date) return { kind: 'refused', code: 'merchandise.starts-in-past', missing: [] };
    return undefined;
  }

  /** Locks a record's identity row exclusively at step 1 (code-house-rules 8.2); false when it does not exist. */
  private async lockRecord(
    context: TransactionContext,
    table: 'party' | 'agreement' | 'brand_supplier_link',
    id: string,
  ): Promise<boolean> {
    const locked = await context.lock(LOCK_STEP.document, [
      { table: lockTable('merchandise', table), id, mode: 'exclusive' },
    ]);
    return !locked.missing.some((each) => each.id === id);
  }

  /** Inserts an identity row whose code is unique, refusing a taken code, a race included (2.1). */
  private async insertCoded(context: TransactionContext, write: () => Promise<unknown>): Promise<boolean> {
    await context.tx.execute(sql`savepoint merchandise_new_party_record`);
    try {
      await write();
      await context.tx.execute(sql`release savepoint merchandise_new_party_record`);
      return true;
    } catch (error) {
      if (sqlStateOf(error) !== UNIQUE_VIOLATION) throw error;
      await context.tx.execute(sql`rollback to savepoint merchandise_new_party_record`);
      return false;
    }
  }

  private async audit(
    context: TransactionContext,
    preparer: Preparer,
    record: { readonly type: string; readonly id: string; readonly versionId?: string },
    operation: string,
    changes: readonly AuditChange[],
  ): Promise<void> {
    await this.dependencies.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'merchandise', ...record },
      operation,
      changes,
      source: { kind: 'screen' },
    });
  }

  // Parties (5.1; PRD-MER-001).

  private async writePartyVersion(
    context: TransactionContext,
    preparer: Preparer,
    partyId: string,
    draft: PartyDraft | PartyVersionDraft,
  ): Promise<string> {
    const versionId = uuidv7();
    await context.tx.insert(partyVersion).values({
      id: versionId,
      partyId,
      legalName: draft.legalName,
      msmeClassification: draft.msmeClassification,
      validDuring: from(draft.validFrom),
      decision: 'Awaiting approval',
      preparedByUserId: preparer.userId,
    });
    if (draft.taxIdentities.length > 0) {
      await context.tx
        .insert(partyTaxIdentity)
        .values(draft.taxIdentities.map((each) => ({ id: uuidv7(), partyVersionId: versionId, ...each })));
    }
    if (draft.contacts.length > 0) {
      await context.tx
        .insert(partyContact)
        .values(
          draft.contacts.map((contact, position) => ({ id: uuidv7(), partyVersionId: versionId, position, contact })),
        );
    }
    await takeEffect(context, lineOf('party_version', PARTY_TYPE, 'party_id', partyId), versionId, draft.validFrom);
    return versionId;
  }

  private partyChanges(draft: PartyDraft | PartyVersionDraft): AuditChange[] {
    return [
      value('legalName', draft.legalName),
      value(
        'taxIdentities',
        draft.taxIdentities.map((each) => ({ ...each })),
      ),
      value('msmeClassification', draft.msmeClassification),
      value('contacts', [...draft.contacts]),
      value('validFrom', draft.validFrom),
    ];
  }

  private async writeRole(
    context: TransactionContext,
    preparer: Preparer,
    partyId: string,
    role: PartyRole,
    held: boolean,
    validFrom: string,
  ): Promise<string> {
    const versionId = uuidv7();
    await context.tx.insert(partyRole).values({
      id: versionId,
      partyId,
      role,
      held,
      validDuring: from(validFrom),
      decision: 'Awaiting approval',
      preparedByUserId: preparer.userId,
    });
    await takeEffect(context, roleLine(partyId, role), versionId, validFrom);
    return versionId;
  }

  /** A new party with its first version and the roles it holds from the same day; in force when recorded (2.3). */
  async prepareParty(
    context: TransactionContext,
    preparer: Preparer,
    draft: PartyDraft,
  ): Promise<Outcome<PartyChanged>> {
    const past = await this.startOf(context, draft.validFrom);
    if (past !== undefined) return { kind: 'refusal', refusal: past };
    const partyId = uuidv7();
    if (!(await this.insertCoded(context, () => context.tx.insert(party).values({ id: partyId, code: draft.code })))) {
      return refused('refused', 'merchandise.code-taken');
    }
    const versionId = await this.writePartyVersion(context, preparer, partyId, draft);
    for (const role of draft.roles) await this.writeRole(context, preparer, partyId, role, true, draft.validFrom);
    await this.audit(context, preparer, { type: 'party', id: partyId, versionId }, 'record-party', [
      value('code', draft.code),
      ...this.partyChanges(draft),
      value('roles', [...draft.roles]),
    ]);
    return { kind: 'success', answer: { recordId: partyId, versionId } };
  }

  /** A party's later version: its legal name, tax identities, MSME classification and contacts (5.1). */
  async preparePartyVersion(
    context: TransactionContext,
    preparer: Preparer,
    partyId: string,
    draft: PartyVersionDraft,
  ): Promise<Outcome<PartyChanged>> {
    const past = await this.startOf(context, draft.validFrom);
    if (past !== undefined) return { kind: 'refusal', refusal: past };
    if (!(await this.lockRecord(context, 'party', partyId))) {
      return refused('not-found', 'merchandise.record-not-found', [partyItem(partyId)]);
    }
    const line = lineOf('party_version', PARTY_TYPE, 'party_id', partyId);
    const stale = await staleToken(context, line, draft.versionToken);
    if (stale !== undefined) return { kind: 'refusal', refusal: stale };
    const overlap = await approvedOn(context, line, draft.validFrom);
    if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
    const versionId = await this.writePartyVersion(context, preparer, partyId, draft);
    await this.audit(
      context,
      preparer,
      { type: 'party', id: partyId, versionId },
      'record-party-version',
      this.partyChanges(draft),
    );
    return { kind: 'success', answer: { recordId: partyId, versionId } };
  }

  /** One role held, or no longer held, from a date: each role its own dated record (5.1; PRD-MER-001). */
  async preparePartyRoleVersion(
    context: TransactionContext,
    preparer: Preparer,
    partyId: string,
    draft: PartyRoleVersionDraft,
  ): Promise<Outcome<PartyChanged>> {
    const past = await this.startOf(context, draft.validFrom);
    if (past !== undefined) return { kind: 'refusal', refusal: past };
    if (!(await this.lockRecord(context, 'party', partyId))) {
      return refused('not-found', 'merchandise.record-not-found', [partyItem(partyId)]);
    }
    const line = roleLine(partyId, draft.role);
    const stale = await staleToken(context, line, draft.versionToken);
    if (stale !== undefined) return { kind: 'refusal', refusal: stale };
    const overlap = await approvedOn(context, line, draft.validFrom);
    if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
    const versionId = await this.writeRole(context, preparer, partyId, draft.role, draft.held, draft.validFrom);
    await this.audit(context, preparer, { type: 'party', id: partyId, versionId }, 'record-party-role-version', [
      value('role', draft.role),
      value('held', draft.held),
      value('validFrom', draft.validFrom),
    ]);
    return { kind: 'success', answer: { recordId: partyId, versionId } };
  }

  /**
   * Change bank details (5.1, 5.5; PRD-ACS-008, PRD-SEC-006): a new version, sealed under the Organisation's key before
   * it reaches PostgreSQL (access-and-approvals 6), that waits for a different authorised person, a supplier's under
   * POL-02.07 and every other party's under GC2-6 (DEC-105). The caller has taken the fresh code (3.3). The audit record
   * names the versions only, never the value (numbering-and-audit 4.3).
   */
  async prepareBankDetails(
    context: TransactionContext,
    preparer: Preparer,
    partyId: string,
    draft: Omit<BankDetailsDraft, 'totpCode'>,
  ): Promise<Outcome<PartyChanged>> {
    const keys = this.dependencies.keys;
    if (keys === undefined) throw new Error('Bank details are kept only encrypted: the Organisation keys are needed');
    const past = await this.startOf(context, draft.validFrom);
    if (past !== undefined) return { kind: 'refusal', refusal: past };
    if (!(await this.lockRecord(context, 'party', partyId))) {
      return refused('not-found', 'merchandise.record-not-found', [partyItem(partyId)]);
    }
    const line = lineOf('party_bank_details', BANK_DETAILS_TYPE, 'party_id', partyId);
    const stale = await staleToken(context, line, draft.versionToken);
    if (stale !== undefined) return { kind: 'refusal', refusal: stale };
    const date = await today(context);
    const inForce = typeof date === 'string' ? await inForceOn(context, line, date) : undefined;
    const versionId = uuidv7();
    const sealed = sealBankDetails(keys, context.organisationCode, versionId, draft);
    await context.tx.insert(partyBankDetails).values({
      id: versionId,
      partyId,
      sealed: sealed.ciphertext,
      scheme: sealed.scheme,
      validDuring: from(draft.validFrom),
      decision: 'Awaiting approval',
      preparedByUserId: preparer.userId,
    });
    await this.audit(
      context,
      preparer,
      { type: 'party_bank_details', id: partyId, versionId },
      'prepare-party-bank-details-version',
      [
        {
          kind: 'encrypted',
          field: 'bankDetails',
          fieldClass: 'bank-details',
          before: inForce === undefined ? { kind: 'absent' } : { kind: 'version', versionId: inForce },
          after: { kind: 'version', versionId },
        },
        value('validFrom', draft.validFrom),
      ],
    );
    // A different authorised person decides it; a request still open on an earlier version is Superseded (9.6).
    const requestId = await this.dependencies.access.requestApproval(context, {
      actionType: BANK_DETAILS_CHANGE,
      document: { module: 'merchandise', recordType: BANK_DETAILS_TYPE, recordId: partyId, versionId },
      value: { kind: 'none' },
      preparers: [preparer.userId],
      requestedBy: preparer,
    });
    return { kind: 'success', answer: { recordId: partyId, versionId, requestId } };
  }

  // Brand–supplier links (5.1; PRD-MER-021; DEC-123).

  /**
   * A brand linked to, or unlinked from, a supplier from a date: many-to-many, never exclusive, so no supplier is
   * inferred from a brand. A link names a brand in force and a party holding the supplier role on its start.
   */
  async prepareBrandSupplierLink(
    context: TransactionContext,
    preparer: Preparer,
    draft: BrandSupplierLinkDraft,
  ): Promise<Outcome<PartyChanged>> {
    const past = await this.startOf(context, draft.validFrom);
    if (past !== undefined) return { kind: 'refusal', refusal: past };
    if (!(await brandExists(context, draft.brandId))) {
      return refused('not-found', 'merchandise.record-not-found', [
        { kind: 'record', recordType: 'merchandise.brand', recordId: draft.brandId },
      ]);
    }
    const [found] = await context.tx.select({ id: party.id }).from(party).where(eq(party.id, draft.partyId));
    if (found === undefined) return refused('not-found', 'merchandise.record-not-found', [partyItem(draft.partyId)]);
    await context.tx
      .insert(brandSupplierLink)
      .values({ id: uuidv7(), brandId: draft.brandId, partyId: draft.partyId })
      .onConflictDoNothing();
    const [link] = await context.tx
      .select({ id: brandSupplierLink.id })
      .from(brandSupplierLink)
      .where(and(eq(brandSupplierLink.brandId, draft.brandId), eq(brandSupplierLink.partyId, draft.partyId)));
    if (link === undefined || !(await this.lockRecord(context, 'brand_supplier_link', link.id))) {
      throw new Error('A brand–supplier link could be neither written nor found');
    }
    const line = lineOf('brand_supplier_link_version', BRAND_SUPPLIER_LINK_TYPE, 'link_id', link.id);
    const stale = await staleToken(context, line, draft.versionToken);
    if (stale !== undefined) return { kind: 'refusal', refusal: stale };
    if (draft.linked) {
      if (!(await holdsRoleOn(context, draft.partyId, 'supplier', draft.validFrom))) {
        return refused('refused', 'merchandise.party-not-supplier', [partyItem(draft.partyId)]);
      }
      if (!(await brandInForce(context, draft.brandId, draft.validFrom))) {
        return refused('refused', 'merchandise.reference-not-in-force', [
          { kind: 'record', recordType: 'merchandise.brand', recordId: draft.brandId },
        ]);
      }
    }
    const overlap = await approvedOn(context, line, draft.validFrom);
    if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
    const versionId = uuidv7();
    await context.tx.insert(brandSupplierLinkVersion).values({
      id: versionId,
      linkId: link.id,
      linked: draft.linked,
      validDuring: from(draft.validFrom),
      decision: 'Awaiting approval',
      preparedByUserId: preparer.userId,
    });
    await takeEffect(context, line, versionId, draft.validFrom);
    await this.audit(
      context,
      preparer,
      { type: 'brand_supplier_link', id: link.id, versionId },
      'record-brand-supplier-link-version',
      [
        value('brandId', draft.brandId),
        value('partyId', draft.partyId),
        value('linked', draft.linked),
        value('validFrom', draft.validFrom),
      ],
    );
    return { kind: 'success', answer: { recordId: link.id, versionId } };
  }

  // Agreements (5.2; PRD-ORG-016, PRD-PAY-015, POL-01).

  private async writeAgreementVersion(
    context: TransactionContext,
    preparer: Preparer,
    agreementId: string,
    draft: AgreementDraft | AgreementVersionDraft,
    operation: 'prepare-agreement' | 'prepare-agreement-version',
    fixed: readonly AuditChange[],
  ): Promise<Outcome<PartyChanged>> {
    const versionId = uuidv7();
    // The signed agreement, stored files attached to this version as evidence, carrying margin (5.2; S1-F06-T05).
    const attachmentIds: string[] = [];
    for (const file of draft.signedAgreement) {
      const attached = await this.dependencies.files.attach(context, {
        storedFileId: file.storedFileId,
        fileReceiptId: file.fileReceiptId,
        record: { module: 'merchandise', type: AGREEMENT_TYPE, id: agreementId, versionId },
        evidence: SIGNED_AGREEMENT,
        scope: {},
        attachedBy: { kind: 'user', id: preparer.userId },
        roleAssignmentId: preparer.roleAssignmentId,
      });
      attachmentIds.push(attached.attachmentId);
    }
    await context.tx.insert(agreementVersion).values({
      id: versionId,
      agreementId,
      terms: draft.terms,
      termsFormat: AGREEMENT_TERMS_FORMAT,
      margins: draft.margins,
      signedAgreementAttachmentIds: attachmentIds,
      validDuring: from(draft.validFrom),
      decision: 'Awaiting approval',
      preparedByUserId: preparer.userId,
    });
    await this.audit(context, preparer, { type: 'agreement', id: agreementId, versionId }, operation, [
      ...fixed,
      value('terms', draft.terms),
      // Margins are restricted: the audit record keeps them under their field class (numbering-and-audit 4.3).
      { kind: 'restricted', field: 'margins', fieldClass: 'margin', before: null, after: draft.margins },
      value('signedAgreement', attachmentIds),
      value('validFrom', draft.validFrom),
    ]);
    // A different authorised person decides it (GC2-2, DEC-105); an open request on an earlier version is Superseded.
    const requestId = await this.dependencies.access.requestApproval(context, {
      actionType: AGREEMENT_CHANGE,
      document: { module: 'merchandise', recordType: AGREEMENT_TYPE, recordId: agreementId, versionId },
      value: { kind: 'none' },
      preparers: [preparer.userId],
      requestedBy: preparer,
    });
    return { kind: 'success', answer: { recordId: agreementId, versionId, requestId } };
  }

  /** A brand agreement's cash-discount and interest terms stay Unknown: they are a supplier's (PRD-PAY-015). */
  private supplierTermsRefused(isBrand: boolean, terms: AgreementTerms): Outcome<PartyChanged> | undefined {
    if (!isBrand) return undefined;
    const given = [terms.cashDiscount, terms.interest].some(
      (term) => term.rate !== null || term.days !== null || term.from !== null,
    );
    return given ? refused('refused', 'merchandise.supplier-terms-on-brand-agreement') : undefined;
  }

  /** A new agreement with a brand or a supplier, with its first version, which waits for approval (5.2). */
  async prepareAgreement(
    context: TransactionContext,
    preparer: Preparer,
    draft: AgreementDraft,
  ): Promise<Outcome<PartyChanged>> {
    const past = await this.startOf(context, draft.validFrom);
    if (past !== undefined) return { kind: 'refusal', refusal: past };
    const counterparty = draft.counterparty;
    const isBrand = counterparty.kind === 'brand';
    const brandTerms = this.supplierTermsRefused(isBrand, draft.terms);
    if (brandTerms !== undefined) return brandTerms;
    if (counterparty.kind === 'brand') {
      if (!(await brandExists(context, counterparty.brandId))) {
        return refused('not-found', 'merchandise.record-not-found', [
          { kind: 'record', recordType: 'merchandise.brand', recordId: counterparty.brandId },
        ]);
      }
    } else {
      const [found] = await context.tx.select({ id: party.id }).from(party).where(eq(party.id, counterparty.partyId));
      if (found === undefined) {
        return refused('not-found', 'merchandise.record-not-found', [partyItem(counterparty.partyId)]);
      }
    }
    const brandId = counterparty.kind === 'brand' ? counterparty.brandId : null;
    const partyId = counterparty.kind === 'supplier' ? counterparty.partyId : null;
    const existing = await context.tx
      .select({ id: agreement.id })
      .from(agreement)
      .where(
        counterparty.kind === 'brand'
          ? eq(agreement.brandId, counterparty.brandId)
          : eq(agreement.partyId, counterparty.partyId),
      );
    if (existing[0] !== undefined) {
      return refused('refused', 'merchandise.agreement-exists', [
        { kind: 'record', recordType: AGREEMENT_TYPE, recordId: existing[0].id },
      ]);
    }
    const codeTaken = await context.tx
      .select({ id: agreement.id })
      .from(agreement)
      .where(eq(agreement.code, draft.code));
    if (codeTaken[0] !== undefined) return refused('refused', 'merchandise.code-taken');
    const agreementId = uuidv7();
    if (
      !(await this.insertCoded(context, () =>
        context.tx.insert(agreement).values({ id: agreementId, code: draft.code, brandId, partyId }),
      ))
    ) {
      // The code or the counterparty met its unique constraint in a race.
      return refused('refused', 'merchandise.code-taken');
    }
    return this.writeAgreementVersion(context, preparer, agreementId, draft, 'prepare-agreement', [
      value('code', draft.code),
      value('counterparty', { ...counterparty }),
    ]);
  }

  /** A later agreement version: the terms may be revised later, effective-dated (PRD-ORG-016, POL-01.03). */
  async prepareAgreementVersion(
    context: TransactionContext,
    preparer: Preparer,
    agreementId: string,
    draft: AgreementVersionDraft,
  ): Promise<Outcome<PartyChanged>> {
    const past = await this.startOf(context, draft.validFrom);
    if (past !== undefined) return { kind: 'refusal', refusal: past };
    if (!(await this.lockRecord(context, 'agreement', agreementId))) {
      return refused('not-found', 'merchandise.record-not-found', [
        { kind: 'record', recordType: AGREEMENT_TYPE, recordId: agreementId },
      ]);
    }
    const [head] = await context.tx
      .select({ brandId: agreement.brandId, partyId: agreement.partyId })
      .from(agreement)
      .where(eq(agreement.id, agreementId));
    if (head === undefined) {
      return refused('not-found', 'merchandise.record-not-found', [
        { kind: 'record', recordType: AGREEMENT_TYPE, recordId: agreementId },
      ]);
    }
    const brandTerms = this.supplierTermsRefused(head.brandId !== null, draft.terms);
    if (brandTerms !== undefined) return brandTerms;
    const line: Line = lineOf('agreement_version', AGREEMENT_TYPE, 'agreement_id', agreementId);
    const stale = await staleToken(context, line, draft.versionToken);
    if (stale !== undefined) return { kind: 'refusal', refusal: stale };
    return this.writeAgreementVersion(context, preparer, agreementId, draft, 'prepare-agreement-version', []);
  }
}

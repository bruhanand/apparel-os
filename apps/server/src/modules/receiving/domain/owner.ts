import type { AgreementTerms } from '@apparel-os/schemas';
import type { Owner } from '../../stock/ledger/index.js';

// The owner a GRN records on its receipt counts (goods-in 4.5, 4.8; stock-ledger 4; PRD-ORG-014, POL-01.05 to
// POL-01.07; DEC-141; S2-F02-T02). Ownership follows the brand's Agreement in force on the arrival date, by its
// ownership-transfer event, never by its commercial model's label alone (PRD-ORG-014). Pure: no database, no clock
// (code-house-rules 2).

/** The brand's Agreement version in force on the arrival date, as `merchandise` · parties reads it. */
export interface BrandAgreement {
  readonly versionId: string;
  readonly brandId: string;
  readonly terms: Pick<AgreementTerms, 'ownershipEvent'>;
}

/**
 * The owner at the receipt count, by the Agreement's ownership-transfer event (`DEC-141`, POL-01.05):
 *
 * - ownership passed at the supplier's dispatch, so before the goods arrived: the Organisation, as the legal entity of
 *   the receiving unit;
 * - ownership passes at the sale to the customer (typically consignment): the brand the Agreement is with, until that
 *   sale;
 * - ownership passes at receipt and acceptance: the brand, at the count; it passes to the Organisation at the scan-in
 *   at the receiving Site, which is the acceptance (goods-in section 7; PRD-REC-021, PRD-REC-022), and the scan-in
 *   records that change (S2-F07-T01), never the GRN;
 * - no Agreement in force, no event recorded, or another event described in words: Unknown until recorded, never
 *   guessed (PRD-MOD-015).
 */
export function receiptOwner(agreement: BrandAgreement | undefined, legalEntityId: string): Owner {
  if (agreement === undefined) return { kind: 'unknown' };
  switch (agreement.terms.ownershipEvent?.kind) {
    case 'supplier-dispatch':
      return { kind: 'organisation', legalEntityId, agreementVersionId: agreement.versionId };
    case 'sale-to-customer':
    case 'receipt-and-acceptance':
      return { kind: 'brand', brandId: agreement.brandId, agreementVersionId: agreement.versionId };
    default:
      return { kind: 'unknown' };
  }
}

/** The owner as the GRN keeps it: its kind and the identifier of whoever it names. */
export function ownerColumns(owner: Owner): { readonly ownerKind: Owner['kind']; readonly ownerId: string | null } {
  switch (owner.kind) {
    case 'organisation':
      return { ownerKind: 'organisation', ownerId: owner.legalEntityId };
    case 'supplier':
      return { ownerKind: 'supplier', ownerId: owner.partyId };
    case 'brand':
      return { ownerKind: 'brand', ownerId: owner.brandId };
    case 'unknown':
      return { ownerKind: 'unknown', ownerId: null };
  }
}

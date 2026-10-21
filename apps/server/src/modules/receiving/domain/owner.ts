import type { AgreementTerms } from '@apparel-os/schemas';
import type { Owner } from '../../stock/ledger/index.js';

// The owner a GRN records on its receipt counts (goods-in 4.5; stock-ledger 4; PRD-ORG-014, POL-01.05 to POL-01.07;
// S2-F02-T02). Ownership follows the brand's Agreement in force on the arrival date, by its ownership-transfer event,
// never by its commercial model's label alone (PRD-ORG-014). Pure: no database, no clock (code-house-rules 2).

/** The brand's Agreement version in force on the arrival date, as `merchandise` · parties reads it. */
export interface BrandAgreement {
  readonly versionId: string;
  readonly brandId: string;
  readonly terms: Pick<AgreementTerms, 'ownershipEvent'>;
}

/**
 * The owner at the receipt count. **Design choice**, for the product owner's review (GI-4):
 *
 * - ownership passed at the supplier's dispatch, so before the goods arrived: the legal entity of the receiving unit;
 * - ownership passes at the sale to the customer (POL-01.05, typically consignment): the brand the Agreement is with,
 *   until that sale;
 * - no Agreement in force, no event recorded, an event of receipt and acceptance (whether the GRN or the scan-in is
 *   that acceptance is not settled; POL-01.06) or another event described in words: Unknown, never guessed
 *   (PRD-MOD-015).
 */
export function receiptOwner(agreement: BrandAgreement | undefined, legalEntityId: string): Owner {
  if (agreement === undefined) return { kind: 'unknown' };
  switch (agreement.terms.ownershipEvent?.kind) {
    case 'supplier-dispatch':
      return { kind: 'organisation', legalEntityId, agreementVersionId: agreement.versionId };
    case 'sale-to-customer':
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

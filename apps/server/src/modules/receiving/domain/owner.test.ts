import type { AgreementTerms } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { ownerColumns, ownerOfGrn, receiptOwner } from './owner.js';

// The owner a GRN records on its receipt counts (goods-in 4.5, 4.8; PRD-ORG-014, POL-01.05, POL-01.06; DEC-141). Every
// identifier here is SYNTHETIC.

const LEGAL_ENTITY = '01900000-0000-7000-8000-0000000000a1';
const BRAND = '01900000-0000-7000-8000-0000000000b1';
const VERSION = '01900000-0000-7000-8000-0000000000c1';

const agreement = (ownershipEvent: AgreementTerms['ownershipEvent']) => ({
  versionId: VERSION,
  brandId: BRAND,
  terms: { ownershipEvent },
});

describe('the owner at the receipt count (goods-in 4.5; PRD-ORG-014, DEC-141)', () => {
  it('PRD-ORG-014 ownership passed at the supplier’s dispatch: the receiving unit’s legal entity, under that Agreement', () => {
    expect(receiptOwner(agreement({ kind: 'supplier-dispatch' }), LEGAL_ENTITY)).toEqual({
      kind: 'organisation',
      legalEntityId: LEGAL_ENTITY,
      agreementVersionId: VERSION,
    });
  });

  it('POL-01.05 ownership passing at the sale to the customer: the brand the Agreement is with, until that sale', () => {
    expect(receiptOwner(agreement({ kind: 'sale-to-customer' }), LEGAL_ENTITY)).toEqual({
      kind: 'brand',
      brandId: BRAND,
      agreementVersionId: VERSION,
    });
  });

  it('POL-01.05 DEC-141 ownership passing at receipt and acceptance: the brand at the count, until the scan-in accepts the goods', () => {
    expect(receiptOwner(agreement({ kind: 'receipt-and-acceptance' }), LEGAL_ENTITY)).toEqual({
      kind: 'brand',
      brandId: BRAND,
      agreementVersionId: VERSION,
    });
  });

  it('PRD-MOD-015 DEC-141 Unknown with no Agreement, no event, or another event described in words: never guessed', () => {
    expect(receiptOwner(undefined, LEGAL_ENTITY)).toEqual({ kind: 'unknown' });
    expect(receiptOwner(agreement(null), LEGAL_ENTITY)).toEqual({ kind: 'unknown' });
    expect(receiptOwner(agreement({ kind: 'other', description: 'SYNTHETIC event' }), LEGAL_ENTITY)).toEqual({
      kind: 'unknown',
    });
  });

  it('PRD-ORG-014 the GRN keeps the owner by its kind and whoever it names, none when Unknown (goods-in 4.5)', () => {
    expect(ownerColumns({ kind: 'organisation', legalEntityId: LEGAL_ENTITY })).toEqual({
      ownerKind: 'organisation',
      ownerId: LEGAL_ENTITY,
    });
    expect(ownerColumns({ kind: 'brand', brandId: BRAND, agreementVersionId: VERSION })).toEqual({
      ownerKind: 'brand',
      ownerId: BRAND,
    });
    expect(ownerColumns({ kind: 'unknown' })).toEqual({ ownerKind: 'unknown', ownerId: null });
  });
});

describe('the owner a recount gives its receipt counts (goods-in 4.11; PRD-ORG-014)', () => {
  it('PRD-ORG-014 the GRN’s owner, read back from what the GRN keeps with its Agreement version', () => {
    expect(ownerOfGrn({ ownerKind: 'brand', ownerId: BRAND, agreementVersionId: VERSION })).toEqual({
      kind: 'brand',
      brandId: BRAND,
      agreementVersionId: VERSION,
    });
    expect(ownerOfGrn({ ownerKind: 'organisation', ownerId: LEGAL_ENTITY, agreementVersionId: VERSION })).toEqual({
      kind: 'organisation',
      legalEntityId: LEGAL_ENTITY,
      agreementVersionId: VERSION,
    });
    expect(ownerOfGrn({ ownerKind: 'unknown', ownerId: null, agreementVersionId: null })).toEqual({ kind: 'unknown' });
    expect(() => ownerOfGrn({ ownerKind: 'brand', ownerId: BRAND, agreementVersionId: null })).toThrow();
  });
});

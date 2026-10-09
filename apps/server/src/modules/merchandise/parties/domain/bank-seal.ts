import type { BankDetailsShown } from '@apparel-os/schemas';
import type { OrganisationKeys, SealedValue } from '../../../access/index.js';

// Bank details kept only encrypted (access-and-approvals 6; PRD-ACS-008, PRD-SEC-006, POL-18.02; S1-F03-T03): sealed in
// the application under the Organisation's key, with a subkey of their own, before they reach PostgreSQL, and bound to
// the version that holds them, so a value copied to another version never opens.

export type BankValues = Omit<BankDetailsShown, 'partyId' | 'versionId'>;

const boundTo = (versionId: string) => `merchandise.party_bank_details:${versionId}`;

export function sealBankDetails(
  keys: OrganisationKeys,
  organisationCode: string,
  versionId: string,
  values: BankValues,
): SealedValue {
  const plain: BankValues = {
    accountHolder: values.accountHolder,
    accountNumber: values.accountNumber,
    ifsc: values.ifsc,
    bankName: values.bankName,
  };
  return keys.encrypt(organisationCode, 'bank-details', Buffer.from(JSON.stringify(plain), 'utf8'), boundTo(versionId));
}

export function openBankDetails(
  keys: OrganisationKeys,
  organisationCode: string,
  versionId: string,
  sealed: SealedValue,
): BankValues {
  const parsed = JSON.parse(
    keys.decrypt(organisationCode, 'bank-details', sealed, boundTo(versionId)).toString('utf8'),
  ) as BankValues;
  return {
    accountHolder: parsed.accountHolder,
    accountNumber: parsed.accountNumber,
    ifsc: parsed.ifsc,
    bankName: parsed.bankName,
  };
}

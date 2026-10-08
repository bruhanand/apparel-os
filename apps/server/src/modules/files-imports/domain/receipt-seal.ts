import type { OrganisationKeys, SealedValue } from '../../access/index.js';

// A receipt's original file name and claimed document reference are encrypted by the application with the
// Organisation's key before the receipt row is written, and decrypted only when an authorised reader is served the file
// through the app (imports-and-opening-data 11, 15.1; PRD-SEC-006, POL-18.02; RR-433). Each value is
// bound to its receipt and to which value it is, so one cannot be read back as the other or under another receipt.

export type ReceiptField = 'original-name' | 'claimed-reference';

function contextOf(receiptId: string, field: ReceiptField): string {
  return `files_imports.file_receipt:${receiptId}:${field}`;
}

export function sealReceiptText(
  keys: OrganisationKeys,
  organisationCode: string,
  receiptId: string,
  field: ReceiptField,
  text: string,
): SealedValue {
  return keys.encrypt(organisationCode, 'file-receipt', Buffer.from(text, 'utf8'), contextOf(receiptId, field));
}

export function openReceiptText(
  keys: OrganisationKeys,
  organisationCode: string,
  receiptId: string,
  field: ReceiptField,
  sealed: SealedValue,
): string {
  return keys.decrypt(organisationCode, 'file-receipt', sealed, contextOf(receiptId, field)).toString('utf8');
}

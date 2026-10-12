import type { NumberedKind } from '../../numbering/index.js';

// What `pos` declares to other modules (offline-counter 4.1, 12.2; numbering-and-audit 3.1, 3.4). Plain values only
// (code-house-rules 2).

/** The record type of a billing device (permission registry; access-and-approvals 5.3). */
export const BILLING_DEVICE_TYPE = 'pos.billing_device';

/**
 * The bill, numbered per billing device and tax registration, restarting each financial year; its texts are unique in
 * the registration and year (numbering-and-audit 3.4, 3.5; PRD-POS-020, PRD-OFF-002, DEC-005).
 */
export const BILL_KIND: NumberedKind = {
  kind: 'pos.bill',
  yearly: true,
  scopeKeyStandsFor: 'billing device and tax registration',
  displayScope: { standsFor: 'tax registration', perYear: true },
};

/** The scope key of a device's bill series for one registration: opaque to `numbering`, `pos`'s to read back. */
export function billScopeKey(deviceId: string, taxRegistrationId: string): string {
  return `device:${deviceId};registration:${taxRegistrationId}`;
}

/** The registration a bill series' scope key names, or undefined for a key of another form. */
export function registrationOfScopeKey(scopeKey: string): string | undefined {
  return /^device:[0-9a-f-]+;registration:([0-9a-f-]+)$/.exec(scopeKey)?.[1];
}

/** The display scope of a bill: its tax registration, with the year (numbering-and-audit 3.5). */
export function billDisplayScopeKey(taxRegistrationId: string): string {
  return `registration:${taxRegistrationId}`;
}

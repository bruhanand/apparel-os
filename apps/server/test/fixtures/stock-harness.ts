import { syntheticIdentifier } from './synthetic.js';

// The synthetic names and values of the stock harness (S1-F10-T04; stock-ledger 15.1 to 15.3; code-house-rules 11.1):
// the driver's module, record type and approval action types, each carrying the synthetic label, and the SYNTHETIC
// approval limit its approver holds. None is a KDPS value, and none becomes a default (POL-02.09).

/** The synthetic document driver's module: a registered synthetic caller (13.2; DEC-112, H2). */
export const HARNESS_MODULE = syntheticIdentifier('stock-harness');
/** The record type the driver posts from (13.2). */
export const HARNESS_RECORD_TYPE = 'document';
/** The driver's document in the permission registry (15.2): no scope fact, since a document can span two places. */
export const HARNESS_DOCUMENT_TYPE = `${HARNESS_MODULE}.${HARNESS_RECORD_TYPE}`;

/** The driver's approval action types (15.3; DEC-112, H4): independent, with cost as their value basis. */
export const HARNESS_ACTIONS = {
  ptApproval: `${HARNESS_MODULE}.approve-pt`,
  transfer: `${HARNESS_MODULE}.approve-transfer`,
  costChange: `${HARNESS_MODULE}.approve-cost-change`,
  supplierReturn: `${HARNESS_MODULE}.approve-supplier-return`,
  // S1-F10-T06: damage, disposal, counts and reversals (S1-F10 spec 3.2).
  damage: `${HARNESS_MODULE}.approve-damage`,
  disposal: `${HARNESS_MODULE}.approve-disposal`,
  count: `${HARNESS_MODULE}.approve-count`,
  reversal: `${HARNESS_MODULE}.approve-reversal`,
} as const;

/**
 * The rejection of a damage report (6.1; PRD-DMG-003): independent, but with no value basis, since a release of a hold
 * answers none (stock-ledger 13.9), so there is no cost under the lock to verify (S1-F10-T06).
 */
export const HARNESS_REJECT_DAMAGE = `${HARNESS_MODULE}.reject-damage`;

/**
 * The SYNTHETIC approval limit on cost the harness's approver holds for each action type: ₹1,00,000.00, covering an
 * Unknown value too (access-and-approvals 9.2; POL-02.09). Labelled synthetic when recorded.
 */
export const SYNTHETIC_COST_LIMIT_PAISE = 10_000_000;

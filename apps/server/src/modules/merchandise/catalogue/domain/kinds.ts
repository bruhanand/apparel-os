import {
  BRAND_COVERAGE_CHANGE,
  catalogueRecordType,
  PRODUCT_CONFIRMATION,
  PRODUCT_PROPOSAL_TYPE,
  VOCABULARY_CONFIRMATION,
  VOCABULARY_PROPOSAL_TYPE,
  type CatalogueKind,
  type RecordState,
} from '@apparel-os/schemas';
import type { ApprovalRule, LatestRequest } from '../../../access/index.js';
import type { Decision } from '../db/schema.js';

// The catalogue's kinds as `merchandise` records, audits and approves them (structure-and-masters 2.3, 4.1, 4.2, 6.2;
// S1-F03-T01).

export const recordTypeOf = catalogueRecordType;

/** A kind as the audit record's operation names it, such as `size-set` (numbering-and-audit 4.1). */
export const operationName = (kind: CatalogueKind) => kind.replaceAll('_', '-');

/**
 * Whether a change to the kind waits for approval: only brand coverage, a versioned field of a business unit and so a
 * change to the structure (structure-and-masters 3.1, 3.3; GC2-2, DEC-105). No source names an approval rule for the
 * other kinds, so their versions take effect when they are recorded (2.3).
 */
export const approved = (kind: CatalogueKind): boolean => kind !== 'business_unit_brand';

/**
 * The approval rules `merchandise` declares (access-and-approvals 8; structure-and-masters 2.3): brand coverage,
 * decided by a different authorised person (GC2-2, DEC-105), and the confirmation of a vocabulary value, by a different
 * person from its proposer (PRD-IMP-008, POL-02.07). Neither has a value (DM-8); the reasons are configured, with no
 * default (POL-02.23); their decision evidence carries no restricted field class (access-and-approvals 9.5).
 */
export const catalogueApprovalRules: readonly ApprovalRule[] = [
  {
    actionType: BRAND_COVERAGE_CHANGE,
    module: 'merchandise',
    recordType: recordTypeOf('business_unit_brand'),
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
  {
    actionType: VOCABULARY_CONFIRMATION,
    module: 'merchandise',
    recordType: VOCABULARY_PROPOSAL_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
  // The confirmation of a product proposal, by a different person from its proposer (4.2; DM-5, DEC-105; S1-F03-T02).
  {
    actionType: PRODUCT_CONFIRMATION,
    module: 'merchandise',
    recordType: PRODUCT_PROPOSAL_TYPE,
    independent: true,
    value: 'none',
    freeTextReason: false,
    decisionEvidenceClasses: [],
    synthetic: false,
  },
];

/** What decides the state a version shows (design-language 7; DM-4, DEC-105; code-house-rules 7.3). */
export function versionState(version: {
  readonly decision: Decision;
  readonly start: string;
  readonly end?: string | undefined;
  readonly today: string;
  readonly requestState?: LatestRequest['state'] | undefined;
}): RecordState {
  switch (version.decision) {
    case 'Rejected':
      return 'Rejected';
    case 'Approved':
      if (version.start > version.today) return 'Scheduled';
      if (version.end !== undefined && version.end <= version.today) return 'Ended';
      return 'In force';
    case 'Awaiting approval':
      return version.requestState === 'Superseded' ? 'Superseded' : 'Awaiting approval';
  }
}

import {
  masterActionType,
  masterKinds,
  masterRecordType,
  type MasterKind,
  type RecordState,
} from '@apparel-os/schemas';
import type { ApprovalRule, LatestRequest } from '../../access/index.js';

// The masters of the organisation structure built so far (structure-and-masters 3.1, 6.1; S1-F02-T01), each an
// identity table and a version table of the schema `organisation`. The list of kinds is the schemas package's, which
// the routes and the screens read too.

export { masterKinds };
export type { MasterKind };

/** The record type a master is authorised, audited and approved on (access-and-approvals 4.1). */
export const recordTypeOf = masterRecordType;

/** The action type of a change to a master: one approval rule each (access-and-approvals 8). */
export const actionTypeOf = masterActionType;

/** A version's decision (code-house-rules 7.3; structure-and-masters 2.3). */
export type Decision = 'Awaiting approval' | 'Approved' | 'Rejected';

/**
 * The approval rule of each master change (access-and-approvals 8; structure-and-masters 2.3): approve on the master's
 * record type, by a different authorised person from its preparer, which can never be switched off (GC2-2, DEC-105;
 * PRD-ACS-006), with no value (DM-8) and a reason from the configured list (POL-02.23). Its configured parts have no
 * default.
 */
export const organisationApprovalRules: readonly ApprovalRule[] = masterKinds.map((kind) => ({
  actionType: actionTypeOf(kind),
  module: 'organisation',
  recordType: recordTypeOf(kind),
  independent: true,
  value: 'none',
  freeTextReason: false,
  // A master change's decision evidence carries no restricted field class (access-and-approvals 9.5; S1-F08-T03).
  decisionEvidenceClasses: [],
  synthetic: false,
}));

/** What decides the state a version shows (design-language 7; DM-4, DEC-105; code-house-rules 7.3). */
export interface VersionFacts {
  readonly decision: Decision;
  /** The first day, and the day after the last, YYYY-MM-DD; no end while open-ended. */
  readonly start: string;
  readonly end?: string | undefined;
  /** Today under the Organisation's timezone (PRD-MOD-009). */
  readonly today: string;
  /** The state of the version's latest approval request: Superseded when a later version replaced it (9.6). */
  readonly requestState?: LatestRequest['state'] | undefined;
}

/** The state a screen shows for a version. Business dates as YYYY-MM-DD compare as text. */
export function versionState(version: VersionFacts): RecordState {
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

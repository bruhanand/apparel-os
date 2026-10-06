import type { RecordState } from '@apparel-os/schemas';

/** What decides the state of one dated version or assignment (code-house-rules 7.3; access-and-approvals 9.6). */
export interface DatedVersion {
  /** The version's decision column: Awaiting approval, Approved, Rejected or Withdrawn (DEC-117). */
  readonly decision: string;
  /** The first day, and the day after the last, of its dates `[start, end)`. */
  readonly start: string;
  readonly end?: string | undefined;
  /** Today under the Organisation's timezone (PRD-MOD-009). */
  readonly today: string;
  /** The state of the version's latest approval request, when it has one. */
  readonly requestState?: string | undefined;
  /** An approved assignment withdrawn before its start (RR-202, CH-11). */
  readonly withdrawn?: boolean;
}

/**
 * The state a screen shows for a version (design-language 7; DM-4, DEC-105, DEC-117; spec section 6). Business dates
 * as YYYY-MM-DD compare as text.
 */
export function recordState(version: DatedVersion): RecordState {
  switch (version.decision) {
    case 'Rejected':
      return 'Rejected';
    case 'Withdrawn':
      return 'Withdrawn';
    case 'Approved':
      if (version.withdrawn === true) return 'Withdrawn';
      if (version.start > version.today) return 'Scheduled';
      if (version.end !== undefined && version.end <= version.today) return 'Ended';
      return 'In force';
    default:
      return version.requestState === 'Superseded' ? 'Superseded' : 'Awaiting approval';
  }
}

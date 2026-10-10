import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import type { EffectDecider } from '../../../access/index.js';
import type { AuditChange, AuditInterface } from '../../../audit/index.js';
import type { Decision } from '../db/schema.js';
import { caEvidenceCovers } from './ca-evidence.js';
import { approvedOn, today, type Line } from './lines.js';

interface Refused {
  readonly kind: 'refusal';
  readonly refusal: CommandRefusal;
}
const refusedAs = (kind: CommandRefusal['kind'], code: string): Refused => ({
  kind: 'refusal',
  refusal: { kind, code, missing: [] },
});

// What every decision on a version of `finance` shares (module-map 6.2 flow A; access-and-approvals 9.8b;
// books-and-posting 6.3; shared-calculations 10.1; S1-F09-T01, S1-F09-T04): its audit record, and the checks an
// approval makes under the locks Decide took. The tax rules part uses them through the books part's interface
// (module-map 4.14; RR-486).

/** A version as a decision reads it: its record, decision and start. */
export interface VersionHead {
  readonly ownerId: string;
  readonly decision: Decision;
  readonly start: string;
}

/** The audit record of a decision's effect on a version of `finance`. */
export async function recordDecision(
  context: TransactionContext,
  audit: AuditInterface,
  decider: EffectDecider,
  record: { readonly type: string; readonly id: string; readonly versionId: string },
  operation: string,
  changes: readonly AuditChange[],
): Promise<void> {
  await audit.record(context, {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    record: { module: 'finance', ...record },
    operation,
    changes,
    source: { kind: 'screen' },
  });
}

export const decisionChange = (after: 'Approved' | 'Rejected'): AuditChange => ({
  kind: 'value',
  field: 'decision',
  before: 'Awaiting approval',
  after,
});

/**
 * The checks every approval of a version makes under the locks: it exists and still waits, does not start in the
 * past (GC2-7, DEC-105), no approved version starts the same day (2.2), and the CA's evidence covers it (6.3;
 * POL-09.01, POL-10.05; DEC-112, GC4-2). Answers the refusal, or undefined.
 */
export async function approvable(
  context: TransactionContext,
  version: VersionHead | undefined,
  line: (recordId: string) => Line,
  versionId: string,
): Promise<Refused | undefined> {
  if (version === undefined) return refusedAs('not-found', 'finance.record-not-found');
  if (version.decision !== 'Awaiting approval') return refusedAs('conflict', 'kernel.stale-version');
  const date = await today(context);
  if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
  // GC2-7, DEC-105: re-dated by preparing it again from today or later (structure-and-masters 2.2).
  if (version.start < date) return refusedAs('refused', 'finance.starts-in-past');
  const ofRecord = line(version.ownerId);
  const overlap = await approvedOn(context, ofRecord, version.start);
  if (overlap !== undefined) return { kind: 'refusal', refusal: overlap };
  // POL-09.01, POL-10.05; DEC-112, GC4-2: a version takes effect only with the CA's approval evidence (6.3).
  if (!(await caEvidenceCovers(context, versionId))) {
    return {
      kind: 'refusal',
      refusal: {
        kind: 'refused',
        code: 'finance.no-ca-evidence',
        missing: [{ kind: 'version', recordType: ofRecord.recordType, recordId: version.ownerId, versionId }],
      },
    };
  }
  return undefined;
}

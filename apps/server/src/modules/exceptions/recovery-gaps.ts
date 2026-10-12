import {
  CommandDefect,
  recordGapRaised,
  recoveryEventsOf,
  recoverySettlementOf,
  type RestoreRaiseStep,
} from '../../kernel/index.js';
import type { ExceptionTypeRegistration } from './domain/types.js';
import type { ExceptionsInterface } from './exceptions.js';

// The recovery gaps of a restore raised as exceptions (backup-and-restore 4.3, 4.5, 5.1; product owner, 12 Oct 2026;
// POL-18.04, PRD-EXC-001, PRD-EXC-002). Each gap after the recovery point, such as an object of the file store stored
// with no record, which may be evidence of lost work, and each failed step or check still standing, is raised as one
// exception once the exception-code series is reconciled, by `exceptions`' restore participant under the restore's
// internal service identity (`restore --raise-gaps`). `exceptions` raises them because the exception is its record and
// it sits above the modules that find the gaps: `files-imports` reports an object with no record through its check,
// and kernel keeps the report, which `exceptions` reads through kernel's interface. The person who owns the exception
// settles it, resolved or accepted, while the Organisation is held; reopening waits until every one is settled.

/** The exception type of a recovery gap or a failed check of a restore, linked to the recovery event that found it. */
export const RECOVERY_GAP_TYPE = 'exceptions.recovery-gap';
export const RECOVERY_EVENT_RECORD_TYPE = 'kernel.recovery_event';

/**
 * The type `exceptions` registers for recovery gaps (4.5): a mismatch between the restored records and outside
 * evidence, or a check of the restore that did not pass. Its resolution check verifies that each linked recovery item
 * was settled, resolved or accepted, by the person who owns it.
 */
export const recoveryGapType: ExceptionTypeRegistration = {
  code: RECOVERY_GAP_TYPE,
  category: 'mismatch',
  module: 'exceptions',
  linksTo: [RECOVERY_EVENT_RECORD_TYPE],
  // The evidence of a recovery gap, such as the incident record, carries no restricted class.
  evidenceClasses: [],
  resolutionCheck: async (context, subject) => {
    const missing = [];
    for (const link of subject.links) {
      if (link.recordType !== RECOVERY_EVENT_RECORD_TYPE) continue;
      if ((await recoverySettlementOf(context, link.recordId)) === undefined)
        missing.push({ kind: 'recovery-gap', eventId: link.recordId });
    }
    return missing.length === 0 ? { kind: 'verified' } : { kind: 'not-verified', missing };
  },
};

/**
 * `exceptions`' restore participant step: raises one recovery item as an exception, in a command of its own that takes
 * the exception-code series, linked to the recovery event that found it, raised by the restore's internal service
 * identity, and records through kernel that it was raised. A replay finds the exception it raised (PRD-INT-008).
 * Refused while the exception-code series is paused: it is reconciled first (5.3).
 */
export function exceptionsRestoreSteps(exceptions: Pick<ExceptionsInterface, 'raiseInOwnCommand'>): RestoreRaiseStep[] {
  return [
    {
      kind: 'raise',
      unit: 'exceptions',
      tier: 2,
      commandName: 'exceptions.raise-recovery-gap',
      authorises: { action: 'create', recordType: 'exceptions.exception' },
      async run(context, item) {
        if (context.actor.kind !== 'actor') throw new CommandDefect('A recovery item is raised by an actor');
        const restored = (await recoveryEventsOf(context, item.restoreId)).some((event) => event.id === item.eventId);
        if (!restored) throw new CommandDefect('A recovery item is one of its restore');
        const raised = await exceptions.raiseInOwnCommand(context, {
          raisingEvent: `recovery-item:${item.eventId}`,
          typeCode: RECOVERY_GAP_TYPE,
          facts: { siteId: null, storeId: null, businessUnitId: null, brandId: null },
          links: [
            { module: 'kernel', recordType: RECOVERY_EVENT_RECORD_TYPE, recordId: item.eventId, versionId: null },
          ],
          exposure: { kind: 'unknown' },
          raisedBy: { kind: 'service-identity', id: context.actor.actorId },
          comment: `${item.kind === 'gap' ? 'Recovery gap' : 'Failed step or check'} of restore ${item.restoreId}: ${item.unit}: ${item.name}${item.subject === null ? '' : ` [${item.subject}]`}`,
        });
        if (raised.kind === 'refused') return { kind: 'refused', refusal: raised.refusal };
        await recordGapRaised(context, {
          restoreId: item.restoreId,
          aboutEventId: item.eventId,
          exceptionId: raised.value.exceptionId,
        });
        return { kind: 'raised', exceptionId: raised.value.exceptionId };
      },
    },
  ];
}

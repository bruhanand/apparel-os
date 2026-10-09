import {
  defineConsumer,
  defineJobKind,
  JOB_RECORD_TYPE,
  jobFailed,
  type ConsumerDefinition,
  type JobKindDefinition,
  type StructuredLogger,
} from '../../../kernel/index.js';
import { Audit } from '../../audit/index.js';
import { Inbox } from '../../inbox/index.js';
import { Numbering } from '../../numbering/index.js';
import { EXCEPTION_CODE_KIND } from '../domain/types.js';
import { Exceptions, unfinishedOperation } from '../exceptions.js';

/**
 * The code of the internal service identity the exceptions job kinds and consumers run as (access-and-approvals 2.3;
 * PRD-SEC-018). The setup step writes it from the worker's registry, with a role assignment granting each action
 * they declare (RR-271).
 */
export const EXCEPTIONS_IDENTITY = 'exceptions';

/** The worker's exceptions, with the module's own type only: the jobs raise nothing else. */
function exceptions(logger: StructuredLogger): Exceptions {
  return new Exceptions({
    numbering: new Numbering({ kinds: [EXCEPTION_CODE_KIND] }),
    inbox: new Inbox(),
    audit: new Audit(logger),
    types: [],
  });
}

/**
 * The job kind that escalates open exceptions past their due time (access-and-approvals 11.3; PRD-ACS-010), sent for
 * each Organisation at the interval of its worker setting (code-house-rules 12.9; CH-10), authorised for edit on
 * `exceptions.exception`.
 */
export const exceptionsJobKinds: readonly JobKindDefinition[] = [
  defineJobKind({
    name: 'exceptions.escalate-overdue',
    serviceIdentity: EXCEPTIONS_IDENTITY,
    authorises: { action: 'edit', recordType: 'exceptions.exception' },
    run: async (context, { logger }) => {
      const actorId = context.actor.kind === 'actor' ? context.actor.actorId : '';
      const escalated = await exceptions(logger).escalateOverdue(context, {
        actor: { kind: 'service-identity', id: actorId },
      });
      return { escalated };
    },
  }),
];

/**
 * The consumer that raises one unfinished-operation exception for a job that failed for good (code-house-rules 12.9;
 * access-and-approvals 9.8 step 4; PRD-EXC-001, PRD-INT-008), keyed by the `kernel.job-failed` event, so a redelivery
 * raises none twice. The exception's Site, Store, business unit and brand are the event's scope facts: those of the
 * work that failed, and none for a job of the Organisation as a whole. With no Open exception-code series or no routing
 * for the type at that Site, it raises nothing and the refusal is kept; the failed job's record stays in the operations
 * view, so nothing is lost (DEC-116).
 */
export const exceptionsConsumers: readonly ConsumerDefinition[] = [
  defineConsumer({
    name: 'exceptions.raise-unfinished-operation',
    event: jobFailed,
    serviceIdentity: EXCEPTIONS_IDENTITY,
    authorises: { action: 'create', recordType: 'exceptions.exception' },
    handle: async (context, event, { logger }) => {
      const actorId = context.actor.kind === 'actor' ? context.actor.actorId : '';
      const raised = await exceptions(logger).raiseInOwnCommand(context, {
        raisingEvent: `kernel.job-failed:${event.id}`,
        typeCode: unfinishedOperation.code,
        facts: {
          siteId: event.scope.siteId ?? null,
          storeId: event.scope.storeId ?? null,
          businessUnitId: event.scope.businessUnitId ?? null,
          brandId: event.scope.brandId ?? null,
        },
        links: [{ module: 'kernel', recordType: JOB_RECORD_TYPE, recordId: event.payload.jobId, versionId: null }],
        exposure: { kind: 'unknown' },
        raisedBy: { kind: 'service-identity', id: actorId },
      });
      return raised.kind === 'done' ? { kind: 'done' } : { kind: 'refused', refusal: raised.refusal };
    },
  }),
];

import { defineJobKind, type JobKindDefinition, type ReplayAuthorisation } from '../../../kernel/index.js';
import { checkPartitionCoverage } from './partition-coverage.js';
import { checkSeals, sealClosedBlock } from './seals.js';

/**
 * The code of the internal service identity the audit job kinds run as (access-and-approvals 2.3; PRD-SEC-018). The
 * setup step writes it with the Organisation's other service identities.
 */
export const AUDIT_JOBS_IDENTITY = 'audit-jobs';

/**
 * A replay of an audit job step is answered after Authenticate alone, which has already passed for it: the steps
 * declare no action until `access` has Authorise and its permission registry (S1-F01-T11; RR-273).
 */
const authenticated: ReplayAuthorisation = () => Promise.resolve({ kind: 'allowed' });

/**
 * The audit job kinds the worker sends for each Organisation at the interval of its worker setting (numbering-and-
 * audit 4.4; RR-241; code-house-rules 12.9): the sealing job, the seal check, and the partition coverage check,
 * which logs the alert `audit-partitions-short`. A failed seal check logs the alert `audit-seals-differ` naming the
 * blocks only. Once `exceptions` exists (S1-F08), both also raise an exception.
 */
export const auditJobKinds: readonly JobKindDefinition[] = [
  defineJobKind({
    name: 'audit.seal-closed-block',
    serviceIdentity: AUDIT_JOBS_IDENTITY,
    authoriseReplay: authenticated,
    run: async (context) => ({ blockNumber: await sealClosedBlock(context) }),
  }),
  defineJobKind({
    name: 'audit.check-seals',
    serviceIdentity: AUDIT_JOBS_IDENTITY,
    authoriseReplay: authenticated,
    run: async (context, { logger }) => {
      const problems = await checkSeals(context);
      if (problems.length > 0) {
        logger.structured(
          'error',
          {
            correlationId: context.correlationId,
            organisationCode: context.organisationCode,
            alert: 'audit-seals-differ',
            blocks: problems.map((problem) => problem.blockNumber),
          },
          'The audit seals differ from the rows they seal (numbering-and-audit 4.4)',
          'Audit',
        );
      }
      return { problems: problems.length };
    },
  }),
  defineJobKind({
    name: 'audit.check-partition-coverage',
    serviceIdentity: AUDIT_JOBS_IDENTITY,
    authoriseReplay: authenticated,
    run: async (context, { logger }) => ({
      coversNextMonth: (await checkPartitionCoverage(context, logger)).coversNextMonth,
    }),
  }),
];

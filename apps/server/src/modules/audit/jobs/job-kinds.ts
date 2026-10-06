import { defineJobKind, type JobKindDefinition } from '../../../kernel/index.js';
import { checkPartitionCoverage } from './partition-coverage.js';
import { checkSeals, sealClosedBlock } from './seals.js';

/**
 * The code of the internal service identity the audit job kinds run as (access-and-approvals 2.3; PRD-SEC-018). The
 * setup step writes it with the Organisation's other service identities.
 */
export const AUDIT_JOBS_IDENTITY = 'audit-jobs';

/**
 * The audit job kinds the worker sends for each Organisation at the interval of its worker setting (numbering-and-
 * audit 4.4; RR-241; code-house-rules 12.9): the sealing job, the seal check, and the partition coverage check,
 * which logs the alert `audit-partitions-short`. A failed seal check logs the alert `audit-seals-differ` naming the
 * blocks only. Once `exceptions` exists (S1-F08), both also raise an exception. Each step is authorised for the
 * action it declares on the audit seal or partition record type, through a role assignment of `audit-jobs`
 * (access-and-approvals 7.1; RR-273).
 */
export const auditJobKinds: readonly JobKindDefinition[] = [
  defineJobKind({
    name: 'audit.seal-closed-block',
    serviceIdentity: AUDIT_JOBS_IDENTITY,
    authorises: { action: 'create', recordType: 'audit.audit_seal' },
    run: async (context) => ({ blockNumber: await sealClosedBlock(context) }),
  }),
  defineJobKind({
    name: 'audit.check-seals',
    serviceIdentity: AUDIT_JOBS_IDENTITY,
    authorises: { action: 'view', recordType: 'audit.audit_seal' },
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
    authorises: { action: 'view', recordType: 'audit.audit_partition' },
    run: async (context, { logger }) => ({
      coversNextMonth: (await checkPartitionCoverage(context, logger)).coversNextMonth,
    }),
  }),
];

import { permissionRegistry, registryByCode } from '@apparel-os/schemas';
import { defineJobKind, type JobKindDefinition } from '../../../kernel/index.js';
import { rebuildGrants } from '../commands/rebuild-grants.js';

/**
 * The code of the internal service identity the access job kinds run as (access-and-approvals 2.3; PRD-SEC-018). The
 * setup step writes it with the Organisation's other service identities and its role assignment (S1-F01-T10).
 */
export const ACCESS_JOBS_IDENTITY = 'access-jobs';

/**
 * The access job kinds the worker sends for each Organisation at the interval of its worker setting
 * (code-house-rules 12.9): the rebuild of effective grants, so a start or end date that passed takes effect
 * (access-and-approvals 7.2; PRD-ACS-005). Its step is authorised for edit on `access.effective_grant` (RR-273).
 */
export const accessJobKinds: readonly JobKindDefinition[] = [
  defineJobKind({
    name: 'access.rebuild-grants',
    serviceIdentity: ACCESS_JOBS_IDENTITY,
    authorises: { action: 'edit', recordType: 'access.effective_grant' },
    run: async (context) => ({ rows: await rebuildGrants(context, registryByCode(permissionRegistry)) }),
  }),
];

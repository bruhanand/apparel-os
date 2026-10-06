import { permissionRegistry, registryByCode } from '@apparel-os/schemas';
import type { JobIdentities } from '../../../kernel/index.js';
import { authorise } from './authorise.js';
import { authenticateInternalIdentity } from './service-identities.js';

/**
 * The JobIdentities contract (access-and-approvals 2.3, 7.1 steps 1 and 3; PRD-SEC-018; RR-273): Authenticate for an
 * internal identity by its code, and Authorise for the action a job step declares, through one role assignment of the
 * identity in force today under the declared permission registry. A refusal names what is missing.
 */
export function jobIdentities(): JobIdentities {
  const registry = registryByCode(permissionRegistry);
  return {
    authenticate: async (context, code) => (await authenticateInternalIdentity(context, code))?.serviceIdentityId,
    authorise: async (context, actorId, need) => {
      const authorised = await authorise(context, registry, { actorId, ...need });
      if (authorised.kind === 'allowed') return { kind: 'allowed' };
      return {
        kind: 'refused',
        refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
      };
    },
  };
}

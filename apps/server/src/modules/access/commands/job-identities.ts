import { permissionRegistry, registryByCode } from '@apparel-os/schemas';
import type { JobIdentities } from '../../../kernel/index.js';
import { authorise } from '../queries/authorise.js';
import { authenticateInternalIdentity } from '../queries/service-identities.js';
import { holdAuthority } from './authority.js';

/**
 * The JobIdentities contract (access-and-approvals 2.3, 7.1 steps 1, 3 and 4; PRD-SEC-018; RR-273): Authenticate for
 * an internal identity by its code, Authorise for the action a job step declares, through one role assignment of the
 * identity in force today under the declared permission registry, and Hold: the same Authorise, then the step-0 locks
 * of the identity, that assignment and its role, shared, with the recheck under them (code-house-rules 8.2; DEC-118,
 * RR-360). A refusal names what is missing.
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
    hold: async (context, actorId, need) => {
      const authorised = await authorise(context, registry, { actorId, ...need });
      if (authorised.kind === 'refused') {
        return {
          kind: 'refused',
          refusal: { kind: 'not-authorised', code: authorised.refusal.code, missing: authorised.refusal.missing },
        };
      }
      const actor = { kind: 'service-identity', id: actorId } as const;
      const refused = await holdAuthority(context, registry, actor, authorised.roleAssignmentId, need);
      if (refused === undefined) return { kind: 'held' };
      // A version of the role took effect, or another assignment grants the action now: try the step again (RR-360).
      if (refused.code === 'kernel.stale-version') return { kind: 'stale' };
      return { kind: 'refused', refusal: { kind: 'not-authorised', code: refused.code, missing: refused.missing } };
    },
  };
}

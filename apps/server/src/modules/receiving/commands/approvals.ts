import { HELD_LINE_DECISION, RECOUNT_APPROVAL } from '@apparel-os/schemas';
import type { DocumentEffect, ModuleApprovals } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { receivingApprovalRules } from '../domain/kinds.js';
import { heldLineDecisionEffect } from './held-line-decision.js';
import { recountEffect, type RecountEffectServices } from './recount-decision.js';

// What `receiving` declares to `access` (access-and-approvals 8, 9.8b; module-map section 3, rule 6): the approval
// rules and the decision effects of a held line's decision (goods-in 4.6; S2-F02-T03) and a recount's approval (goods-in
// 4.11; S2-F02-T05). The composition root hands them to `access` at start; the services they act through reach them
// when they run, since `access` is built with them (9.8b).

/** What the decision effects use, bound late: the gate, and for a recount the ledger, `access`, exceptions, bookings. */
export type EffectServices = RecountEffectServices;

export function receivingApprovals(dependencies: {
  readonly audit: AuditInterface;
  readonly services: () => EffectServices;
}): ModuleApprovals {
  return {
    rules: receivingApprovalRules,
    effects: new Map<string, DocumentEffect>([
      [HELD_LINE_DECISION, heldLineDecisionEffect(dependencies)],
      [RECOUNT_APPROVAL, recountEffect(dependencies)],
    ]),
  };
}

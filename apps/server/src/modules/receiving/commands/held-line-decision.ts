import { uuidv7 } from '@apparel-os/domain';
import { HELD_LINE_DECISION, HELD_LINE_TYPE } from '@apparel-os/schemas';
import { CommandDefect, type CommandRefusal, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { DocumentEffect, EffectDecider, EffectOutcome, ModuleApprovals } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { ConfigurationInterface } from '../../configuration/index.js';
import { heldLineDecision } from '../db/schema.js';
import { RECEIVING_MODULE, receivingApprovalRules } from '../domain/kinds.js';
import { heldLineDecided } from '../events.js';
import { heldLineDecisionUnavailable } from '../queries/availability.js';
import {
  decisionOf,
  heldLineRow,
  latestVersionIdOf,
  versionRow,
  type HeldLineRow,
  type HeldLineVersionRow,
} from '../queries/held-line-rows.js';
import {
  audited,
  factsOf,
  heldLineLock,
  heldLineNotFound,
  recordItem,
  refusalOf,
  scopeColumns,
  valueChange,
  type Actor,
} from './common.js';

// A held line's decision (goods-in 4.6, 4.9, 10.3; PRD-REC-013, POL-17.02, POL-17.11; access-and-approvals 9.8b;
// S2-F02-T03): the effect `access`'s Decide runs in the decision's transaction, once it has refused whoever received
// the goods or named their product (9.3). Approve takes the goods in, reject leaves them held. Decide locks the held
// line's identity row at step 1 with the request (code-house-rules 8.2). Taking goods in releases no hold here: their
// excess hold or quarantine ends through the PT route, at PT approval, so they stay held until the PT is approved
// (PRD-REC-012, POL-17.02; goods-in 4.9).

/** What the decision effect uses, bound late, since `access` is built with it (access-and-approvals 9.8b). */
export interface EffectServices {
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
}

export interface EffectDependencies {
  readonly audit: AuditInterface;
  readonly services: () => EffectServices;
}

/** No version of a held line with that identifier, or none the actor may see (code-house-rules 6.2, 12.3). */
const versionNotFound = (versionId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'receiving.record-not-found',
  missing: [{ kind: 'version', recordType: HELD_LINE_TYPE, versionId }],
});

/**
 * The version a decision binds to, under the held line's lock: the held line's latest version, not decided yet
 * (goods-in 4.6); otherwise `receiving.held-line-decided`.
 */
async function openVersion(
  context: TransactionContext,
  versionId: string,
): Promise<{ readonly row: HeldLineRow; readonly version: HeldLineVersionRow } | { readonly refusal: CommandRefusal }> {
  const version = await versionRow(context, versionId);
  if (version === undefined) return { refusal: versionNotFound(versionId) };
  const row = await heldLineRow(context, version.heldLineId);
  if (row === undefined) return { refusal: heldLineNotFound(version.heldLineId) };
  if ((await latestVersionIdOf(context, row.id)) !== versionId || (await decisionOf(context, row.id)) !== undefined) {
    return {
      refusal: { kind: 'refused', code: 'receiving.held-line-decided', missing: [recordItem(HELD_LINE_TYPE, row.id)] },
    };
  }
  return { row, version };
}

/** Who decides: the person and the assignment relied on, with the decision, which every effect has (9.5). */
function deciding(decider: EffectDecider): { readonly actor: Actor; readonly decisionId: string } {
  if (decider.roleAssignmentId === undefined || decider.approvalDecisionId === undefined) {
    throw new CommandDefect('A held line was decided without its decision or the assignment relied on');
  }
  return {
    actor: { userId: decider.actor.id, roleAssignmentId: decider.roleAssignmentId },
    decisionId: decider.approvalDecisionId,
  };
}

/** A held line's decision: approve takes the goods in, reject leaves them held (goods-in 4.6). */
function decisionEffect(dependencies: EffectDependencies): DocumentEffect {
  const decide = async (
    context: TransactionContext,
    decider: EffectDecider,
    versionId: string,
    outcome: 'taken-in' | 'left-held',
  ): Promise<EffectOutcome> => {
    const open = await openVersion(context, versionId);
    if ('refusal' in open) return refusalOf(open.refusal);
    const { row, version } = open;
    // Unidentified goods are taken in only once Booking names their product (goods-in 4.6; POL-17.02).
    if (outcome === 'taken-in' && row.kind === 'unidentified' && version.kind !== 'named') {
      return refusalOf({
        kind: 'refused',
        code: 'receiving.product-not-named',
        missing: [recordItem(HELD_LINE_TYPE, row.id)],
      });
    }
    const { actor, decisionId } = deciding(decider);
    const heldLineDecisionId = uuidv7();
    await context.tx.insert(heldLineDecision).values({
      id: heldLineDecisionId,
      heldLineId: row.id,
      heldLineVersionId: version.id,
      ...scopeColumns(row),
      outcome,
      approvalDecisionId: decisionId,
      decidedByUserId: actor.userId,
      roleAssignmentId: actor.roleAssignmentId,
      decidedAt: context.startedAt,
    });
    await audited(context, dependencies.audit, actor, row, {
      record: { type: HELD_LINE_TYPE, id: row.id, versionId: version.id },
      operation: outcome === 'taken-in' ? 'take-in-held-line' : 'leave-held-line-held',
      changes: [valueChange('decision', null, outcome), valueChange('kind', null, row.kind)],
      approval: { decisionId },
      ...(decider.reason === undefined ? {} : { reason: decider.reason }),
    });
    await context.publish(heldLineDecided, {
      subject: { module: RECEIVING_MODULE, recordType: HELD_LINE_TYPE, recordId: row.id, versionId: version.id },
      scope: factsOf(row),
      payload: { heldLineId: row.id, heldLineDecisionId },
    });
    return { kind: 'success', answer: { heldLineId: row.id, heldLineDecisionId } };
  };
  return {
    async targets(context, versionId): Promise<LockTarget[]> {
      const version = await versionRow(context, versionId);
      return version === undefined ? [] : [heldLineLock(version.heldLineId)];
    },
    async precheck(context, versionId) {
      const open = await openVersion(context, versionId);
      if ('refusal' in open) return open.refusal;
      return heldLineDecisionUnavailable(context, dependencies.services(), open.row);
    },
    approve: (context, decider, versionId) => decide(context, decider, versionId, 'taken-in'),
    reject: (context, decider, versionId) => decide(context, decider, versionId, 'left-held'),
  };
}

/**
 * The approval rule and decision effect `receiving` declares to `access` (access-and-approvals 8, 9.8b; module-map
 * section 3, rule 6), which the composition root hands to `access` at start.
 */
export function receivingApprovals(dependencies: EffectDependencies): ModuleApprovals {
  return {
    rules: receivingApprovalRules,
    effects: new Map<string, DocumentEffect>([[HELD_LINE_DECISION, decisionEffect(dependencies)]]),
  };
}

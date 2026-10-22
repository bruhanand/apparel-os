import { uuidv7 } from '@apparel-os/domain';
import {
  HELD_LINE_DECISION,
  HELD_LINE_TYPE,
  type HeldLineProductDraft,
  type HeldLineProductNamed,
} from '@apparel-os/schemas';
import { asc, desc, eq } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  lockTable,
  type CommandRefusal,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type {
  AccessInterface,
  DocumentEffect,
  EffectDecider,
  EffectOutcome,
  ModuleApprovals,
} from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import type { ConfigurationInterface } from '../../configuration/index.js';
import { markedAttributeAt, skuOn, vocabularyOn } from '../../merchandise/catalogue/index.js';
import { grn, grnLine, heldLine, heldLineDecision, heldLineVersion } from '../db/schema.js';
import { RECEIVING_MODULE, receivingApprovalRules } from '../domain/kinds.js';
import { textKey, trimmed } from '../domain/text.js';
import { heldLineDecided } from '../events.js';
import { heldLineDecisionUnavailable } from '../queries/availability.js';
import { audited, factsOf, recordItem, refusalOf, refused, scopeColumns, today, valueChange } from './common.js';
import type { Actor, Outcome } from './common.js';

// A held line after the GRN (goods-in 4.6, 4.9, 10.3; PRD-REC-013, POL-17.02, POL-17.11; S2-F02-T03): the excess, wrong
// or unidentified goods of a GRN line received and held, which a Booking approver takes in or leaves held through
// `access`'s approval route, never whoever received them; and, for unidentified goods, the product Booking names
// before they can be taken in. Every change locks the held line's identity row at step 1 (code-house-rules 8.2) and
// names its latest version (12.7). Taking goods in releases no hold here: their excess hold or quarantine ends through
// the PT route, at PT approval, so they stay held until the PT is approved (PRD-REC-012, POL-17.02; goods-in 4.9).

export type HeldLineRow = typeof heldLine.$inferSelect;
export type HeldLineVersionRow = typeof heldLineVersion.$inferSelect;

/** The held line's identity row as a lock target: every change of it locks it at step 1 (code-house-rules 8.2). */
export const heldLineLock = (heldLineId: string): LockTarget => ({
  table: lockTable('receiving', 'held_line'),
  id: heldLineId,
  mode: 'exclusive',
});

/** The held line as the actor may see it, or undefined (code-house-rules 6.2). */
export async function heldLineRow(context: TransactionContext, heldLineId: string): Promise<HeldLineRow | undefined> {
  const [row] = await context.tx.select().from(heldLine).where(eq(heldLine.id, heldLineId));
  return row;
}

/** A held line's versions, oldest first (goods-in 4.6). */
export function versionsOf(context: TransactionContext, heldLineId: string): Promise<HeldLineVersionRow[]> {
  return context.tx
    .select()
    .from(heldLineVersion)
    .where(eq(heldLineVersion.heldLineId, heldLineId))
    .orderBy(asc(heldLineVersion.versionNumber));
}

/** A held line's decision, once made. */
export async function decisionOf(context: TransactionContext, heldLineId: string) {
  const [row] = await context.tx.select().from(heldLineDecision).where(eq(heldLineDecision.heldLineId, heldLineId));
  return row;
}

/**
 * Whoever received the held goods (goods-in 4.3, 4.6; PRD-REC-013): everyone who counted the GRN line and whoever
 * issued the GRN, none of whom decides it, with whoever named a product of a version decided, as a preparer of it.
 */
async function receiversOf(context: TransactionContext, row: HeldLineRow): Promise<string[]> {
  const [line] = await context.tx
    .select({ countedBy: grnLine.countedByUserIds, issuedBy: grn.issuedByUserId })
    .from(grnLine)
    .innerJoin(grn, eq(grn.id, grnLine.grnId))
    .where(eq(grnLine.id, row.grnLineId));
  if (line === undefined) throw new CommandDefect(`Held line ${row.id} names no GRN line`);
  return [...new Set([...line.countedBy, line.issuedBy])];
}

/** The preparers of a held line's version: its receivers, and whoever named its product (access-and-approvals 9.1). */
async function preparersOf(context: TransactionContext, row: HeldLineRow, version: HeldLineVersionRow) {
  const receivers = await receiversOf(context, row);
  return version.kind === 'named' ? [...new Set([...receivers, version.preparedByUserId])] : receivers;
}

const notFound = (heldLineId: string): CommandRefusal => ({
  kind: 'not-found',
  code: 'receiving.record-not-found',
  missing: [recordItem(HELD_LINE_TYPE, heldLineId)],
});

export interface NameDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'requestLockTargets'>;
}

/**
 * Names the product of unidentified goods held at the count, before a Booking approver takes them in (goods-in 4.6):
 * by style code, colour and size from the size list, and the product where one is set up, of the Arrival's brand and
 * the style code (as a count line's, goods-in 4.3). A new version of the held line, whose decision is asked again in
 * place of the open one (access-and-approvals 9.6); whoever names it prepares it, so does not decide it. Refused for
 * a held line decided already, or not of unidentified goods. Records no business effect, so asks no gate (DEC-116).
 */
export async function nameHeldLineProduct(
  context: TransactionContext,
  dependencies: NameDependencies,
  actor: Actor,
  heldLineId: string,
  draft: HeldLineProductDraft,
): Promise<Outcome<HeldLineProductNamed>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const sizes = await markedAttributeAt(context, 'size');
  if (sizes.kind === 'not-set') return refusalOf(sizes.refusal);
  if ((await heldLineRow(context, heldLineId)) === undefined) return refusalOf(notFound(heldLineId));
  // The version's open request is locked with the held line at step 1, so a decision and the naming never pass each
  // other (access-and-approvals 9.1a; code-house-rules 8.2).
  const open = await dependencies.access.requestLockTargets(context, {
    module: RECEIVING_MODULE,
    recordType: HELD_LINE_TYPE,
    recordId: heldLineId,
    versionId: draft.versionToken,
    actionType: HELD_LINE_DECISION,
  });
  const locked = await context.lock(LOCK_STEP.document, [heldLineLock(heldLineId), ...open]);
  const row = locked.missing.some((each) => each.id === heldLineId)
    ? undefined
    : await heldLineRow(context, heldLineId);
  if (row === undefined) return refusalOf(notFound(heldLineId));
  const versions = await versionsOf(context, heldLineId);
  const latest = versions.at(-1);
  if (latest?.id !== draft.versionToken) {
    return refused('conflict', 'kernel.stale-version', [recordItem(HELD_LINE_TYPE, heldLineId)]);
  }
  if ((await decisionOf(context, heldLineId)) !== undefined) {
    return refused('refused', 'receiving.held-line-decided', [recordItem(HELD_LINE_TYPE, heldLineId)]);
  }
  if (row.kind !== 'unidentified') {
    return refused('refused', 'receiving.not-unidentified', [recordItem(HELD_LINE_TYPE, heldLineId)]);
  }
  let size: { attributeId: string; valueId: string; code: string } | null = null;
  if (draft.sizeValueId !== null) {
    const valueId = draft.sizeValueId;
    const value = (await vocabularyOn(context, sizes.attributeId, date)).find((each) => each.id === valueId);
    if (value === undefined) {
      return refused('refused', 'receiving.size-not-on-list', [
        recordItem('merchandise.attribute', sizes.attributeId),
        recordItem('merchandise.vocabulary_value', valueId),
      ]);
    }
    size = { attributeId: sizes.attributeId, valueId: value.id, code: value.code };
  }
  if (draft.skuId !== null) {
    const read = await skuOn(context, draft.skuId, row.siteId, date);
    if (
      'refusal' in read ||
      read.sku.brandId !== row.brandId ||
      textKey(read.sku.styleCode) !== textKey(draft.styleCode)
    ) {
      return refused('refused', 'receiving.sku-not-of-line', [recordItem('merchandise.sku', draft.skuId)]);
    }
  }
  const versionId = uuidv7();
  const named = {
    namedStyleCode: trimmed(draft.styleCode),
    namedColour: draft.colour === null ? null : trimmed(draft.colour),
    namedSizeAttributeId: size?.attributeId ?? null,
    namedSizeValueId: size?.valueId ?? null,
    namedSizeCode: size?.code ?? null,
    namedSizeMarkedAttributeVersionId: size === null ? null : sizes.versionId,
    namedSkuId: draft.skuId,
  };
  const values = {
    id: versionId,
    heldLineId,
    versionNumber: versions.length + 1,
    ...scopeColumns(row),
    kind: 'named' as const,
    ...named,
    preparedByUserId: actor.userId,
  };
  await context.tx.insert(heldLineVersion).values(values);
  const version: HeldLineVersionRow = { ...values, recordedAt: context.startedAt };
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: HELD_LINE_DECISION,
    document: { module: RECEIVING_MODULE, recordType: HELD_LINE_TYPE, recordId: heldLineId, versionId },
    value: { kind: 'unknown' },
    preparers: await preparersOf(context, row, version),
    requestedBy: actor,
    facts: factsOf(row),
  });
  await audited(context, dependencies.audit, actor, row, {
    record: { type: HELD_LINE_TYPE, id: heldLineId, versionId },
    operation: 'name-held-line-product',
    changes: [
      valueChange('replaces', null, latest.id),
      valueChange('styleCode', null, named.namedStyleCode),
      valueChange('colour', null, named.namedColour),
      valueChange('size', null, named.namedSizeCode),
      valueChange('skuId', null, named.namedSkuId),
    ],
  });
  return { kind: 'success', answer: { versionToken: versionId, requestId } };
}

/** What the decision effect uses, bound late, since `access` is built with it (access-and-approvals 9.8b). */
export interface EffectServices {
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
}

export interface EffectDependencies {
  readonly audit: AuditInterface;
  readonly services: () => EffectServices;
}

async function versionRow(context: TransactionContext, versionId: string) {
  const [row] = await context.tx.select().from(heldLineVersion).where(eq(heldLineVersion.id, versionId));
  return row;
}

/**
 * The version a decision binds to, under the held line's lock: the held line's latest version, not decided yet
 * (goods-in 4.6); otherwise `receiving.held-line-decided`.
 */
async function openVersion(
  context: TransactionContext,
  versionId: string,
): Promise<{ readonly row: HeldLineRow; readonly version: HeldLineVersionRow } | { readonly refusal: CommandRefusal }> {
  const version = await versionRow(context, versionId);
  const row = version === undefined ? undefined : await heldLineRow(context, version.heldLineId);
  if (version === undefined || row === undefined) return { refusal: notFound(versionId) };
  const [latest] = await context.tx
    .select({ id: heldLineVersion.id })
    .from(heldLineVersion)
    .where(eq(heldLineVersion.heldLineId, row.id))
    .orderBy(desc(heldLineVersion.versionNumber))
    .limit(1);
  if (latest?.id !== versionId || (await decisionOf(context, row.id)) !== undefined) {
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
    if ('refusal' in open) return { kind: 'refusal', refusal: open.refusal };
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

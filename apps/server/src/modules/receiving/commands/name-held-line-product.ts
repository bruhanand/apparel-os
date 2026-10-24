import { uuidv7 } from '@apparel-os/domain';
import {
  HELD_LINE_DECISION,
  HELD_LINE_TYPE,
  type HeldLineProductDraft,
  type HeldLineProductNamed,
} from '@apparel-os/schemas';
import { LOCK_STEP, type TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import type { AuditInterface } from '../../audit/index.js';
import { markedAttributeAt, skuOn, vocabularyOn } from '../../merchandise/catalogue/index.js';
import { heldLineVersion } from '../db/schema.js';
import { RECEIVING_MODULE } from '../domain/kinds.js';
import { textKey, trimmed } from '../domain/text.js';
import { decisionOf, heldLineRow, receiversOfHeldLine, versionsOf } from '../queries/held-line-rows.js';
import {
  audited,
  factsOf,
  heldLineLock,
  heldLineNotFound,
  recordItem,
  refusalOf,
  refused,
  scopeColumns,
  today,
  valueChange,
  type Actor,
  type Outcome,
} from './common.js';

export interface NameDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval' | 'requestLockTargets'>;
}

/**
 * Names the product of unidentified goods held at the count, before a Booking approver takes them in (goods-in 4.6,
 * 4.9; POL-17.02; S2-F02-T03): by style code, colour and size from the size list, and the product where one is set up,
 * of the Arrival's brand and the style code (as a count line's, goods-in 4.3). A new version of the held line, whose
 * decision is asked again in place of the open one (access-and-approvals 9.6); whoever names it prepares it, with
 * whoever received the goods, so does not decide it (9.1). Refused for a held line decided already, or not of
 * unidentified goods. Records no business effect, so asks no gate (DEC-116). Locks the held line's identity row at step
 * 1 with the open request (code-house-rules 8.2) and names its latest version (12.7).
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
  if ((await heldLineRow(context, heldLineId)) === undefined) return refusalOf(heldLineNotFound(heldLineId));
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
  if (row === undefined) return refusalOf(heldLineNotFound(heldLineId));
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
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: HELD_LINE_DECISION,
    document: { module: RECEIVING_MODULE, recordType: HELD_LINE_TYPE, recordId: heldLineId, versionId },
    value: { kind: 'unknown' },
    preparers: [...new Set([...(await receiversOfHeldLine(context, row)), actor.userId])],
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

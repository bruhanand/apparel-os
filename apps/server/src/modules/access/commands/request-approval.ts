import { uuidv7, type Paise } from '@apparel-os/domain';
import type { AccessActionType } from '@apparel-os/schemas';
import { and, eq, ne } from 'drizzle-orm';
import { CommandDefect, type TransactionContext } from '../../../kernel/index.js';
import type { AuditInterface } from '../../audit/index.js';
import {
  approvalLimitChange,
  approvalReasonVersionChange,
  approvalRequest,
  approvalRequestPreparer,
  approvalRuleSettingVersionChange,
  appUserVersionChange,
  roleAssignmentChange,
  roleAssignmentWithdrawalChange,
  roleVersionChange,
  settingVersionChange,
} from '../db/schema.js';
import { accessApprovalRules, type ApprovalRule } from '../domain/approval-rules.js';
import type { RecordFacts } from '../domain/scope.js';
import { approvalDecided, approvalRequested } from '../events.js';

/** The document a request binds to: its record and exact version (access-and-approvals 9.1; PRD-ACS-007). */
export interface ApprovalDocument {
  readonly recordType: string;
  readonly recordId: string;
  readonly versionId: string;
}

/**
 * Every user who recorded a change in the version: its preparers, read from its change rows (access-and-approvals
 * 9.1; GC3-1, DEC-105; code-house-rules 7.2). An assignment is its own version, so its rows are by assignment.
 */
export async function preparersOf(
  context: TransactionContext,
  actionType: string,
  versionId: string,
): Promise<string[]> {
  const rows = await (async () => {
    switch (actionType as AccessActionType) {
      case 'access.user.change':
        return context.tx
          .select({ userId: appUserVersionChange.changedByUserId })
          .from(appUserVersionChange)
          .where(eq(appUserVersionChange.appUserVersionId, versionId));
      case 'access.role.change':
        return context.tx
          .select({ userId: roleVersionChange.changedByUserId })
          .from(roleVersionChange)
          .where(eq(roleVersionChange.roleVersionId, versionId));
      case 'access.role_assignment.change':
        return context.tx
          .select({ userId: roleAssignmentChange.changedByUserId })
          .from(roleAssignmentChange)
          .where(eq(roleAssignmentChange.roleAssignmentId, versionId));
      case 'access.role_assignment.withdrawal':
        return context.tx
          .select({ userId: roleAssignmentWithdrawalChange.changedByUserId })
          .from(roleAssignmentWithdrawalChange)
          .where(eq(roleAssignmentWithdrawalChange.withdrawalVersionId, versionId));
      case 'access.approval_reason.change':
        return context.tx
          .select({ userId: approvalReasonVersionChange.changedByUserId })
          .from(approvalReasonVersionChange)
          .where(eq(approvalReasonVersionChange.approvalReasonVersionId, versionId));
      case 'access.approval_rule_setting.change':
        return context.tx
          .select({ userId: approvalRuleSettingVersionChange.changedByUserId })
          .from(approvalRuleSettingVersionChange)
          .where(eq(approvalRuleSettingVersionChange.approvalRuleSettingVersionId, versionId));
      case 'access.setting.change':
        return context.tx
          .select({ userId: settingVersionChange.changedByUserId })
          .from(settingVersionChange)
          .where(eq(settingVersionChange.settingVersionId, versionId));
      // A limit is a dated row, its own version (code-house-rules 7.3).
      case 'access.approval_limit.change':
        return context.tx
          .select({ userId: approvalLimitChange.changedByUserId })
          .from(approvalLimitChange)
          .where(eq(approvalLimitChange.approvalLimitId, versionId));
      default:
        throw new CommandDefect(`No approval rule for action type ${actionType}`);
    }
  })();
  return [...new Set(rows.map((row) => row.userId))].sort();
}

/**
 * The value a request binds to, on its rule's basis (access-and-approvals 9.1; PRD-ACS-015, PRD-ACS-016): none, Unknown
 * (never zero; PRD-MOD-015), or a known amount in whole paise, never below zero (PRD-MOD-014).
 */
export type RequestValue =
  { readonly kind: 'none' } | { readonly kind: 'unknown' } | { readonly kind: 'known'; readonly amountPaise: Paise };

/**
 * Request approval (access-and-approvals 9.1, 9.6; PRD-ACS-007; module-map section 3, rule 6), in the preparing
 * command's transaction: the request binds to the document's exact version, with the preparers read from its change
 * rows, and opens for whoever is eligible (9.3). A request still open on an earlier version of the same document is
 * Superseded: its decision can no longer be made (9.6). Each is audited and published through the outbox, which
 * `inbox` turns into My work (11.1). An access change has no value (DM-8). Returns the request's identifier.
 */
export async function requestApproval(
  context: TransactionContext,
  audit: AuditInterface,
  request: {
    readonly actionType: AccessActionType;
    readonly document: ApprovalDocument;
    readonly preparer: { readonly userId: string; readonly roleAssignmentId: string };
  },
): Promise<string> {
  if (!accessApprovalRules.has(request.actionType)) {
    throw new CommandDefect(`No approval rule for action type ${request.actionType}`);
  }
  const preparers = await preparersOf(context, request.actionType, request.document.versionId);
  return openRequest(context, audit, {
    actionType: request.actionType,
    module: 'access',
    document: request.document,
    preparers,
    value: { kind: 'none' },
    valueBasis: null,
    requestedBy: request.preparer,
  });
}

/** What the owning module asks of Request approval (access-and-approvals 9.1). */
export interface ModuleApprovalRequest {
  readonly actionType: string;
  readonly document: ApprovalDocument & { readonly module: string };
  readonly value: RequestValue;
  /** Every user who recorded a change in the version under approval (9.1; GC3-1). */
  readonly preparers: readonly string[];
  /** The user submitting it, and the assignment Authorise used (7.1 step 3). */
  readonly requestedBy: { readonly userId: string; readonly roleAssignmentId: string };
  /**
   * The document's scope facts, as the owning module passes them to Authorise (5.3): who may decide must cover them
   * (9.3; RR-435). A fact left out is Unknown where the record type declares it (PRD-MOD-015).
   */
  readonly facts?: RecordFacts;
  /**
   * The facts the version under approval moves the document to, where they differ from `facts`, such as a Store
   * version linking it to another Site: who may decide must cover both, through one assignment (structure-and-masters
   * 6.1; product owner, 9 Oct 2026; PRD-ACS-004).
   */
  readonly movesTo?: RecordFacts;
}

/**
 * Request approval of another module's document (access-and-approvals 9.1; module-map 4.3 "Request approval"): the
 * owning module names the action type its rule declares (8), the document and its exact version, the value on the
 * rule's basis or Unknown, never zero (PRD-ACS-015, PRD-ACS-016, PRD-MOD-015), and the preparers, every user who
 * recorded a change in that version (GC3-1, DEC-105), whose change rows only it keeps. Otherwise as for an access
 * change: one open request per document version and action type, an earlier version's request Superseded (9.6).
 */
export async function requestModuleApproval(
  context: TransactionContext,
  audit: AuditInterface,
  rules: ReadonlyMap<string, ApprovalRule>,
  request: ModuleApprovalRequest,
): Promise<string> {
  const rule = rules.get(request.actionType);
  if (rule === undefined || rule.module === 'access') {
    throw new CommandDefect(`No module approval rule for action type ${request.actionType}`);
  }
  if (rule.module !== request.document.module || rule.recordType !== request.document.recordType) {
    throw new CommandDefect(`Approval rule ${rule.actionType} does not bind to ${request.document.recordType}`);
  }
  if ((rule.value === 'none') !== (request.value.kind === 'none')) {
    throw new CommandDefect(`Approval rule ${rule.actionType} has value basis ${rule.value}`);
  }
  if (request.value.kind === 'known' && request.value.amountPaise < 0) {
    throw new CommandDefect(`A value on ${rule.actionType}'s basis is never below zero (PRD-MOD-014)`);
  }
  return openRequest(context, audit, {
    actionType: rule.actionType,
    module: rule.module,
    document: request.document,
    preparers: [...new Set(request.preparers)].sort(),
    value: request.value,
    valueBasis: rule.value === 'none' ? null : rule.value,
    requestedBy: request.requestedBy,
    facts: request.facts ?? {},
    ...(request.movesTo === undefined ? {} : { movesTo: request.movesTo }),
  });
}

async function openRequest(
  context: TransactionContext,
  audit: AuditInterface,
  request: {
    readonly actionType: string;
    readonly module: string;
    readonly document: ApprovalDocument;
    readonly preparers: readonly string[];
    readonly value: RequestValue;
    readonly valueBasis: string | null;
    readonly requestedBy: { readonly userId: string; readonly roleAssignmentId: string };
    readonly facts?: RecordFacts;
    readonly movesTo?: RecordFacts;
  },
): Promise<string> {
  const preparers = request.preparers;
  if (preparers.length === 0) throw new CommandDefect('A request needs at least one preparer (9.1)');
  const earlier = await context.tx
    .select()
    .from(approvalRequest)
    .where(
      and(
        eq(approvalRequest.documentRecordId, request.document.recordId),
        eq(approvalRequest.actionType, request.actionType),
        eq(approvalRequest.state, 'Awaiting approval'),
        ne(approvalRequest.documentVersionId, request.document.versionId),
      ),
    );
  for (const superseded of earlier) {
    await context.tx
      .update(approvalRequest)
      .set({ state: 'Superseded' })
      .where(and(eq(approvalRequest.id, superseded.id), eq(approvalRequest.state, 'Awaiting approval')));
    await audit.record(context, {
      actor: { kind: 'user', id: request.requestedBy.userId },
      roleAssignmentId: request.requestedBy.roleAssignmentId,
      record: {
        module: 'access',
        type: 'approval_request',
        id: superseded.id,
        versionId: superseded.documentVersionId,
      },
      operation: 'supersede-approval-request',
      changes: [
        { kind: 'value', field: 'state', before: 'Awaiting approval', after: 'Superseded' },
        { kind: 'value', field: 'supersededByVersionId', before: null, after: request.document.versionId },
      ],
      source: { kind: 'screen' },
    });
    await context.publish(approvalDecided, {
      subject: {
        module: 'access',
        recordType: 'access.approval_request',
        recordId: superseded.id,
        versionId: superseded.documentVersionId,
      },
      payload: {
        requestId: superseded.id,
        state: 'Superseded',
        preparerIds: await storedPreparers(context, superseded.id),
        documentRecordType: superseded.documentRecordType,
        documentRecordId: superseded.documentRecordId,
        documentVersionId: superseded.documentVersionId,
      },
    });
  }
  const requestId = uuidv7();
  await context.tx.insert(approvalRequest).values({
    id: requestId,
    actionType: request.actionType,
    documentModule: request.module,
    documentRecordType: request.document.recordType,
    documentRecordId: request.document.recordId,
    documentVersionId: request.document.versionId,
    valueKind: request.value.kind,
    valueBasis: request.valueBasis,
    valueAmount: request.value.kind === 'known' ? request.value.amountPaise : null,
    state: 'Awaiting approval',
    legalEntityId: request.facts?.legalEntityId ?? null,
    siteId: request.facts?.siteId ?? null,
    storeId: request.facts?.storeId ?? null,
    businessUnitId: request.facts?.businessUnitId ?? null,
    brandId: request.facts?.brandId ?? null,
    movesToLegalEntityId: request.movesTo?.legalEntityId ?? null,
    movesToSiteId: request.movesTo?.siteId ?? null,
    movesToStoreId: request.movesTo?.storeId ?? null,
    movesToBusinessUnitId: request.movesTo?.businessUnitId ?? null,
    movesToBrandId: request.movesTo?.brandId ?? null,
  });
  await context.tx
    .insert(approvalRequestPreparer)
    .values(preparers.map((userId) => ({ id: uuidv7(), approvalRequestId: requestId, userId })));
  await audit.record(context, {
    actor: { kind: 'user', id: request.requestedBy.userId },
    roleAssignmentId: request.requestedBy.roleAssignmentId,
    record: { module: 'access', type: 'approval_request', id: requestId, versionId: request.document.versionId },
    operation: 'request-approval',
    changes: [
      { kind: 'value', field: 'actionType', before: null, after: request.actionType },
      { kind: 'value', field: 'document', before: null, after: { ...request.document } },
      { kind: 'value', field: 'preparers', before: null, after: [...preparers] },
    ],
    source: { kind: 'screen' },
  });
  await context.publish(approvalRequested, {
    subject: {
      module: 'access',
      recordType: 'access.approval_request',
      recordId: requestId,
      versionId: request.document.versionId,
    },
    payload: {
      requestId,
      actionType: request.actionType,
      documentRecordType: request.document.recordType,
      documentRecordId: request.document.recordId,
      documentVersionId: request.document.versionId,
    },
  });
  return requestId;
}

/** The preparers a request bound to when it was requested (9.1). */
export async function storedPreparers(context: TransactionContext, requestId: string): Promise<string[]> {
  const rows = await context.tx
    .select({ userId: approvalRequestPreparer.userId })
    .from(approvalRequestPreparer)
    .where(eq(approvalRequestPreparer.approvalRequestId, requestId));
  return rows.map((row) => row.userId).sort();
}

/** The scope facts a request froze, as its columns keep them: each null is not carried, or Unknown. */
interface FrozenFacts {
  readonly legalEntityId: string | null;
  readonly siteId: string | null;
  readonly storeId: string | null;
  readonly businessUnitId: string | null;
  readonly brandId: string | null;
}

const factsOf = (frozen: FrozenFacts): RecordFacts => ({
  ...(frozen.legalEntityId === null ? {} : { legalEntityId: frozen.legalEntityId }),
  ...(frozen.siteId === null ? {} : { siteId: frozen.siteId }),
  ...(frozen.storeId === null ? {} : { storeId: frozen.storeId }),
  ...(frozen.businessUnitId === null ? {} : { businessUnitId: frozen.businessUnitId }),
  ...(frozen.brandId === null ? {} : { brandId: frozen.brandId }),
});

/**
 * The scope facts a request froze (9.1, 9.3; RR-435), and those its version moves the document to, if any
 * (structure-and-masters 6.1; product owner, 9 Oct 2026), as Authorise takes them.
 */
export function requestFacts(
  request: FrozenFacts & {
    readonly movesToLegalEntityId: string | null;
    readonly movesToSiteId: string | null;
    readonly movesToStoreId: string | null;
    readonly movesToBusinessUnitId: string | null;
    readonly movesToBrandId: string | null;
  },
): { readonly facts: RecordFacts; readonly movesTo?: RecordFacts } {
  const movesTo = factsOf({
    legalEntityId: request.movesToLegalEntityId,
    siteId: request.movesToSiteId,
    storeId: request.movesToStoreId,
    businessUnitId: request.movesToBusinessUnitId,
    brandId: request.movesToBrandId,
  });
  return { facts: factsOf(request), ...(Object.keys(movesTo).length === 0 ? {} : { movesTo }) };
}

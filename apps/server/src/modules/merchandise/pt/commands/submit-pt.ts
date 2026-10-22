import { paise, uuidv7 } from '@apparel-os/domain';
import { PT_APPROVAL, PT_TYPE, type MissingItem } from '@apparel-os/schemas';
import { desc, eq } from 'drizzle-orm';
import {
  CommandDefect,
  insertInParts,
  lockTable,
  type LockTarget,
  type TransactionContext,
} from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type {
  HandlerDocument,
  HandlerPublished,
  ImportPublisher,
  ImportSource,
} from '../../../files-imports/index.js';
import type { ReceivingInterface } from '../../../receiving/index.js';
import { pt, ptCoverage, ptProposedSku, ptRevision, ptRow } from '../db/schema.js';
import type { PtRowDetail } from '../domain/detail.js';
import { PT_MODULE } from '../domain/kinds.js';
import { ptPlanOf, type PtDraft } from '../queries/plan.js';
import { ptOfGrn } from '../queries/pt-records.js';

// Submit a PT file: the publish of the PT handler (goods-in 5.6 step 3, 5.7, 10.3; imports-and-opening-data 3.1 steps
// 7 to 9, 13.2; PRD-REC-017, PRD-REC-018, PRD-MER-013, PRD-IMP-006; S2-F04-T02). In the document's transaction, under
// the locks Publish took at step 1 with the batch (the GRN's row and the PT's, which `lockTargets` names;
// code-house-rules 8.2), it works the file out again against the GRN as it stands now, refusing the whole file at the
// first problem; then it writes the PT, at its first submit, and the draft revision with its rows, the GRN's styles and
// sizes it covers and the products it proposes; requests the revision's approval on its total proposed acquisition
// cost, P RATE times QTY (goods-in 6.1; PRD-ACS-015), with every preparer of the batch; sets the GRN's "PT attached"
// mark (goods-in 5.8); and records the audit. A draft creates no stock and no money effect (goods-in 5.7). Module-map
// section 8 names no event for a submit, so none is published.

export interface SubmitDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly receiving: Pick<ReceivingInterface, 'ptBasis' | 'grnForPt' | 'ptMark' | 'ptMarkLock' | 'setPtMark'>;
}

/** The PT's identity row as a lock target: every submit and withdrawal of it locks it at step 1 (8.2). */
export const ptLock = (ptId: string): LockTarget => ({ table: lockTable('merchandise', 'pt'), id: ptId, mode: 'exclusive' });

/** The rows Publish locks with the batch at step 1 (imports-and-opening-data 13.2): the GRN's row and the PT's. */
export async function submitLockTargets(
  context: TransactionContext,
  receiving: Pick<ReceivingInterface, 'ptMarkLock'>,
  document: Pick<HandlerDocument, 'subject'>,
): Promise<LockTarget[]> {
  const grnId = document.subject?.recordId;
  if (grnId === undefined) return [];
  const existing = await ptOfGrn(context, grnId);
  return [receiving.ptMarkLock(grnId), ...(existing === undefined ? [] : [ptLock(existing.id)])];
}

const refused = (code: string, missing: readonly MissingItem[]): HandlerPublished => ({
  kind: 'refused',
  refusal: { kind: 'refused', code, missing },
});

/** One of the draft's own identifiers, which every row it writes names; none is a defect. */
function named<T>(value: T | undefined, what: string): T {
  if (value === undefined) throw new CommandDefect(`A PT draft lost ${what}`);
  return value;
}

export async function submitPt(
  context: TransactionContext,
  dependencies: SubmitDependencies,
  publisher: ImportPublisher,
  document: HandlerDocument,
  source: ImportSource,
): Promise<HandlerPublished> {
  const plan = await ptPlanOf(context, dependencies.receiving, document);
  if (plan.kind === 'issues') {
    const [first] = plan.issues;
    // The whole file is refused (DEC-134): its first problem named, every one listed by validating it again.
    return refused(
      first?.code === 'merchandise.pt-held-lines-open' || first?.code === 'merchandise.pt-already-attached'
        ? first.code
        : 'merchandise.pt-file-refused',
      first === undefined ? [] : [{ kind: 'pt-issue', code: first.code }, ...(first.missing ?? [])],
    );
  }
  const { draft } = plan;
  const date = await context.businessDate();
  if (date.kind === 'not-set') {
    return refused('access.business-date-not-set', [{ kind: 'setting', setting: 'configuration.timezone' }]);
  }
  const facts = factsColumns(draft);
  const existing = await ptOfGrn(context, draft.grn.grnId);
  const ptId = existing?.id ?? uuidv7();
  if (existing === undefined) {
    await context.tx.insert(pt).values({ id: ptId, grnId: draft.grn.grnId, ...facts, createdByUserId: publisher.userId });
  }
  const [last] = await context.tx
    .select({ revisionNumber: ptRevision.revisionNumber })
    .from(ptRevision)
    .where(eq(ptRevision.ptId, ptId))
    .orderBy(desc(ptRevision.revisionNumber))
    .limit(1);
  const revisionId = uuidv7();
  const revisionNumber = (last?.revisionNumber ?? 0) + 1;
  await context.tx.insert(ptRevision).values({
    id: revisionId,
    ptId,
    revisionNumber,
    ...facts,
    importBatchId: source.batchId,
    importBatchVersionId: source.batchVersionId,
    importDocumentId: source.documentId,
    storedFileId: source.storedFileId,
    layoutVersionId: source.layoutVersionId,
    mappingVersionId: source.mappingVersionId,
    pieces: draft.totals.pieces,
    costPaise: draft.totals.costPaise,
    basicPaise: draft.totals.basicPaise,
    mrpPaise: draft.totals.mrpPaise,
    uploadedByUserId: publisher.userId,
    roleAssignmentId: publisher.roleAssignmentId,
    preparerUserIds: [...source.preparers],
    submittedAt: context.startedAt,
    businessDate: date.date,
  });
  const coverageIds = draft.coverage.map(() => uuidv7());
  await insertInParts(
    context,
    ptCoverage,
    draft.coverage.map((each, at) => ({
      id: named(coverageIds[at], 'a coverage'),
      ptRevisionId: revisionId,
      lineNumber: at + 1,
      ...facts,
      styleCode: each.styleCode,
      sizeCode: each.size,
      quantity: each.quantity,
      grnLineIds: [...each.grnLineIds],
    })),
  );
  const proposalIds = new Map(draft.proposals.map((each) => [each.key, uuidv7()]));
  const sizeOf = new Map(draft.rows.map((row) => [row.checked.rowNumber, row.checked.values.size.valueId]));
  await insertInParts(
    context,
    ptProposedSku,
    draft.proposals.map((each, at) => ({
      id: named(proposalIds.get(each.key), 'a proposal'),
      ptRevisionId: revisionId,
      lineNumber: at + 1,
      ...facts,
      styleCode: each.styleCode,
      existingStyleId: each.existingStyleId,
      colourValueId: each.colour.valueId,
      sizeValueId: named(sizeOf.get(named(each.rowNumbers[0], 'a proposal row')), 'a size'),
    })),
  );
  const coverageOfRow = new Map<number, string>();
  draft.coverage.forEach((each, at) => {
    for (const rowNumber of each.rowNumbers) coverageOfRow.set(rowNumber, named(coverageIds[at], 'a coverage'));
  });
  await insertInParts(
    context,
    ptRow,
    draft.rows.map((row, at) => {
      const values = row.checked;
      const { product } = row.finding;
      const detail: PtRowDetail = {
        shape: 'pt-row-detail/1',
        origins: { ...row.origins },
        differences: row.finding.differences.map((each) => ({ ...each })),
      };
      return {
        id: uuidv7(),
        ptRevisionId: revisionId,
        lineNumber: at + 1,
        ...facts,
        stagedRowId: row.stagedRowId,
        sheet: row.sheet,
        rowNumber: values.rowNumber,
        seasonValueId: values.values.season.valueId,
        colourValueId: values.values.colour.valueId,
        genderValueId: values.values.gender.valueId,
        categoryId: values.categoryId,
        typeValueId: values.values.type.valueId,
        itemValueId: values.values.item.valueId,
        fitValueId: values.values.fit.valueId,
        sizeValueId: values.values.size.valueId,
        inputTaxValueId: values.inputTax.valueId,
        outputTaxValueId: values.outputTax.valueId,
        seasonCode: values.values.season.code,
        colourCode: values.values.colour.code,
        genderCode: values.values.gender.code,
        subCategoryCode: values.subCategoryCode,
        typeCode: values.values.type.code,
        itemCode: values.values.item.code,
        fitCode: values.values.fit.code,
        sizeCode: values.sizeCode,
        inputTaxCode: values.inputTax.code,
        outputTaxCode: values.outputTax.code,
        styleCode: values.styleCode,
        barcode: values.barcode,
        hsn: values.hsn,
        quantity: values.quantity,
        mrpPaise: values.mrpPaise,
        basicPaise: values.basicPaise,
        pRatePaise: values.pRatePaise,
        nag: values.nag,
        margin: values.margin,
        suggestedSubCategory: values.suggestedSubCategory ?? null,
        suggestedType: values.suggestedType ?? null,
        skuId: product.kind === 'existing' ? product.skuId : null,
        ptProposedSkuId: product.kind === 'proposed' ? named(proposalIds.get(product.key), 'a proposal') : null,
        barcodeMapped: product.kind === 'existing' && product.barcodeMapped,
        barcodeRepeated: row.finding.repeated,
        ptCoverageId: named(coverageOfRow.get(values.rowNumber), 'a row coverage'),
        detail,
      };
    }),
  );
  await dependencies.access.requestApproval(context, {
    actionType: PT_APPROVAL,
    document: { module: PT_MODULE, recordType: PT_TYPE, recordId: ptId, versionId: revisionId },
    value: { kind: 'known', amountPaise: paise(draft.totals.costPaise) },
    preparers: [...source.preparers],
    requestedBy: { userId: publisher.userId, roleAssignmentId: publisher.roleAssignmentId },
    facts: draft.grn.facts,
  });
  const marked = await dependencies.receiving.setPtMark(
    context,
    { userId: publisher.userId, roleAssignmentId: publisher.roleAssignmentId },
    {
      grnId: draft.grn.grnId,
      ptRevisionId: revisionId,
      source: { kind: 'import', reference: source.batchCode, row: source.firstRowNumber },
    },
  );
  if (marked.kind === 'refusal') return { kind: 'refused', refusal: marked.refusal };
  await dependencies.audit.record(context, {
    actor: { kind: 'user', id: publisher.userId },
    roleAssignmentId: publisher.roleAssignmentId,
    scope: draft.grn.facts,
    record: { module: PT_MODULE, type: PT_TYPE, id: ptId, versionId: revisionId },
    operation: 'submit-pt',
    changes: [
      { kind: 'value', field: 'grnId', before: null, after: draft.grn.grnId },
      { kind: 'value', field: 'revisionNumber', before: null, after: revisionNumber },
      { kind: 'value', field: 'state', before: null, after: 'Awaiting approval' },
      { kind: 'value', field: 'rows', before: null, after: draft.totals.rows },
      { kind: 'value', field: 'pieces', before: null, after: draft.totals.pieces },
      { kind: 'value', field: 'newProducts', before: null, after: draft.proposals.length },
    ],
    source: { kind: 'import', reference: source.batchCode, row: source.firstRowNumber },
  });
  return { kind: 'published', records: [{ recordType: PT_TYPE, recordId: ptId }] };
}

/** The scope columns every row of the PT carries: its GRN's (code-house-rules 6.1). */
function factsColumns(draft: PtDraft) {
  const { facts } = draft.grn;
  return {
    siteId: facts.siteId,
    storeId: facts.storeId ?? null,
    businessUnitId: facts.businessUnitId,
    legalEntityId: facts.legalEntityId,
    brandId: facts.brandId,
  };
}

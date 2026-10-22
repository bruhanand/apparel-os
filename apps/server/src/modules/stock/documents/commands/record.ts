import { uuidv7 } from '@apparel-os/domain';
import {
  DAMAGE_DECISION,
  DAMAGE_REPORT_TYPE,
  type DamagedGoods,
  type DamageReported,
  type EvidenceFile,
} from '@apparel-os/schemas';
import type { TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { ExceptionsInterface } from '../../../exceptions/index.js';
import type { FilesImportsInterface } from '../../../files-imports/index.js';
import type { NumberingInterface } from '../../../numbering/index.js';
import type { ItemValue } from '../../ledger/index.js';
import { damageReport, damageReportPhoto, damageRound } from '../db/schema.js';
import { DAMAGE_EXCEPTION_TYPE, DOCUMENTS_MODULE, MISSING_DAMAGE_REPORT_SERIES } from '../domain/kinds.js';
import { DAMAGE_PHOTO } from '../domain/items.js';
import { damageReported } from '../events.js';
import {
  audited,
  factsOf,
  refusalOf,
  refused,
  requestValueOf,
  scopeColumns,
  valueChange,
  type Actor,
  type Outcome,
} from './common.js';

// Recording a damage report once its damage hold is written (goods-in 8.2, 8.5; PRD-DMG-001, PRD-DMG-002; S2-F08-T01,
// S2-F02-T03): its number from the damage-report series the command holds at step 8; the report and its first round on
// the hold; its photos, attached through `files-imports`; its decision requested from a different authorised person on
// the goods' cost; the exception to Operations as its routing at the Site says (POL-02.16); its audit record and event.
// A report made on its own posts its hold first (report.ts); damage the count finds has its hold written by the GRN's
// own ledger request, so the GRN records its reports after it (count-damage.ts; goods-in 4.9). Takes no lock.

export interface RecordDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  readonly numbering: Pick<NumberingInterface, 'allocate'>;
  readonly exceptions: Pick<ExceptionsInterface, 'raise'>;
}

/** A report whose damage hold is written, ready to record. */
export interface ReportToRecord {
  readonly reportId: string;
  readonly roundId: string;
  /** The damage hold its first round stands on, and the hold's value under the ledger's locks (13.15). */
  readonly holdId: string;
  readonly value: ItemValue;
  /** The damage-report series, held at step 8 by the command. */
  readonly seriesId: string;
  readonly scope: {
    readonly siteId: string;
    readonly storeId: string | null;
    readonly businessUnitId: string;
    readonly legalEntityId: string;
    readonly brandId: string;
  };
  readonly mappingVersionId: string;
  readonly locationId: string;
  readonly goods: DamagedGoods;
  readonly skuId: string | null;
  readonly receiptOriginId: string | null;
  readonly quantity: number;
  readonly description: string;
  readonly photos: readonly EvidenceFile[];
  readonly businessDate: string;
}

export async function recordReport(
  context: TransactionContext,
  dependencies: RecordDependencies,
  reporter: Actor,
  report: ReportToRecord,
  idempotencyKey?: string,
): Promise<Outcome<DamageReported>> {
  const { reportId, roundId, scope } = report;
  const allocated = await dependencies.numbering.allocate(context, {
    seriesId: report.seriesId,
    documentType: DAMAGE_REPORT_TYPE,
    documentId: reportId,
  });
  if (allocated.kind === 'refused') {
    const code =
      allocated.refusal.code === 'numbering.series-paused'
        ? 'stock.damage-report-series-paused'
        : 'stock.no-damage-report-series';
    return refused('unavailable', code, [MISSING_DAMAGE_REPORT_SERIES]);
  }
  const number = allocated.value.formattedText;
  const description = report.description.trim();
  await context.tx.insert(damageReport).values({
    id: reportId,
    number,
    numberAllocationId: allocated.value.allocationId,
    ...scope,
    mappingVersionId: report.mappingVersionId,
    locationId: report.locationId,
    goodsKind: report.goods.kind,
    grnLineId: report.goods.kind === 'grn-line' ? report.goods.grnLineId : null,
    skuId: report.skuId,
    receiptOriginId: report.receiptOriginId,
    quantity: report.quantity,
    description,
    reportedByUserId: reporter.userId,
    roleAssignmentId: reporter.roleAssignmentId,
    reportedAt: context.startedAt,
    businessDate: report.businessDate,
  });
  await context.tx.insert(damageRound).values({
    id: roundId,
    damageReportId: reportId,
    roundNumber: 1,
    kind: 'reported',
    holdId: report.holdId,
    damageReversalId: null,
    ...scopeColumns(scope),
    requestedByUserId: reporter.userId,
  });
  const attachmentIds: string[] = [];
  for (const file of report.photos) {
    const photoId = uuidv7();
    const attached = await dependencies.files.attach(context, {
      storedFileId: file.storedFileId,
      fileReceiptId: file.fileReceiptId,
      record: { module: DOCUMENTS_MODULE, type: DAMAGE_REPORT_TYPE, id: reportId, versionId: photoId },
      evidence: DAMAGE_PHOTO,
      scope: factsOf(scope),
      attachedBy: { kind: 'user', id: reporter.userId },
      roleAssignmentId: reporter.roleAssignmentId,
    });
    await context.tx.insert(damageReportPhoto).values({
      id: photoId,
      damageReportId: reportId,
      ...scopeColumns(scope),
      storedFileId: file.storedFileId,
      attachmentId: attached.attachmentId,
      recordedByUserId: reporter.userId,
    });
    attachmentIds.push(attached.attachmentId);
  }
  // The decision, by a different authorised person from the reporter, on the goods' cost now (8.3; PRD-DMG-002).
  const requestId = await dependencies.access.requestApproval(context, {
    actionType: DAMAGE_DECISION,
    document: { module: DOCUMENTS_MODULE, recordType: DAMAGE_REPORT_TYPE, recordId: reportId, versionId: roundId },
    value: requestValueOf(report.value),
    preparers: [reporter.userId],
    requestedBy: reporter,
    facts: factsOf(scope),
  });
  // The follow-up, to Operations as the routing of the type at the Site says (8.2; POL-02.16).
  const raised = await dependencies.exceptions.raise(context, {
    raisingEvent: `${DAMAGE_EXCEPTION_TYPE}:${reportId}`,
    typeCode: DAMAGE_EXCEPTION_TYPE,
    facts: {
      siteId: scope.siteId,
      storeId: scope.storeId,
      businessUnitId: scope.businessUnitId,
      brandId: scope.brandId,
    },
    links: [{ module: DOCUMENTS_MODULE, recordType: DAMAGE_REPORT_TYPE, recordId: reportId, versionId: roundId }],
    exposure: report.value.kind === 'known' ? { kind: 'known', amount: report.value.amountPaise } : { kind: 'unknown' },
    raisedBy: { kind: 'user', id: reporter.userId },
    roleAssignmentId: reporter.roleAssignmentId,
  });
  if (raised.kind === 'refused') return refusalOf(raised.refusal);
  await audited(context, dependencies.audit, reporter, scope, {
    record: { type: DAMAGE_REPORT_TYPE, id: reportId, versionId: roundId },
    operation: 'report-damage',
    changes: [
      valueChange('number', null, number),
      valueChange('locationId', null, report.locationId),
      valueChange('goods', null, { ...report.goods }),
      valueChange('quantity', null, report.quantity),
      valueChange('description', null, description),
      valueChange('photoAttachmentIds', null, attachmentIds),
      valueChange('holdId', null, report.holdId),
      valueChange('exceptionId', null, raised.value.exceptionId),
    ],
    ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
  });
  await context.publish(damageReported, {
    subject: { module: DOCUMENTS_MODULE, recordType: DAMAGE_REPORT_TYPE, recordId: reportId, versionId: roundId },
    scope: factsOf(scope),
    payload: { damageReportId: reportId },
  });
  return { kind: 'success', answer: { damageReportId: reportId, number, versionToken: roundId, requestId } };
}

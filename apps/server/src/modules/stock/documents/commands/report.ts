import { uuidv7 } from '@apparel-os/domain';
import { DAMAGE_DECISION, DAMAGE_REPORT_TYPE, type DamageReportDraft, type DamageReported } from '@apparel-os/schemas';
import type { CommandRefusal, TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface, RecordFacts } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { ConfigurationInterface } from '../../../configuration/index.js';
import type { ExceptionsInterface } from '../../../exceptions/index.js';
import type { FilesImportsInterface } from '../../../files-imports/index.js';
import { skuOn } from '../../../merchandise/catalogue/index.js';
import type { NumberingInterface } from '../../../numbering/index.js';
import { locationPlace, mappingOn } from '../../../organisation/index.js';
import { originOfSourceLine, type NamedGoods, type StockLedgerInterface } from '../../ledger/index.js';
import { damageReport, damageReportPhoto, damageRound } from '../db/schema.js';
import {
  DAMAGE_EXCEPTION_TYPE,
  DAMAGE_REPORT_KIND,
  DAMAGE_REPORT_SCOPE_KEY,
  DAMAGE_SOURCE_TYPE,
  DOCUMENTS_MODULE,
  MISSING_DAMAGE_REPORT_SERIES,
} from '../domain/kinds.js';
import { damageHoldItem, DAMAGE_PHOTO } from '../domain/items.js';
import { damageReported } from '../events.js';
import { damageUnavailable } from '../queries/availability.js';
import {
  audited,
  factsOf,
  recordItem,
  refusalOf,
  refused,
  requestValueOf,
  scopeColumns,
  today,
  valueChange,
  type Actor,
  type Outcome,
} from './common.js';
import { post } from './posting.js';

// Report damage (goods-in 8.1, 8.2, 10.3; PRD-DMG-001, PRD-DMG-004, PRD-DMG-005, PRD-ACP-005; S2-F08-T01): anyone
// authorised at the Site reports damage on goods there, a GRN line's or a product's at a location, with what is wrong
// and photos. In one transaction, or nothing: a damage hold covers the quantity at once, before anyone confirms it
// (stock-ledger 6.1, 13.15); the report takes its number from the damage-report series; its decision is requested from
// a different authorised person, on the goods' cost, Unknown before their PT (8.3; DM-8); the exception reaches
// Operations in My work as its routing says (8.2; POL-02.16); its audit record and event are saved. Locks follow
// stock-ledger 10.3: the ledger's at steps 2 to 6, the damage-report and exception-code series at step 8. The report
// is a new row, so it has nothing to lock at step 1: writing it creates it, unseen by any other transaction.

export interface ReportDependencies {
  readonly audit: AuditInterface;
  readonly access: Pick<AccessInterface, 'requestApproval'>;
  readonly configuration: Pick<ConfigurationInterface, 'checkAvailability'>;
  readonly files: Pick<FilesImportsInterface, 'attach'>;
  readonly numbering: Pick<NumberingInterface, 'liveSeries' | 'seriesLockTarget' | 'allocate'>;
  readonly ledger: StockLedgerInterface;
  readonly exceptions: Pick<ExceptionsInterface, 'codeSeriesTarget' | 'raise'>;
}

/** Where the goods are and what they are, read before any lock (goods-in 8.2). */
interface Placed {
  readonly facts: RecordFacts & { siteId: string; businessUnitId: string; legalEntityId: string; brandId: string };
  readonly storeId: string | null;
  readonly mappingVersionId: string;
  readonly goods: NamedGoods;
  readonly skuId: string | null;
  readonly receiptOriginId: string | null;
}

/** A refusal of the draft's place or goods, naming them (PRD-UXP-003). */
const refusalOfCode = (code: string, item: CommandRefusal['missing'][number]): CommandRefusal => ({
  kind: 'refused',
  code,
  missing: [item],
});

/** The GRN line goods a report names are those `receiving` counted on it (goods-in 4.5; stock-ledger 13.2). */
const GRN_LINE_SOURCE = { module: 'receiving', recordType: 'grn' } as const;

/**
 * The place and goods of a draft (goods-in 8.2): the location's Site and business unit (structure-and-masters 3.5),
 * the unit's mapping in force today for its Store and legal entity (PRD-MOD-010), and the goods: a GRN line's by the
 * receipt origin its count made, of a product not yet set up too (stock-ledger 13.15), or a product in force at the
 * Site. Their brand is the SKU's, or the one goods of Unknown SKU were counted under (RR-555).
 */
async function placeOf(
  context: TransactionContext,
  draft: DamageReportDraft,
  date: string,
): Promise<Placed | { readonly refusal: CommandRefusal }> {
  const place = await locationPlace(context, draft.locationId);
  if (place === undefined) {
    return {
      refusal: refusalOfCode('stock.location-not-found', recordItem('organisation.location', draft.locationId)),
    };
  }
  const mapping = await mappingOn(context, place.businessUnitId, date);
  if (mapping === undefined) {
    return {
      refusal: {
        kind: 'unavailable',
        code: 'configuration.operation-unavailable',
        missing: [{ kind: 'mapping', businessUnitId: place.businessUnitId, lacks: 'mapping' }],
      },
    };
  }
  let goods: NamedGoods;
  let brandId: string;
  let skuId: string | null;
  let receiptOriginId: string | null = null;
  if (draft.goods.kind === 'grn-line') {
    const origin = await originOfSourceLine(context, { ...GRN_LINE_SOURCE, lineId: draft.goods.grnLineId });
    if (origin === undefined) {
      return {
        refusal: refusalOfCode('stock.goods-not-found', recordItem('receiving.grn_line', draft.goods.grnLineId)),
      };
    }
    receiptOriginId = origin.receiptOriginId;
    skuId = origin.skuId;
    brandId = origin.brandId;
    goods =
      origin.skuId === null
        ? { skuId: null, receiptOriginId: origin.receiptOriginId, quantity: draft.quantity }
        : { skuId: origin.skuId, receiptOriginId: origin.receiptOriginId, quantity: draft.quantity };
  } else {
    const read = await skuOn(context, draft.goods.skuId, place.siteId, date);
    if ('refusal' in read) {
      return { refusal: refusalOfCode('stock.goods-not-found', recordItem('merchandise.sku', draft.goods.skuId)) };
    }
    skuId = draft.goods.skuId;
    brandId = read.sku.brandId;
    goods = { skuId, quantity: draft.quantity };
  }
  return {
    facts: {
      siteId: place.siteId,
      businessUnitId: place.businessUnitId,
      legalEntityId: mapping.legalEntityId,
      brandId,
      ...(mapping.storeId === null ? {} : { storeId: mapping.storeId }),
    },
    storeId: mapping.storeId,
    mappingVersionId: mapping.mappingVersionId,
    goods,
    skuId,
    receiptOriginId,
  };
}

/** The facts a new report of the draft would carry, which its route authorises with (5.3), or why it has none. */
export async function newReportFacts(
  context: TransactionContext,
  draft: DamageReportDraft,
  date: string,
): Promise<RecordFacts | CommandRefusal> {
  const placed = await placeOf(context, draft, date);
  return 'refusal' in placed ? placed.refusal : placed.facts;
}

export async function reportDamage(
  context: TransactionContext,
  dependencies: ReportDependencies,
  reporter: Actor,
  draft: DamageReportDraft,
  idempotencyKey?: string,
): Promise<Outcome<DamageReported>> {
  const date = await today(context);
  if (typeof date !== 'string') return refusalOf(date);
  const placed = await placeOf(context, draft, date);
  if ('refusal' in placed) return refusalOf(placed.refusal);
  const { facts } = placed;
  const unavailable = await damageUnavailable(context, dependencies, facts);
  if (unavailable !== undefined) return refusalOf(unavailable);
  const series = await dependencies.numbering.liveSeries(context, {
    kind: DAMAGE_REPORT_KIND.kind,
    scopeKey: DAMAGE_REPORT_SCOPE_KEY,
  });
  if (series === undefined) {
    return refused('unavailable', 'stock.no-damage-report-series', [MISSING_DAMAGE_REPORT_SERIES]);
  }
  if (series.state !== 'Open') {
    return refused('unavailable', 'stock.damage-report-series-paused', [MISSING_DAMAGE_REPORT_SERIES]);
  }
  const codes = await dependencies.exceptions.codeSeriesTarget(context);
  if (codes.kind === 'refused') return refusalOf(codes.refusal);

  const reportId = uuidv7();
  const roundId = uuidv7();
  const at = { siteId: facts.siteId, businessUnitId: facts.businessUnitId, locationId: draft.locationId };
  const posted = await post(
    context,
    { ledger: dependencies.ledger },
    {
      source: {
        module: DOCUMENTS_MODULE,
        recordType: DAMAGE_SOURCE_TYPE,
        recordId: reportId,
        versionId: roundId,
        importKind: 'none',
      },
      actor: reporter,
      items: [damageHoldItem(uuidv7(), at, placed.goods, draft.description)],
      series: [dependencies.numbering.seriesLockTarget(series.seriesId), codes.value],
      ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
    },
  );
  if (posted.kind === 'refusal') return posted;
  const [holdId] = posted.answer.written.holdIds;
  const [value] = posted.answer.values;
  if (holdId === undefined || value === undefined) throw new Error('A damage report posted no hold');

  const allocated = await dependencies.numbering.allocate(context, {
    seriesId: series.seriesId,
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
  const scope = {
    siteId: facts.siteId,
    storeId: placed.storeId,
    businessUnitId: facts.businessUnitId,
    legalEntityId: facts.legalEntityId,
    brandId: facts.brandId,
  };
  const number = allocated.value.formattedText;
  await context.tx.insert(damageReport).values({
    id: reportId,
    number,
    numberAllocationId: allocated.value.allocationId,
    ...scope,
    mappingVersionId: placed.mappingVersionId,
    locationId: draft.locationId,
    goodsKind: draft.goods.kind,
    grnLineId: draft.goods.kind === 'grn-line' ? draft.goods.grnLineId : null,
    skuId: placed.skuId,
    receiptOriginId: placed.receiptOriginId,
    quantity: draft.quantity,
    description: draft.description.trim(),
    reportedByUserId: reporter.userId,
    roleAssignmentId: reporter.roleAssignmentId,
    reportedAt: context.startedAt,
    businessDate: date,
  });
  await context.tx.insert(damageRound).values({
    id: roundId,
    damageReportId: reportId,
    roundNumber: 1,
    kind: 'reported',
    holdId,
    damageReversalId: null,
    ...scopeColumns(scope),
    requestedByUserId: reporter.userId,
  });
  const attachmentIds: string[] = [];
  for (const file of draft.photos ?? []) {
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
    value: requestValueOf(value),
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
    exposure: value.kind === 'known' ? { kind: 'known', amount: value.amountPaise } : { kind: 'unknown' },
    raisedBy: { kind: 'user', id: reporter.userId },
    roleAssignmentId: reporter.roleAssignmentId,
  });
  if (raised.kind === 'refused') return refusalOf(raised.refusal);
  await audited(context, dependencies.audit, reporter, scope, {
    record: { type: DAMAGE_REPORT_TYPE, id: reportId, versionId: roundId },
    operation: 'report-damage',
    changes: [
      valueChange('number', null, number),
      valueChange('locationId', null, draft.locationId),
      valueChange('goods', null, { ...draft.goods }),
      valueChange('quantity', null, draft.quantity),
      valueChange('description', null, draft.description.trim()),
      valueChange('photoAttachmentIds', null, attachmentIds),
      valueChange('holdId', null, holdId),
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

import {
  ARRIVAL_TYPE,
  type CountDamageReport,
  type ReceiptProblemsFilters,
  type ReceiptProblemsReport,
} from '@apparel-os/schemas';
import type { ReadModelGateway, TransactionContext } from '../../../kernel/index.js';
import type { AccessInterface } from '../../access/index.js';
import { RECEIVING_RECEIPT_PROBLEMS } from '../../receiving/index.js';
import { STOCK_DAMAGE_REPORT_STATES } from '../../stock/documents/index.js';
import { viewable } from './authority.js';
import { namesOf } from './names.js';

// The receipt problems report (goods-in 4.4, 4.9, 9.3, 9.5; PRD-REC-006, PRD-REC-013; S2-F11-T02): per GRN and line,
// shortage, excess, wrong, unidentified and damage, each with its decision and who made it, by Site, supplier, brand
// and date, read through the read-model gateway: `receiving`'s receipt problems read model (4.9), and the decision of
// each damage report the count raised from `stock` · documents, Unknown to a reader who may not see the report
// (PRD-MOD-015). Each line is shown to a reader whose grant of view on Arrivals covers its GRN's facts (access-and-
// approvals 5.3); the page may then hold fewer, its cursor still moving past them.

export interface ReceiptProblemsRequest {
  readonly filters: ReceiptProblemsFilters;
  readonly after?: string;
  readonly limit: number;
  readonly today: string;
}

export async function receiptProblemsReport(
  gateway: ReadModelGateway,
  access: AccessInterface,
  context: TransactionContext,
  actorId: string,
  request: ReceiptProblemsRequest,
): Promise<ReceiptProblemsReport> {
  const read = await gateway.read(context, RECEIVING_RECEIPT_PROBLEMS, {
    ...request.filters,
    ...(request.after === undefined ? {} : { after: request.after }),
    limit: request.limit,
  });
  const page = read.answer.rows;
  const shown = await viewable(
    access,
    context,
    actorId,
    ARRIVAL_TYPE,
    page.map((each) => ({
      siteId: each.siteId,
      ...(each.storeId === null ? {} : { storeId: each.storeId }),
      businessUnitId: each.businessUnitId,
      legalEntityId: each.legalEntityId,
      brandId: each.brandId,
    })),
  );
  const rows = page.filter((_, at) => shown[at] === true);
  const reportIds = rows.flatMap((each) => (each.line.damage === null ? [] : [each.line.damage.damageReportId]));
  const states = (await gateway.read(context, STOCK_DAMAGE_REPORT_STATES, reportIds)).answer;
  const reportOf = (damageReportId: string): CountDamageReport => {
    const found = states.find((each) => each.damageReportId === damageReportId);
    return found === undefined
      ? { kind: 'unknown' }
      : {
          kind: 'shown',
          damageReportId: found.damageReportId,
          number: found.number,
          state: found.state,
          decision: found.decision === null ? null : { ...found.decision },
        };
  };
  const { names } = await namesOf(
    gateway,
    access,
    context,
    {
      siteIds: rows.map((each) => each.siteId),
      brandIds: rows.map((each) => each.brandId),
      supplierIds: rows.map((each) => each.supplierPartyId),
      userIds: [
        ...rows.flatMap((each) => {
          const decided = each.line.heldLine?.decision;
          return decided === undefined || decided === null ? [] : [decided.decidedBy];
        }),
        ...states.flatMap((each) => (each.decision === null ? [] : [each.decision.decidedBy])),
      ],
    },
    request.today,
  );
  return {
    asOf: read.asOf,
    rows: rows.map((each) => ({
      grnId: each.grnId,
      grnNumber: each.grnNumber,
      arrivalId: each.arrivalId,
      businessDate: each.businessDate,
      siteId: each.siteId,
      supplierPartyId: each.supplierPartyId,
      brandId: each.brandId,
      line: each.line,
      damageReport: each.line.damage === null ? null : reportOf(each.line.damage.damageReportId),
    })),
    names,
    next: read.answer.next,
  };
}

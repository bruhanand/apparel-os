import { uuidv7 } from '@apparel-os/domain';
import type { DamageReportDraft, DamageReported } from '@apparel-os/schemas';
import { CommandDefect, type CommandRefusal, type TransactionContext } from '../../../../kernel/index.js';
import type { AccessInterface, RecordFacts } from '../../../access/index.js';
import type { AuditInterface } from '../../../audit/index.js';
import type { ConfigurationInterface } from '../../../configuration/index.js';
import type { ExceptionsInterface } from '../../../exceptions/index.js';
import type { FilesImportsInterface } from '../../../files-imports/index.js';
import { skuOn } from '../../../merchandise/catalogue/index.js';
import type { NumberingInterface } from '../../../numbering/index.js';
import { locationPlace, mappingOn } from '../../../organisation/index.js';
import { originOfSourceLine, type NamedGoods, type StockLedgerInterface } from '../../ledger/index.js';
import {
  DAMAGE_REPORT_KIND,
  DAMAGE_REPORT_SCOPE_KEY,
  DAMAGE_SOURCE_TYPE,
  DOCUMENTS_MODULE,
  MISSING_DAMAGE_REPORT_SERIES,
} from '../domain/kinds.js';
import { damageHoldItem } from '../domain/items.js';
import { damageUnavailable } from '../queries/availability.js';
import { recordItem, refusalOf, refused, today, type Actor, type Outcome } from './common.js';
import { post } from './posting.js';
import { recordReport } from './record.js';

// Report damage (goods-in 8.1, 8.2, 10.3; PRD-DMG-001, PRD-DMG-004, PRD-DMG-005, PRD-ACP-005; S2-F08-T01): anyone
// authorised at the Site reports damage on goods there, a GRN line's or a product's at a location, with what is wrong
// and photos. In one transaction, or nothing: a damage hold covers the quantity at once, before anyone confirms it
// (stock-ledger 6.1, 13.15); the report takes its number from the damage-report series; its decision is requested from
// a different authorised person, on the goods' cost, Unknown before their PT (8.3; DM-8); the exception reaches
// Operations in My work as its routing says (8.2; POL-02.16); its audit record and event are saved (record.ts). Locks
// follow stock-ledger 10.3: the ledger's at steps 2 to 6, the damage-report and exception-code series at step 8. The
// report is a new row, so it has nothing to lock at step 1: writing it creates it, unseen by any other transaction.

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
  if (holdId === undefined || value === undefined) throw new CommandDefect('A damage report posted no hold');
  return recordReport(
    context,
    dependencies,
    reporter,
    {
      reportId,
      roundId,
      holdId,
      value,
      seriesId: series.seriesId,
      scope: {
        siteId: facts.siteId,
        storeId: placed.storeId,
        businessUnitId: facts.businessUnitId,
        legalEntityId: facts.legalEntityId,
        brandId: facts.brandId,
      },
      mappingVersionId: placed.mappingVersionId,
      locationId: draft.locationId,
      goods: draft.goods,
      skuId: placed.skuId,
      receiptOriginId: placed.receiptOriginId,
      quantity: draft.quantity,
      description: draft.description,
      photos: draft.photos ?? [],
      businessDate: date,
    },
    idempotencyKey,
  );
}

import {
  STOCK_MOVEMENT_TYPE,
  STOCK_RECORDS_PAGE_CAP,
  stockConditionSchema,
  stockMovementKindSchema,
  type StockRecordSource,
  type StockRecords,
  type StockRecordsQuery,
} from '@apparel-os/schemas';
import { CommandDefect, type CommandRefusal } from '../../../kernel/index.js';
import { ORGANISATION_PLACES } from '../../organisation/index.js';
import { RECEIVING_GRN_NAMES } from '../../receiving/index.js';
import { STOCK_RECORDS, type SourceRecord, type RecordsOf } from '../../stock/ledger/index.js';
import { keyOfCursor } from '../domain/search.js';
import { holdingKeyOfCursor } from '../domain/stock-report.js';
import { factsOf, readerAuthority, ReadRefused, viewable } from './authority.js';
import { pageLimitOf, type Reading } from './reading.js';

// The records behind a figure of stock search or the stock report (goods-in 9.1 "Every figure drills down to its
// records: the booking, the GRN, the PT, the movements", 9.2, 9.5; PRD-EXC-011, PRD-SEC-005; code reviews 8 and 9 of
// stage 2), read through the read-model gateway in the reader's transaction under the reader's own actor: the
// ledger's sources, covering PTs and movements of the figure's balances (`stock.records`), and the GRNs they name by
// their numbers and Arrivals from `receiving`. The figure is shown only to a reader whose grants of view on every stock
// record type it is read from, its movements among them, cover its place and brand, as a result is (goods-in 9.4); to
// anyone else, as to a key no figure has, it is not found, so its existence is not told (code-house-rules 12.3).

/** No figure has the key, or none the reader may see; a figure is no record, so `missing` names none. */
const FIGURE_NOT_FOUND: CommandRefusal = { kind: 'not-found', code: 'reports.record-not-found', missing: [] };

/** What the screen names a movement's source as (goods-in 9.1), by its module and record type (stock-ledger 13.2). */
const SOURCE_KINDS: Readonly<Record<string, StockRecordSource>> = {
  'receiving|grn': 'grn',
  'receiving|recount': 'recount',
  'receiving|scan': 'scan',
  'merchandise|pt_revision': 'pt',
  'merchandise|pt_reversal': 'pt-reversal',
  'stock|damage_report': 'damage-report',
  'stock|damage_reversal': 'damage-reversal',
};
const sourceKindOf = (source: SourceRecord): StockRecordSource =>
  SOURCE_KINDS[`${source.module}|${source.recordType}`] ?? 'other';

const sameSource = (a: SourceRecord, b: SourceRecord) =>
  a.module === b.module && a.recordType === b.recordType && a.recordId === b.recordId;

/**
 * The balances a key names: a stock search result's place, product and legal entity, or a stock report row's, with its
 * condition and owner too; a key neither gave is not found.
 */
function recordsOf(query: StockRecordsQuery): RecordsOf {
  if (query.of === 'search') {
    const key = keyOfCursor(query.key);
    if (key !== undefined) return key;
  } else {
    const key = holdingKeyOfCursor(query.key);
    const condition = stockConditionSchema.safeParse(key?.condition);
    if (key !== undefined && condition.success) return { ...key, condition: condition.data };
  }
  throw new ReadRefused(FIGURE_NOT_FOUND);
}

export async function stockRecords(reading: Reading, query: StockRecordsQuery): Promise<StockRecords> {
  const { gateway, context } = reading;
  const of = recordsOf(query);
  const read = await gateway.read(context, STOCK_RECORDS, {
    of,
    ...(query.after === undefined ? {} : { after: query.after }),
    limit: pageLimitOf(query.limit, STOCK_RECORDS_PAGE_CAP),
  });
  const { answer } = read;
  if (!answer.found) throw new ReadRefused(FIGURE_NOT_FOUND);
  const facts = factsOf({ ...of, storeId: answer.storeId, brandId: answer.brandId });
  const [views] = await readerAuthority(reading.access, context, reading.actorId).visible([facts]);
  const [movementsShown] = await viewable(reading.access, context, reading.actorId, STOCK_MOVEMENT_TYPE, [facts]);
  if (views === undefined || movementsShown !== true) throw new ReadRefused(FIGURE_NOT_FOUND);

  const named = (
    await gateway.read(context, RECEIVING_GRN_NAMES, {
      grnIds: [],
      sources: [
        ...answer.sources,
        ...answer.movements.flatMap((each) => [each.source, each.rootSource]),
        ...answer.covered.map((each) => each.rootSource),
      ],
    })
  ).answer;
  const grnOf = (source: SourceRecord) => named.sources.find((each) => sameSource(each, source))?.grnId ?? null;
  const rootGrns = new Set(answer.sources.flatMap((source) => grnOf(source) ?? []));
  const grns = named.grns.filter((each) => rootGrns.has(each.grnId));
  const places = (
    await gateway.read(context, ORGANISATION_PLACES, {
      siteIds: [],
      businessUnitIds: [...new Set(grns.map((each) => each.businessUnitId))],
      locationIds: [...new Set(grns.map((each) => each.receivingLocationId))],
      date: reading.today,
    })
  ).answer;
  const namedOf = (list: readonly { readonly id: string; readonly code: string; readonly name: string }[]) =>
    list.map((each) => ({ id: each.id, code: each.code, name: each.name }));
  return {
    asOf: read.asOf,
    grns: grns.map((each) => ({ ...each })),
    places: { businessUnits: namedOf(places.businessUnits), locations: namedOf(places.locations) },
    pts: answer.covered.map((each) => ({ ptRevisionId: each.ptRevisionId, grnId: grnOf(each.rootSource) })),
    movements: answer.movements.map((each) => {
      const kind = stockMovementKindSchema.safeParse(each.kind);
      if (!kind.success) throw new CommandDefect(`A movement of no known kind: ${each.kind}`);
      return {
        id: each.legId,
        movementId: each.movementId,
        kind: kind.data,
        direction: each.direction,
        quantity: each.quantity,
        condition: each.condition,
        businessDate: each.businessDate,
        occurredAt: each.occurredAt,
        source: sourceKindOf(each.source),
        // The GRN of the movement's own record where it is one of `receiving`'s, else the GRN its pieces were counted
        // on; none where the reader may see neither.
        grnId: grnOf(each.source) ?? grnOf(each.rootSource),
      };
    }),
    next: answer.next,
  };
}

import { uuidv7 } from '@apparel-os/domain';
import type { AssignmentScope } from '@apparel-os/schemas';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CommandRunner, newCorrelationId, OrganisationRouter, type RoutedOrganisation } from '../src/kernel/index.js';
import { BookStockHistory } from '../src/modules/stock/ledger/index.js';
import { syntheticCode } from './fixtures/synthetic.js';
import { syntheticKeysEnvironment, syntheticTimezone, writeSyntheticUser } from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import { capturingLogger } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl, sqlState } from './support/postgres.js';

// S1-F10-T01: the `stock` schema of stock-ledger section 14, its constraints, append-only guards and row-level
// security (14.1 to 14.3; code-house-rules 3 to 7), and the "has this book held stock?" contract (13.7; module-map
// section 3, rule 6; DEC-116). Every identifier here is a synthetic UUIDv7 and every code is SYNTHETIC: the stock
// tables keep other modules' identifiers without a foreign key (14.1), so no Site, unit, SKU or book record is needed.

type Row = Record<string, unknown>;

const log = capturingLogger();
let world: SyntheticWorld;
let database: string;
let owner: Client;
let router: OrganisationRouter;
let routed: RoutedOrganisation;
let keysEnvironment: Record<string, string>;

// The synthetic places, legal entities and brands: two Sites; at Site 1 a Store with one unit and a warehouse unit
// that belongs to no Store (SL-25 (b)); at Site 2 one Store unit.
const SITE_1 = uuidv7();
const SITE_2 = uuidv7();
const STORE_1 = uuidv7();
const STORE_2 = uuidv7();
const STORE_UNIT_1 = uuidv7();
const WAREHOUSE_UNIT_1 = uuidv7();
const STORE_UNIT_2 = uuidv7();
const LEGAL_ENTITY = uuidv7();
const BRAND_A = uuidv7();
const BRAND_B = uuidv7();
const BOOK = uuidv7();

interface Place {
  readonly site_id: string;
  readonly store_id: string | null;
  readonly business_unit_id: string;
}
const AT_STORE_1: Place = { site_id: SITE_1, store_id: STORE_1, business_unit_id: STORE_UNIT_1 };
const AT_WAREHOUSE_1: Place = { site_id: SITE_1, store_id: null, business_unit_id: WAREHOUSE_UNIT_1 };
const AT_STORE_2: Place = { site_id: SITE_2, store_id: STORE_2, business_unit_id: STORE_UNIT_2 };

const today = (): string => new Date().toISOString().slice(0, 10);

/** Inserts one row as the migration role, which owns the tables and is not filtered (code-house-rules 5.1). */
async function insert(client: Client, table: string, row: Row): Promise<string> {
  const columns = Object.keys(row);
  await client.query(
    `insert into stock.${table} (${columns.join(', ')}) values (${columns.map((_c, i) => `$${String(i + 1)}`).join(', ')})`,
    Object.values(row),
  );
  return row.id as string;
}

function source(): Row {
  return {
    source_module: 'test-stock-harness',
    source_record_type: 'document',
    source_record_id: uuidv7(),
    source_version_id: uuidv7(),
    source_line_id: uuidv7(),
    source_import_kind: 'none',
  };
}

function actor(): Row {
  return {
    actor_user_id: uuidv7(),
    actor_service_identity_id: null,
    on_behalf_of_user_id: null,
    role_assignment_id: uuidv7(),
  };
}

function times(): Row {
  return { occurred_at: new Date(), business_date: today() };
}

function scope(place: Place, brand: string | null = BRAND_A): Row {
  return { ...place, legal_entity_id: LEGAL_ENTITY, brand_id: brand };
}

function headerScope(place: Place, brands: readonly (string | null)[]): Row {
  return { ...place, legal_entity_id: LEGAL_ENTITY, brand_ids: brands };
}

function originRow(overrides: Row = {}): Row {
  return {
    id: uuidv7(),
    origin_kind: 'receipt',
    parent_origin_id: null,
    ...source(),
    sku_id: uuidv7(),
    sku_version_id: uuidv7(),
    stock_unit: 'piece',
    piece_tracked: false,
    batch_tracked: false,
    batch_code: null,
    expiry_date: null,
    quantity: 5,
    count_date: today(),
    ...scope(AT_STORE_1),
    mapping_version_id: uuidv7(),
    book_id: BOOK,
    occurred_at: new Date(),
    ...overrides,
  };
}

function movementRow(overrides: Row = {}): Row {
  return {
    id: uuidv7(),
    kind: 'receipt-count',
    ...source(),
    ...actor(),
    approval_use_id: null,
    reverses_movement_id: null,
    correction_of_movement_id: null,
    ...times(),
    ...headerScope(AT_STORE_1, [BRAND_A]),
    ...overrides,
  };
}

function legRow(movementId: string, originId: string, overrides: Row = {}): Row {
  return {
    id: uuidv7(),
    movement_id: movementId,
    direction: 'in',
    receipt_origin_id: originId,
    sku_id: uuidv7(),
    quantity: 5,
    location_id: uuidv7(),
    condition: 'good',
    held_as: 'custody',
    transit_kind: null,
    transit_ref: null,
    batch_code: null,
    expiry_date: null,
    book_id: BOOK,
    ...scope(AT_STORE_1),
    ...overrides,
  };
}

function poolRow(overrides: Row = {}): Row {
  return {
    id: uuidv7(),
    book_id: BOOK,
    sku_id: uuidv7(),
    pool_mode: 'book',
    site_id: null,
    formula: 'moving-average',
    cost_setting_version_id: uuidv7(),
    quantity: 0,
    value_paise: 0,
    last_sequence: 0,
    closed_at: null,
    legal_entity_id: LEGAL_ENTITY,
    brand_id: BRAND_A,
    ...overrides,
  };
}

function holdRow(overrides: Row = {}): Row {
  return {
    id: uuidv7(),
    kind: 'ordinary',
    reason: 'SYNTHETIC reason',
    evidence_file_id: null,
    within_reservation_id: null,
    ...source(),
    ...actor(),
    ...times(),
    ...headerScope(AT_STORE_1, [BRAND_A]),
    ...overrides,
  };
}

function reservationRow(overrides: Row = {}): Row {
  return {
    id: uuidv7(),
    kind: 'transfer',
    ...source(),
    ...actor(),
    ...times(),
    ...headerScope(AT_STORE_1, [BRAND_A]),
    ...overrides,
  };
}

/** A receipt origin with its movement, one leg, its SKU balance and balance row: stock in custody at a place. */
interface Stock {
  readonly origin: string;
  readonly movement: string;
  readonly leg: string;
  readonly skuBalance: string;
  readonly balance: string;
  readonly skuId: string;
}

async function stockAt(place: Place, brand: string | null, bookId = BOOK): Promise<Stock> {
  const skuId = uuidv7();
  const origin = await insert(
    owner,
    'receipt_origin',
    originRow({ sku_id: skuId, ...scope(place, brand), book_id: bookId }),
  );
  const movement = await insert(owner, 'movement', movementRow(headerScope(place, [brand])));
  const leg = await insert(
    owner,
    'movement_leg',
    legRow(movement, origin, { sku_id: skuId, ...scope(place, brand), book_id: bookId }),
  );
  const skuBalance = await insert(owner, 'sku_balance', {
    id: uuidv7(),
    sku_id: skuId,
    stock_unit: 'piece',
    quantity: 5,
    ...scope(place, brand),
  });
  const balance = await insert(owner, 'balance', balanceRow(skuBalance, origin, skuId, place, brand));
  return { origin, movement, leg, skuBalance, balance, skuId };
}

function balanceRow(skuBalanceId: string, originId: string, skuId: string, place: Place, brand: string | null): Row {
  return {
    id: uuidv7(),
    sku_balance_id: skuBalanceId,
    location_id: uuidv7(),
    condition: 'good',
    held_as: 'custody',
    transit_kind: null,
    transit_ref: null,
    sku_id: skuId,
    batch_code: null,
    expiry_date: null,
    receipt_origin_id: originId,
    count_date: today(),
    quantity: 5,
    accepted_quantity: 0,
    ...scope(place, brand),
  };
}

/** Runs queries as the runtime role with the actor and today's business date set, as `kernel` sets them (6.2). */
async function asRuntime<T>(actorId: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = await connect(database, 'runtime');
  try {
    await client.query('begin');
    await client.query("select set_config('aos.actor_id', $1, true)", [actorId]);
    await client.query("select set_config('aos.business_date', $1, true)", [today()]);
    return await work(client);
  } finally {
    await client.query('rollback').catch(() => undefined);
    await client.end();
  }
}

/** The ids of a table's rows the actor sees, among those given. */
async function visible(actorId: string, table: string, ids: readonly string[]): Promise<string[]> {
  return asRuntime(actorId, async (client) => {
    const rows = await client.query<{ id: string }>(
      `select id from stock.${table} where id = any ($1::uuid[]) order by id`,
      [ids],
    );
    return rows.rows.map((row) => row.id);
  });
}

const STOCK_TYPES = [
  'stock.balance',
  'stock.receipt_origin',
  'stock.movement',
  'stock.piece',
  'stock.coverage',
  'stock.acceptance',
  'stock.hold',
  'stock.reservation',
  'stock.cost_pool',
  'stock.valuation',
  'stock.transit_value',
];

/** A SYNTHETIC user holding view on every stock record type under the scope given (access-and-approvals 5.3). */
async function reader(label: string, scopeOf: AssignmentScope): Promise<string> {
  const user = await writeSyntheticUser(database, routed.organisationCode, keysEnvironment, { label });
  await grantSynthetic(
    database,
    { kind: 'user', id: user.id },
    STOCK_TYPES.map((recordType) => ({ recordType, action: 'view' as const })),
    { scope: scopeOf },
  );
  return user.id;
}

type Dimensions = Extract<AssignmentScope, { kind: 'dimensions' }>;

function scopeWith(place: Dimensions['place'], brand: Dimensions['brand'] = { kind: 'all' }): AssignmentScope {
  return { kind: 'dimensions', legalEntity: { kind: 'all' }, place, brand };
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('stock');
  database = world.organisations[0].database;
  keysEnvironment = syntheticKeysEnvironment(world);
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const found = await router.resolveForSignIn(world.organisations[0].code);
  if (!found.routed) throw new Error('not routed');
  routed = found.organisation;
  owner = await connect(database, 'migration');
});

afterAll(async () => {
  await (owner as Client | undefined)?.end();
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('cost pools (stock-ledger 7.1, 14.2)', () => {
  it('PRD-LED-015 refuses a second open pool for the same book, SKU and empty Site', async () => {
    const skuId = uuidv7();
    await insert(owner, 'cost_pool', poolRow({ sku_id: skuId }));
    expect(await sqlState(insert(owner, 'cost_pool', poolRow({ sku_id: skuId })))).toBe('23505');
  });

  it('PRD-LED-015 allows a new open pool once the old one is closed, and one open Site pool per Site', async () => {
    const skuId = uuidv7();
    await insert(owner, 'cost_pool', poolRow({ sku_id: skuId, closed_at: new Date() }));
    await insert(owner, 'cost_pool', poolRow({ sku_id: skuId }));
    const site = { sku_id: uuidv7(), pool_mode: 'site' };
    await insert(owner, 'cost_pool', poolRow({ ...site, site_id: SITE_1 }));
    await insert(owner, 'cost_pool', poolRow({ ...site, site_id: SITE_2 }));
    expect(await sqlState(insert(owner, 'cost_pool', poolRow({ ...site, site_id: SITE_1 })))).toBe('23505');
  });

  it('SL-25 (c) a Site is present exactly in Site mode', async () => {
    expect(await sqlState(insert(owner, 'cost_pool', poolRow({ pool_mode: 'site', site_id: null })))).toBe('23514');
    expect(await sqlState(insert(owner, 'cost_pool', poolRow({ pool_mode: 'book', site_id: SITE_1 })))).toBe('23514');
  });

  it('PRD-LED-014 a pool keeps its formula, and quantity and value never go below zero', async () => {
    const pool = await insert(owner, 'cost_pool', poolRow());
    expect(await sqlState(owner.query(`update stock.cost_pool set formula = 'fifo' where id = $1`, [pool]))).toBe(
      'AO004',
    );
    expect(await sqlState(owner.query(`update stock.cost_pool set quantity = -1 where id = $1`, [pool]))).toBe('23514');
    expect(await sqlState(owner.query(`update stock.cost_pool set value_paise = -1 where id = $1`, [pool]))).toBe(
      '23514',
    );
  });

  it('PRD-LED-014 a cost layer belongs only to a FIFO pool', async () => {
    const average = await insert(owner, 'cost_pool', poolRow());
    const fifo = await insert(owner, 'cost_pool', poolRow({ formula: 'fifo' }));
    const layer = (poolId: string): Row => ({
      id: uuidv7(),
      cost_pool_id: poolId,
      pool_formula: 'fifo',
      entered_sequence: 1,
      entered_at: new Date(),
      quantity_in: 2,
      quantity_left: 2,
      value_in_paise: 200,
      value_left_paise: 200,
      from_layer_id: null,
      receipt_origin_id: null,
      from_valuation_id: null,
      site_id: null,
      legal_entity_id: LEGAL_ENTITY,
      brand_id: BRAND_A,
    });
    await insert(owner, 'cost_layer', layer(fifo));
    expect(await sqlState(insert(owner, 'cost_layer', layer(average)))).toBe('23503');
    expect(await sqlState(insert(owner, 'cost_layer', { ...layer(fifo), quantity_left: -1 }))).toBe('23514');
  });

  it('stock-ledger 7.10 a valuation keeps after equal to before plus the change, once per pool sequence', async () => {
    const { movement, origin } = await stockAt(AT_STORE_1, BRAND_A);
    const pool = await insert(owner, 'cost_pool', poolRow());
    const valuation = (overrides: Row = {}): Row => ({
      id: uuidv7(),
      movement_id: movement,
      receipt_origin_id: origin,
      cost_pool_id: pool,
      transit_value_id: null,
      sequence: 1,
      quantity_delta: 2,
      value_delta_paise: 200,
      quantity_before: 0,
      quantity_after: 2,
      value_before_paise: 0,
      value_after_paise: 200,
      event_kind: 'stock.cost-established',
      component: 'inventory',
      business_date: today(),
      accounting_date: today(),
      site_id: null,
      store_id: null,
      business_unit_id: null,
      legal_entity_id: LEGAL_ENTITY,
      brand_id: BRAND_A,
      ...overrides,
    });
    await insert(owner, 'valuation', valuation());
    expect(await sqlState(insert(owner, 'valuation', valuation({ sequence: 2, value_after_paise: 201 })))).toBe(
      '23514',
    );
    expect(await sqlState(insert(owner, 'valuation', valuation({ sequence: 2, quantity_after: 3 })))).toBe('23514');
    expect(await sqlState(insert(owner, 'valuation', valuation()))).toBe('23505');
    // A pool row names no Store or unit (SL-25 (e)).
    expect(await sqlState(insert(owner, 'valuation', valuation({ sequence: 3, ...AT_STORE_1 })))).toBe('23514');
  });

  it('stock-ledger 7.8 a transit value is one row per kind, reference, book and SKU', async () => {
    const row = {
      transit_kind: 'dispatch',
      transit_ref: uuidv7(),
      book_id: BOOK,
      sku_id: uuidv7(),
      quantity: 1,
      value_paise: 100,
      ...scope(AT_STORE_1),
    };
    await insert(owner, 'transit_value', { id: uuidv7(), ...row });
    expect(await sqlState(insert(owner, 'transit_value', { id: uuidv7(), ...row }))).toBe('23505');
  });
});

describe('movements (stock-ledger 2, 13.2, 14.2)', () => {
  it('PRD-LIF-014 refuses a movement whose source is an import of historical reference', async () => {
    expect(await sqlState(insert(owner, 'movement', movementRow({ source_import_kind: 'historical-reference' })))).toBe(
      '23514',
    );
    await insert(owner, 'movement', movementRow({ source_import_kind: 'opening-balance', kind: 'opening-count' }));
  });

  it('PRD-INT-002 one source line posts each kind once, and a reversal names the movement it reverses', async () => {
    const first = movementRow();
    await insert(owner, 'movement', first);
    expect(await sqlState(insert(owner, 'movement', { ...first, id: uuidv7() }))).toBe('23505');
    expect(
      await sqlState(
        insert(owner, 'movement', { ...first, id: uuidv7(), kind: 'reversal', reverses_movement_id: null }),
      ),
    ).toBe('23514');
    expect(
      await sqlState(insert(owner, 'movement', movementRow({ kind: 'dispatch', reverses_movement_id: first.id }))),
    ).toBe('23514');
    await insert(owner, 'movement', { ...first, id: uuidv7(), kind: 'reversal', reverses_movement_id: first.id });
  });

  it('PRD-STK-001 a leg is in transit exactly when it names a transit, and at a location exactly when not', async () => {
    const origin = await insert(owner, 'receipt_origin', originRow());
    const movement = await insert(owner, 'movement', movementRow());
    const transit = { held_as: 'in-transit', location_id: null, transit_kind: 'dispatch', transit_ref: uuidv7() };
    await insert(owner, 'movement_leg', legRow(movement, origin, transit));
    expect(
      await sqlState(insert(owner, 'movement_leg', legRow(movement, origin, { ...transit, transit_ref: null }))),
    ).toBe('23514');
    expect(
      await sqlState(insert(owner, 'movement_leg', legRow(movement, origin, { ...transit, location_id: uuidv7() }))),
    ).toBe('23514');
    expect(await sqlState(insert(owner, 'movement_leg', legRow(movement, origin, { location_id: null })))).toBe(
      '23514',
    );
    expect(await sqlState(insert(owner, 'movement_leg', legRow(movement, origin, { quantity: 0 })))).toBe('23514');
  });
});

describe('receipt origins, balances and pieces (stock-ledger 4, 5, 14.2)', () => {
  it('PRD-STK-004 a parent origin exists exactly for a split or a resolved identity', async () => {
    const parent = await insert(owner, 'receipt_origin', originRow());
    await insert(owner, 'receipt_origin', originRow({ origin_kind: 'split', parent_origin_id: parent }));
    expect(await sqlState(insert(owner, 'receipt_origin', originRow({ origin_kind: 'split' })))).toBe('23514');
    expect(await sqlState(insert(owner, 'receipt_origin', originRow({ parent_origin_id: parent })))).toBe('23514');
  });

  it('PRD-MER-011 batch and expiry are present exactly when tracked, and the quantity is above zero', async () => {
    const batch = { batch_tracked: true, batch_code: syntheticCode('BATCH-1'), expiry_date: today() };
    await insert(owner, 'receipt_origin', originRow(batch));
    expect(await sqlState(insert(owner, 'receipt_origin', originRow({ ...batch, batch_code: null })))).toBe('23514');
    expect(await sqlState(insert(owner, 'receipt_origin', originRow({ batch_code: syntheticCode('BATCH-2') })))).toBe(
      '23514',
    );
    expect(await sqlState(insert(owner, 'receipt_origin', originRow({ quantity: 0 })))).toBe('23514');
  });

  it('PRD-MOD-015 an origin state copies its origin quantity, covers no more, names one owner and knows its value or not', async () => {
    const { origin, movement } = await stockAt(AT_STORE_1, BRAND_A);
    const state = (overrides: Row = {}): Row => ({
      id: uuidv7(),
      receipt_origin_id: origin,
      owner_kind: null,
      owner_legal_entity_id: null,
      owner_party_id: null,
      owner_brand_id: null,
      agreement_version_id: null,
      value_known: false,
      p_rate_paise: null,
      established_value_paise: null,
      origin_quantity: 5,
      pt_revision_id: null,
      covered_quantity: 0,
      last_state_movement_id: movement,
      ...scope(AT_STORE_1),
      ...overrides,
    });
    expect(await sqlState(insert(owner, 'receipt_origin_state', state({ origin_quantity: 6 })))).toBe('23503');
    expect(await sqlState(insert(owner, 'receipt_origin_state', state({ covered_quantity: 6 })))).toBe('23514');
    expect(await sqlState(insert(owner, 'receipt_origin_state', state({ value_known: true })))).toBe('23514');
    expect(await sqlState(insert(owner, 'receipt_origin_state', state({ p_rate_paise: 100 })))).toBe('23514');
    expect(
      await sqlState(
        insert(owner, 'receipt_origin_state', state({ owner_kind: 'supplier', owner_legal_entity_id: LEGAL_ENTITY })),
      ),
    ).toBe('23514');
    expect(await sqlState(insert(owner, 'receipt_origin_state', state({ owner_party_id: uuidv7() })))).toBe('23514');
    const id = await insert(
      owner,
      'receipt_origin_state',
      state({
        owner_kind: 'supplier',
        owner_party_id: uuidv7(),
        value_known: true,
        p_rate_paise: 100,
        established_value_paise: 500,
      }),
    );
    expect(
      await sqlState(owner.query('update stock.receipt_origin_state set origin_quantity = 4 where id = $1', [id])),
    ).toBe('23503');
    expect(await sqlState(insert(owner, 'receipt_origin_state', state()))).toBe('23505');
  });

  it('PRD-STK-013 a balance copies its origin count date, keeps acceptance within quantity, and is one row per key', async () => {
    const { origin, skuBalance, skuId } = await stockAt(AT_STORE_1, BRAND_A);
    const row = balanceRow(skuBalance, origin, skuId, AT_STORE_1, BRAND_A);
    expect(await sqlState(insert(owner, 'balance', { ...row, count_date: '2000-01-01' }))).toBe('23503');
    expect(await sqlState(insert(owner, 'balance', { ...row, accepted_quantity: 6 }))).toBe('23514');
    expect(await sqlState(insert(owner, 'balance', { ...row, quantity: -1, accepted_quantity: 0 }))).toBe('23514');
    await insert(owner, 'balance', row);
    expect(await sqlState(insert(owner, 'balance', { ...row, id: uuidv7() }))).toBe('23505');
    expect(
      await sqlState(owner.query('update stock.balance set count_date = $2 where id = $1', [row.id, '2000-01-01'])),
    ).toBe('23503');
  });

  it('PRD-STK-002 one SKU balance per Site, unit and SKU, an Unknown SKU included, and never below zero', async () => {
    const row = { stock_unit: 'piece', quantity: 1, ...scope(AT_WAREHOUSE_1, null) };
    await insert(owner, 'sku_balance', { id: uuidv7(), sku_id: null, ...row });
    expect(await sqlState(insert(owner, 'sku_balance', { id: uuidv7(), sku_id: null, ...row }))).toBe('23505');
    expect(await sqlState(insert(owner, 'sku_balance', { id: uuidv7(), sku_id: uuidv7(), ...row, quantity: -1 }))).toBe(
      '23514',
    );
    await insert(owner, 'unit_anchor', { id: uuidv7(), ...AT_WAREHOUSE_1, legal_entity_id: LEGAL_ENTITY });
    expect(
      await sqlState(insert(owner, 'unit_anchor', { id: uuidv7(), ...AT_WAREHOUSE_1, legal_entity_id: LEGAL_ENTITY })),
    ).toBe('23505');
  });

  it('PRD-MER-003 a piece code is unique and never changes', async () => {
    const { origin, movement, skuId } = await stockAt(AT_STORE_1, BRAND_A);
    const piece = (code: string): Row => ({
      id: uuidv7(),
      code,
      sku_id: skuId,
      receipt_origin_id: origin,
      location_id: uuidv7(),
      condition: 'good',
      held_as: 'custody',
      transit_kind: null,
      transit_ref: null,
      in_custody: true,
      pt_revision_id: null,
      accepted_site_id: null,
      last_movement_id: movement,
      ...scope(AT_STORE_1),
    });
    const code = syntheticCode(`PIECE-${uuidv7().slice(-12).toUpperCase()}`);
    const id = await insert(owner, 'piece', piece(code));
    expect(await sqlState(insert(owner, 'piece', piece(code)))).toBe('23505');
    expect(await sqlState(owner.query(`update stock.piece set code = $2 where id = $1`, [id, `${code}-X`]))).toBe(
      'AO004',
    );
    await owner.query(`update stock.piece set in_custody = false where id = $1`, [id]);
  });
});

describe('coverage, holds and reservations (stock-ledger 6, 14.2)', () => {
  it('PRD-REC-017 coverage names a piece exactly for piece-tracked goods, as its origin says, and a removal once', async () => {
    const quantityOrigin = await insert(owner, 'receipt_origin', originRow());
    const coverage = (overrides: Row): Row => ({
      id: uuidv7(),
      pt_revision_id: uuidv7(),
      receipt_origin_id: quantityOrigin,
      piece_tracked: false,
      piece_id: null,
      quantity: 5,
      action: 'cover',
      removes_coverage_id: null,
      ...source(),
      ...actor(),
      ...times(),
      ...scope(AT_STORE_1),
      ...overrides,
    });
    const cover = await insert(owner, 'coverage', coverage({}));
    expect(await sqlState(insert(owner, 'coverage', coverage({ piece_tracked: true })))).toBe('23514');
    expect(await sqlState(insert(owner, 'coverage', coverage({ action: 'remove' })))).toBe('23514');
    await insert(owner, 'coverage', coverage({ action: 'remove', removes_coverage_id: cover }));
    expect(await sqlState(insert(owner, 'coverage', coverage({ action: 'remove', removes_coverage_id: cover })))).toBe(
      '23505',
    );
    // The copy of the origin's tracking is held by a foreign key on (origin, piece_tracked) (14.2).
    const piece = await insert(owner, 'piece', {
      id: uuidv7(),
      code: syntheticCode(`PIECE-${uuidv7().slice(-12).toUpperCase()}`),
      sku_id: uuidv7(),
      receipt_origin_id: quantityOrigin,
      location_id: uuidv7(),
      condition: 'good',
      held_as: 'custody',
      transit_kind: null,
      transit_ref: null,
      in_custody: true,
      pt_revision_id: null,
      accepted_site_id: null,
      last_movement_id: null,
      ...scope(AT_STORE_1),
    });
    expect(
      await sqlState(insert(owner, 'coverage', coverage({ piece_tracked: true, piece_id: piece, quantity: 1 }))),
    ).toBe('23503');
  });

  it('PRD-DMG-003 a hold is released only by an event of its own kind; a scope row only on a count freeze', async () => {
    const { balance } = await stockAt(AT_STORE_1, BRAND_A);
    const hold = await insert(owner, 'hold', holdRow({ kind: 'damage' }));
    const claim = await insert(owner, 'hold_claim', {
      id: uuidv7(),
      hold_id: hold,
      piece_id: null,
      balance_id: balance,
      quantity: 2,
      ...scope(AT_STORE_1),
    });
    const release = (event: string): Row => ({
      id: uuidv7(),
      hold_id: hold,
      hold_kind: 'damage',
      hold_claim_id: claim,
      release_event: event,
      quantity: 1,
      piece_id: null,
      ...source(),
      ...actor(),
      ...times(),
      ...scope(AT_STORE_1),
    });
    expect(await sqlState(insert(owner, 'hold_release', release('count-closed')))).toBe('23514');
    await insert(owner, 'hold_release', release('report-rejected'));
    expect(
      await sqlState(insert(owner, 'hold_release', { ...release('count-closed'), hold_kind: 'count-freeze' })),
    ).toBe('23503');

    const scopeRow = (holdId: string, kind: string, overrides: Row = {}): Row => ({
      id: uuidv7(),
      hold_id: holdId,
      hold_kind: kind,
      location_id: uuidv7(),
      scope_brand_id: null,
      sku_id: null,
      ...headerScope(AT_STORE_1, [BRAND_A]),
      ...overrides,
    });
    expect(await sqlState(insert(owner, 'hold_scope', scopeRow(hold, 'damage')))).toBe('23514');
    const freeze = await insert(owner, 'hold', holdRow({ kind: 'count-freeze' }));
    await insert(owner, 'hold_scope', scopeRow(freeze, 'count-freeze'));
    expect(await sqlState(insert(owner, 'hold_scope', scopeRow(freeze, 'count-freeze', { sku_id: uuidv7() })))).toBe(
      '23514',
    );
    expect(await sqlState(insert(owner, 'hold_scope', scopeRow(freeze, 'count-freeze', { location_id: null })))).toBe(
      '23514',
    );
  });

  it('PRD-TRF-022 a reservation ends only by an event of its own kind, and is consumed only by a movement', async () => {
    const { balance, movement } = await stockAt(AT_STORE_1, BRAND_A);
    const reservation = await insert(owner, 'reservation', reservationRow());
    const claim = await insert(owner, 'reservation_claim', {
      id: uuidv7(),
      reservation_id: reservation,
      piece_id: null,
      balance_id: balance,
      quantity: 2,
      ...scope(AT_STORE_1),
    });
    const event = (name: string, movementId: string | null): Row => ({
      id: uuidv7(),
      reservation_id: reservation,
      reservation_kind: 'transfer',
      reservation_claim_id: claim,
      event: name,
      quantity: 1,
      piece_id: null,
      movement_id: movementId,
      ...source(),
      ...actor(),
      ...times(),
      ...scope(AT_STORE_1),
    });
    expect(await sqlState(insert(owner, 'reservation_event', event('withdrawn', null)))).toBe('23514');
    expect(await sqlState(insert(owner, 'reservation_event', event('consumed', null)))).toBe('23514');
    expect(await sqlState(insert(owner, 'reservation_event', event('cancelled', movement)))).toBe('23514');
    await insert(owner, 'reservation_event', event('cancelled', null));
    await insert(owner, 'reservation_event', event('consumed', movement));
  });
});

describe('append-only guards (code-house-rules 7.1)', () => {
  it('PRD-MOD-011 the runtime role cannot change or delete a posted movement, and the owner is stopped too', async () => {
    const reader_ = await reader('APPEND', scopeWith({ kind: 'all' }));
    const { movement, leg, origin } = await stockAt(AT_STORE_1, BRAND_A);
    await asRuntime(reader_, async (client) => {
      expect(
        await sqlState(client.query(`update stock.movement set kind = 'dispatch' where id = $1`, [movement])),
      ).toBe('42501');
    });
    await asRuntime(reader_, async (client) => {
      expect(await sqlState(client.query(`delete from stock.movement_leg where id = $1`, [leg]))).toBe('42501');
    });
    // A locked append-only row can be locked, and its identifier "update" still refused (5.2, 7.1).
    await asRuntime(reader_, async (client) => {
      const locked = await client.query('select id from stock.receipt_origin where id = $1 for no key update', [
        origin,
      ]);
      expect(locked.rowCount).toBe(1);
      expect(await sqlState(client.query('update stock.receipt_origin set id = id where id = $1', [origin]))).toBe(
        'AO001',
      );
    });
    expect(await sqlState(owner.query(`update stock.movement set kind = 'dispatch' where id = $1`, [movement]))).toBe(
      'AO001',
    );
    expect(await sqlState(owner.query(`delete from stock.movement where id = $1`, [movement]))).toBe('AO001');
    expect(await sqlState(owner.query('truncate stock.valuation_layer'))).toBe('AO001');
  });
});

describe('row-level security (stock-ledger 14.1, 14.3; SL-25; code-house-rules 6.2)', () => {
  it('PRD-SEC-005 a reader scoped to one Site sees only that Site’s rows', async () => {
    const atSite1 = await stockAt(AT_STORE_1, BRAND_A);
    const atSite2 = await stockAt(AT_STORE_2, BRAND_A);
    const site1Reader = await reader(
      'SITE-1',
      scopeWith({ kind: 'selected', members: [{ type: 'site', id: SITE_1 }] }),
    );
    for (const [table, key] of [
      ['receipt_origin', 'origin'],
      ['movement', 'movement'],
      ['movement_leg', 'leg'],
      ['sku_balance', 'skuBalance'],
      ['balance', 'balance'],
    ] as const) {
      expect(await visible(site1Reader, table, [atSite1[key], atSite2[key]]), table).toEqual([atSite1[key]]);
    }
    // With no actor set, no row shows (code-house-rules 6.2).
    const client = await connect(database, 'runtime');
    try {
      const rows = await client.query('select id from stock.movement');
      expect(rows.rowCount).toBe(0);
    } finally {
      await client.end();
    }
  });

  it('SL-25 (b) a row at a unit that belongs to no Store is matched by its Site and its unit, not by a Store', async () => {
    const warehouse = await stockAt(AT_WAREHOUSE_1, BRAND_A);
    const bySite = await reader('B-SITE', scopeWith({ kind: 'selected', members: [{ type: 'site', id: SITE_1 }] }));
    const byUnit = await reader(
      'B-UNIT',
      scopeWith({ kind: 'selected', members: [{ type: 'business-unit', id: WAREHOUSE_UNIT_1 }] }),
    );
    const byStore = await reader('B-STORE', scopeWith({ kind: 'selected', members: [{ type: 'store', id: STORE_1 }] }));
    const ids = [warehouse.balance];
    expect(await visible(bySite, 'balance', ids)).toEqual(ids);
    expect(await visible(byUnit, 'balance', ids)).toEqual(ids);
    expect(await visible(byStore, 'balance', ids)).toEqual([]);
  });

  it('SL-25 (c) a whole-book pool carries no Site, so only all-members place scope sees it', async () => {
    const pool = await insert(owner, 'cost_pool', poolRow());
    const everywhere = await reader('C-ALL', scopeWith({ kind: 'all' }));
    const bySite = await reader('C-SITE', scopeWith({ kind: 'selected', members: [{ type: 'site', id: SITE_1 }] }));
    expect(await visible(everywhere, 'cost_pool', [pool])).toEqual([pool]);
    expect(await visible(bySite, 'cost_pool', [pool])).toEqual([]);
  });

  it('SL-25 (e) a Site pool’s rows are seen by a reader covering the whole Site, not by one Store or unit', async () => {
    const { movement, origin } = await stockAt(AT_STORE_1, BRAND_A);
    const pool = await insert(owner, 'cost_pool', poolRow({ pool_mode: 'site', site_id: SITE_1, formula: 'fifo' }));
    const valuation = await insert(owner, 'valuation', {
      id: uuidv7(),
      movement_id: movement,
      receipt_origin_id: origin,
      cost_pool_id: pool,
      transit_value_id: null,
      sequence: 1,
      quantity_delta: 2,
      value_delta_paise: 200,
      quantity_before: 0,
      quantity_after: 2,
      value_before_paise: 0,
      value_after_paise: 200,
      event_kind: 'stock.cost-established',
      component: 'inventory',
      business_date: today(),
      accounting_date: today(),
      site_id: SITE_1,
      store_id: null,
      business_unit_id: null,
      legal_entity_id: LEGAL_ENTITY,
      brand_id: BRAND_A,
    });
    const layer = await insert(owner, 'cost_layer', {
      id: uuidv7(),
      cost_pool_id: pool,
      pool_formula: 'fifo',
      entered_sequence: 1,
      entered_at: new Date(),
      quantity_in: 2,
      quantity_left: 2,
      value_in_paise: 200,
      value_left_paise: 200,
      from_layer_id: null,
      receipt_origin_id: origin,
      from_valuation_id: valuation,
      site_id: SITE_1,
      legal_entity_id: LEGAL_ENTITY,
      brand_id: BRAND_A,
    });
    const valuationLayer = await insert(owner, 'valuation_layer', {
      id: uuidv7(),
      valuation_id: valuation,
      cost_layer_id: layer,
      piece_id: null,
      quantity: 2,
      value_paise: 200,
      site_id: SITE_1,
      store_id: null,
      business_unit_id: null,
      legal_entity_id: LEGAL_ENTITY,
      brand_id: BRAND_A,
    });
    const bySite = await reader('E-SITE', scopeWith({ kind: 'selected', members: [{ type: 'site', id: SITE_1 }] }));
    const byStore = await reader('E-STORE', scopeWith({ kind: 'selected', members: [{ type: 'store', id: STORE_1 }] }));
    const byUnit = await reader(
      'E-UNIT',
      scopeWith({ kind: 'selected', members: [{ type: 'business-unit', id: STORE_UNIT_1 }] }),
    );
    for (const [table, id] of [
      ['cost_pool', pool],
      ['cost_layer', layer],
      ['valuation', valuation],
      ['valuation_layer', valuationLayer],
    ] as const) {
      expect(await visible(bySite, table, [id]), table).toEqual([id]);
      expect(await visible(byStore, table, [id]), table).toEqual([]);
      expect(await visible(byUnit, table, [id]), table).toEqual([]);
    }
  });

  it('SL-25 (d) DEC-117 a header row with a brand set is seen by a brand-limited reader only with every brand in it', async () => {
    const both = await insert(owner, 'movement', movementRow(headerScope(AT_STORE_1, [BRAND_A, BRAND_B])));
    const onlyA = await insert(owner, 'movement', movementRow(headerScope(AT_STORE_1, [BRAND_A])));
    const unknown = await insert(owner, 'movement', movementRow(headerScope(AT_STORE_1, [BRAND_A, null])));
    const hold = await insert(owner, 'hold', holdRow(headerScope(AT_STORE_1, [BRAND_A, BRAND_B])));
    const reservation = await insert(owner, 'reservation', reservationRow(headerScope(AT_STORE_1, [BRAND_A, BRAND_B])));
    const anchor = await insert(owner, 'unit_anchor', { id: uuidv7(), ...AT_STORE_2, legal_entity_id: LEGAL_ENTITY });
    const everywhere = { kind: 'all' } as const;
    const brandA = await reader('D-A', scopeWith(everywhere, { kind: 'selected', members: [BRAND_A] }));
    const brandsAB = await reader('D-AB', scopeWith(everywhere, { kind: 'selected', members: [BRAND_A, BRAND_B] }));
    const allBrands = await reader('D-ALL', scopeWith(everywhere));
    const ids = [both, onlyA, unknown].sort();
    expect(await visible(brandA, 'movement', ids)).toEqual([onlyA]);
    expect(await visible(brandsAB, 'movement', ids)).toEqual([both, onlyA].sort());
    // A brand that is Unknown is covered only by all-members brand scope (access-and-approvals 5.3).
    expect(await visible(allBrands, 'movement', ids)).toEqual(ids);
    expect(await visible(brandA, 'hold', [hold])).toEqual([]);
    expect(await visible(brandsAB, 'hold', [hold])).toEqual([hold]);
    expect(await visible(brandA, 'reservation', [reservation])).toEqual([]);
    expect(await visible(brandsAB, 'reservation', [reservation])).toEqual([reservation]);
    // A unit anchor carries no brand and is matched by place only.
    expect(await visible(brandA, 'unit_anchor', [anchor])).toEqual([anchor]);
  });

  it('PRD-SEC-005 a command cannot write a row its actor could not read', async () => {
    const brandA = await reader('W-A', scopeWith({ kind: 'all' }, { kind: 'selected', members: [BRAND_A] }));
    const columns = movementRow(headerScope(AT_STORE_1, [BRAND_A, BRAND_B]));
    await asRuntime(brandA, async (client) => {
      const names = Object.keys(columns);
      expect(
        await sqlState(
          client.query(
            `insert into stock.movement (${names.join(', ')}) values (${names.map((_n, i) => `$${String(i + 1)}`).join(', ')})`,
            Object.values(columns),
          ),
        ),
      ).toBe('42501');
    });
    await asRuntime(brandA, async (client) => {
      const allowed = movementRow(headerScope(AT_STORE_1, [BRAND_A]));
      const names = Object.keys(allowed);
      await client.query(
        `insert into stock.movement (${names.join(', ')}) values (${names.map((_n, i) => `$${String(i + 1)}`).join(', ')})`,
        Object.values(allowed),
      );
    });
  });
});

describe('has this book held stock? (stock-ledger 13.7; module-map section 3, rule 6; DEC-116)', () => {
  it('books-and-posting 2.2 answers yes for a book with stock rows and no for one without, whatever the asker may see', async () => {
    const heldBook = uuidv7();
    const emptyBook = uuidv7();
    await stockAt(AT_STORE_2, BRAND_B, heldBook);
    // The asker holds no stock permission at all: the answer must not depend on its scope.
    const asker = await writeSyntheticUser(database, routed.organisationCode, keysEnvironment, { label: 'BOOKS' });
    const history = new BookStockHistory();
    const runner = new CommandRunner({
      clock: { now: () => new Date() },
      timezones: syntheticTimezone,
      logger: log.logger,
    });
    const ask = (bookId: string): Promise<boolean> =>
      runner.read(
        {
          commandName: 'stock.synthetic-test',
          organisation: routed,
          correlationId: newCorrelationId(),
          actor: { kind: 'actor', actorId: asker.id },
        },
        (context) => history.hasHeldStock(context, bookId),
      );
    expect(await ask(heldBook)).toBe(true);
    expect(await ask(emptyBook)).toBe(false);
  });

  it('PRD-MOD-001 a book of the other Organisation is not seen', async () => {
    const heldBook = uuidv7();
    await stockAt(AT_STORE_1, BRAND_A, heldBook);
    const other = await connect(world.organisations[1].database, 'runtime');
    try {
      const answer = await other.query<{ held: boolean }>('select stock.book_has_held_stock($1) as held', [heldBook]);
      expect(answer.rows[0]?.held).toBe(false);
    } finally {
      await other.end();
    }
  });
});

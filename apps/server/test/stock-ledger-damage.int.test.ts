import { paise, uuidv7 } from '@apparel-os/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  custody,
  rebuildAndCompare,
  type ItemValue,
  type LedgerItem,
  type NamedGoods,
  type Owner,
} from '../src/modules/stock/ledger/index.js';
import { connect } from './support/postgres.js';
import { APPROVE_DOCUMENT, written } from './support/stock-ledger.js';
import { ValuedWorld, type At, type SyntheticCombination } from './support/stock-valued.js';

// S2-F08-T01: the ledger support damage reports need (stock-ledger 13.15; goods-in 8; PRD-DMG-001 to PRD-DMG-006,
// PRD-STK-017): a hold, the damaged condition and the reversal of a condition change on goods of a product not yet set
// up, named by their receipt origin, since no SKU names them before the identity step (13.14); and the value for
// approval of a damage hold and a condition change, the goods' cost (domain-model 5; DM-8, DEC-105). Posted by the
// synthetic caller through the real command runner, access, row-level security and `finance` · books on real
// PostgreSQL. Every place, SKU, style code and document is SYNTHETIC.

const world = new ValuedWorld();
let combo: SyntheticCombination & { registrationId: string };
let owner: Owner;

beforeAll(async () => {
  await world.start('stockdamage');
  combo = await world.book('moving-average', 'book');
  owner = { kind: 'organisation', legalEntityId: combo.legalEntityId };
}, 600_000);

afterAll(async () => {
  await world.stop();
});

const line = () => uuidv7();
/** The SYNTHETIC brand the goods of Unknown SKU of this file are counted under (13.14; RR-555). */
const BRAND = uuidv7();
let styleNumber = 0;

const read = <T>(work: Parameters<typeof world.run<T>>[1]) => world.run(world.poster.user.id, work);
const rebuild = async () => (await read((context) => rebuildAndCompare(context))).differences;

/** A fresh SYNTHETIC warehouse unit in the book, so each test reads only its own custody. */
async function freshUnit(): Promise<At> {
  return world.unit(combo, await world.site('central-warehouse'), 'warehouse');
}

/** Counts goods of a product not yet set up at a place and answers their receipt origin (13.14; GI-1). */
async function countedUnknown(at: At, quantity: number): Promise<string> {
  styleNumber += 1;
  const result = written(
    await world.post(world.poster, [
      {
        kind: 'receipt-count',
        lineId: line(),
        skuId: null,
        described: { styleCode: `SYN-DMG-STYLE-${String(styleNumber)}`, colour: null, size: null },
        brandId: BRAND,
        quantity,
        to: at,
        condition: 'good',
        owner,
      },
    ]),
  );
  const [originId] = result.receiptOriginIds;
  if (originId === undefined) throw new Error('no origin');
  return originId;
}

/** Goods of Unknown SKU named by their receipt origin (13.15). */
const ofOrigin = (receiptOriginId: string, quantity: number): NamedGoods => ({
  skuId: null,
  receiptOriginId,
  quantity,
});

const damageHold = (at: At, goods: NamedGoods): LedgerItem => ({
  kind: 'place-hold',
  lineId: line(),
  holdKind: 'damage',
  reason: 'SYNTHETIC damage seen at the count',
  at,
  condition: 'good',
  goods: [goods],
});

/** A confirmation's items: the damage hold ends by its own event; the goods become damaged and are quarantined (6.1). */
const confirmation = (at: At, holdId: string, goods: NamedGoods): LedgerItem[] => [
  { kind: 'release-hold', lineId: line(), holdId, event: 'damage-confirmed' },
  { kind: 'condition-change', lineId: line(), at, from: 'good', to: 'damaged', goods },
  {
    kind: 'place-hold',
    lineId: line(),
    holdKind: 'quarantine',
    reason: 'SYNTHETIC damaged goods quarantined',
    at,
    condition: 'damaged',
    goods: [goods],
  },
];

/** Custody of one origin at a unit, by condition (13.6). */
async function custodyOf(at: At, originId: string) {
  const rows = (await read((context) => custody(context, { siteId: at.siteId, businessUnitId: at.businessUnitId })))
    .rows;
  return Object.fromEntries(
    rows.filter((row) => row.receiptOriginId === originId).map((row) => [row.condition, row.quantity]),
  );
}

/** The claims a hold still holds, and its brand set, as the verifier role reads them (15.4). */
async function holdState(holdId: string) {
  const client = await connect(world.database, 'verify');
  try {
    const header = await client.query<{ brand_ids: string[]; kind: string }>(
      'select brand_ids, kind from stock.hold where id = $1',
      [holdId],
    );
    const claims = await client.query<{ quantity: number; receipt_origin_id: string; condition: string }>(
      `select c.quantity, b.receipt_origin_id, b.condition
         from stock.hold_claim c join stock.balance b on b.id = c.balance_id
        where c.hold_id = $1 and c.quantity > 0`,
      [holdId],
    );
    return { ...header.rows[0], claims: claims.rows };
  } finally {
    await client.end();
  }
}

/** A movement's kind and the movement it reverses, as the verifier reads them. */
async function movementOf(movementId: string) {
  const client = await connect(world.database, 'verify');
  try {
    const result = await client.query<{ kind: string; reverses_movement_id: string | null; brand_ids: string[] }>(
      'select kind, reverses_movement_id, brand_ids from stock.movement where id = $1',
      [movementId],
    );
    return result.rows[0];
  } finally {
    await client.end();
  }
}

/** A document approved by a different person, which a condition change's reversal runs under (13.15; access 9.5). */
async function approvedDocument() {
  const document = { recordId: uuidv7(), versionId: uuidv7() };
  const { decision } = await world.approve(world.poster, document);
  if (decision.kind !== 'success') throw new Error(decision.refusal.code);
  return {
    source: world.source(document.recordId, document.versionId),
    approval: { decisionId: decision.answer.decisionId, actionType: APPROVE_DOCUMENT },
  };
}

/** Each item's value on its approval basis under the locks, nothing written (13.1 "Recheck and value"). */
async function valuesOf(items: readonly LedgerItem[]): Promise<readonly ItemValue[]> {
  return world.run(world.poster.user.id, async (context) => {
    const planned = await world.ledger.plan(context, {
      source: world.source(),
      actor: { kind: 'user', userId: world.poster.user.id, roleAssignmentId: world.poster.roleAssignmentId },
      items,
    });
    if (planned.kind === 'refused') throw new Error(planned.refusal.code);
    const locked = await world.ledger.lock(context, planned.value);
    const checked = await world.ledger.recheck(context, locked);
    if (checked.kind === 'refused') throw new Error(checked.refusal.code);
    return checked.value.itemValues;
  });
}

describe('holds on goods of a product not yet set up, named by their receipt origin (stock-ledger 13.15)', () => {
  it('PRD-DMG-001 PRD-DMG-005 a damage hold falls on the origin named, of the brand the goods were counted under', async () => {
    const at = await freshUnit();
    const originId = await countedUnknown(at, 5);
    const other = await countedUnknown(at, 4);
    const placed = written(await world.post(world.poster, [damageHold(at, ofOrigin(originId, 2))]));
    const [holdId] = placed.holdIds;
    expect(await holdState(holdId ?? '')).toEqual({
      kind: 'damage',
      brand_ids: [BRAND],
      claims: [{ quantity: 2, receipt_origin_id: originId, condition: 'good' }],
    });
    // Custody is unchanged: a hold is a status, not a movement (2.3).
    expect(await custodyOf(at, originId)).toEqual({ good: 5 });
    expect(await custodyOf(at, other)).toEqual({ good: 4 });
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-DMG-005 PRD-MOD-015 goods of Unknown SKU are named only by an origin of Unknown SKU, by quantity, within custody', async () => {
    const at = await freshUnit();
    const originId = await countedUnknown(at, 3);
    const sku = world.sku(false);
    const known = written(
      await world.post(world.poster, [
        { kind: 'receipt-count', lineId: line(), skuId: sku.skuId, quantity: 2, to: at, condition: 'good', owner },
      ]),
    ).receiptOriginIds[0];
    const refusals = await Promise.all(
      [
        damageHold(at, ofOrigin(originId, 4)),
        damageHold(at, ofOrigin(known ?? '', 1)),
        damageHold(at, { ...ofOrigin(originId, 1), pieceCodes: ['SYN-PIECE'] } as unknown as NamedGoods),
        damageHold(at, ofOrigin(originId, 0)),
      ].map(async (item) => {
        const result = await world.post(world.poster, [item]);
        return result.kind === 'refused' ? result.refusal.code : 'written';
      }),
    );
    expect(refusals).toEqual([
      'stock.not-in-custody',
      'stock.invalid-item',
      'stock.invalid-item',
      'stock.invalid-item',
    ]);
  });

  it('PRD-DMG-003 a hold on goods of Unknown SKU is released by its own event, and only it', async () => {
    const at = await freshUnit();
    const originId = await countedUnknown(at, 5);
    const damage = written(await world.post(world.poster, [damageHold(at, ofOrigin(originId, 2))])).holdIds[0] ?? '';
    const ordinary =
      written(
        await world.post(world.poster, [
          {
            kind: 'place-hold',
            lineId: line(),
            holdKind: 'ordinary',
            reason: 'SYNTHETIC question about the goods',
            at,
            condition: 'good',
            goods: [ofOrigin(originId, 1)],
          },
        ]),
      ).holdIds[0] ?? '';
    const wrong = await world.post(world.poster, [
      { kind: 'release-hold', lineId: line(), holdId: damage, event: 'released' },
    ]);
    expect(wrong.kind === 'refused' ? wrong.refusal.code : 'written').toBe('stock.wrong-release-event');
    written(
      await world.post(world.poster, [
        { kind: 'release-hold', lineId: line(), holdId: damage, event: 'report-rejected' },
      ]),
    );
    expect((await holdState(damage)).claims).toEqual([]);
    expect((await holdState(ordinary)).claims).toEqual([
      { quantity: 1, receipt_origin_id: originId, condition: 'good' },
    ]);
    expect(await rebuild()).toEqual([]);
  });
});

describe('the damaged condition on goods of Unknown SKU and its reversal (stock-ledger 13.15; PRD-STK-017)', () => {
  it('PRD-DMG-006 PRD-DMG-010 confirmed damage: the goods take the damaged condition and are quarantined where they are', async () => {
    const at = await freshUnit();
    const originId = await countedUnknown(at, 5);
    const holdId = written(await world.post(world.poster, [damageHold(at, ofOrigin(originId, 3))])).holdIds[0] ?? '';
    // Held goods change condition only once their damage hold ends, in the same request (6.2; 13.9).
    const held = await world.post(world.poster, [
      { kind: 'condition-change', lineId: line(), at, from: 'good', to: 'damaged', goods: ofOrigin(originId, 3) },
    ]);
    expect(held.kind === 'refused' ? held.refusal.code : 'written').toBe('stock.held');
    const confirmed = written(await world.post(world.poster, confirmation(at, holdId, ofOrigin(originId, 3))));
    expect(await custodyOf(at, originId)).toEqual({ good: 2, damaged: 3 });
    const quarantine = confirmed.holdIds.find((id) => id !== holdId) ?? '';
    expect(await holdState(quarantine)).toEqual({
      kind: 'quarantine',
      brand_ids: [BRAND],
      claims: [{ quantity: 3, receipt_origin_id: originId, condition: 'damaged' }],
    });
    expect(await movementOf(confirmed.movementIds[0] ?? '')).toEqual({
      kind: 'condition-change',
      reverses_movement_id: null,
      brand_ids: [BRAND],
    });
    expect(await rebuild()).toEqual([]);
  });

  it('PRD-STK-017 a mistaken confirmation is undone by a linked reversal under an approval, restoring the condition and the damage hold', async () => {
    const at = await freshUnit();
    const originId = await countedUnknown(at, 4);
    const holdId = written(await world.post(world.poster, [damageHold(at, ofOrigin(originId, 4))])).holdIds[0] ?? '';
    const confirmed = written(await world.post(world.poster, confirmation(at, holdId, ofOrigin(originId, 4))));
    const changeId = confirmed.movementIds[0] ?? '';
    const quarantine = confirmed.holdIds.find((id) => id !== holdId) ?? '';
    const reversal = (quantity: number): LedgerItem => ({
      kind: 'reversal',
      lineId: line(),
      movementId: changeId,
      at,
      goods: ofOrigin(originId, quantity),
    });
    const restore: LedgerItem[] = [
      { kind: 'release-hold', lineId: line(), holdId: quarantine, event: 'approved-decision' },
      reversal(4),
      damageHold(at, ofOrigin(originId, 4)),
    ];
    // Damaged goods never become good but by this reversal, which needs an approval (PRD-DMG-010; 13.15).
    const unapproved = await world.post(world.poster, restore);
    expect(unapproved.kind === 'refused' ? unapproved.refusal.code : 'written').toBe('stock.condition-route');
    // While the quarantine still holds them, the units are held (6.2).
    const stillHeld = await world.post(world.poster, [reversal(4)], await approvedDocument());
    expect(stillHeld.kind === 'refused' ? stillHeld.refusal.code : 'written').toBe('stock.held');
    const tooMany = await world.post(
      world.poster,
      [{ kind: 'release-hold', lineId: line(), holdId: quarantine, event: 'approved-decision' }, reversal(5)],
      await approvedDocument(),
    );
    expect(tooMany.kind === 'refused' ? tooMany.refusal.code : 'written').toBe('stock.exceeds-source');
    const reversed = written(await world.post(world.poster, restore, await approvedDocument()));
    expect(await custodyOf(at, originId)).toEqual({ good: 4 });
    const reversalId = reversed.movementIds[0] ?? '';
    expect(await movementOf(reversalId)).toEqual({
      kind: 'reversal',
      reverses_movement_id: changeId,
      brand_ids: [BRAND],
    });
    const restored = reversed.holdIds.find((id) => id !== quarantine) ?? '';
    expect(await holdState(restored)).toMatchObject({
      kind: 'damage',
      claims: [{ quantity: 4, receipt_origin_id: originId, condition: 'good' }],
    });
    // Nothing is left of the change to reverse again.
    const again = await world.post(
      world.poster,
      [
        { kind: 'release-hold', lineId: line(), holdId: restored, event: 'report-rejected' },
        { kind: 'condition-change', lineId: line(), at, from: 'good', to: 'damaged', goods: ofOrigin(originId, 1) },
        reversal(1),
      ],
      await approvedDocument(),
    );
    expect(again.kind === 'refused' ? again.refusal.code : 'written').toBe('stock.exceeds-source');
    expect(await rebuild()).toEqual([]);
  });
});

describe('the value of a damage hold and a condition change for their approval (stock-ledger 13.10, 13.15)', () => {
  it('PRD-ACS-015 PRD-ACS-016 DEC-105 the goods cost once their cost is established; Unknown before, and for goods of Unknown SKU', async () => {
    const at = await freshUnit();
    const sku = world.sku(false);
    const receipt = written(
      await world.post(world.poster, [
        { kind: 'receipt-count', lineId: line(), skuId: sku.skuId, quantity: 4, to: at, condition: 'good', owner },
      ]),
    );
    const originId = receipt.receiptOriginIds[0] ?? '';
    const goods: NamedGoods = { skuId: sku.skuId, quantity: 2, receiptOriginId: originId };
    const change: LedgerItem = { kind: 'condition-change', lineId: line(), at, from: 'good', to: 'damaged', goods };
    expect(await valuesOf([damageHold(at, goods), change])).toEqual([{ kind: 'unknown' }, { kind: 'unknown' }]);
    const ptRevisionId = uuidv7();
    written(
      await world.post(world.poster, [
        { kind: 'record-coverage', lineId: line(), ptRevisionId, receiptOriginId: originId, quantity: 4 },
        {
          kind: 'cost-established',
          lineId: line(),
          receiptOriginId: originId,
          ptRevisionId,
          pRatePaise: paise(12_500),
        },
      ]),
    );
    // SYNTHETIC: 4 units at 125.00 each in a moving-average book pool; 2 of them cost 250.00.
    expect(await valuesOf([damageHold(at, goods)])).toEqual([{ kind: 'known', amountPaise: 25_000 }]);
    expect(await valuesOf([change])).toEqual([{ kind: 'known', amountPaise: 25_000 }]);
    // Any other hold answers no cost of its own (13.9): only the damage hold is the approved action's goods.
    expect(
      await valuesOf([
        {
          kind: 'place-hold',
          lineId: line(),
          holdKind: 'ordinary',
          reason: 'SYNTHETIC question',
          at,
          condition: 'good',
          goods: [goods],
        },
      ]),
    ).toEqual([{ kind: 'unknown' }]);
    const unknownOrigin = await countedUnknown(at, 2);
    expect(await valuesOf([damageHold(at, ofOrigin(unknownOrigin, 1))])).toEqual([{ kind: 'unknown' }]);
  });
});

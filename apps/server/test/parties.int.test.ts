import {
  AGREEMENT_TYPE,
  BANK_DETAILS_TYPE,
  type AgreementTerms,
  type PartyChanged,
  type PartyRole,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticKeysEnvironment } from './support/access.js';
import { grantSynthetic } from './support/grants.js';
import { decided, structureSetup, type StructureSetup } from './support/organisation.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect } from './support/postgres.js';

// S1-F03-T03: parties, brand–supplier links, agreements and bank details through the parties part's interface and
// access's Decide, on real PostgreSQL (structure-and-masters 2.2, 5, 9 tests 12, 13, 14, 16 (agreement clause) and 21;
// access-and-approvals 6). Every value here is SYNTHETIC: no term, margin or bank detail is KDPS's (V-14, RR-235).

let world: SyntheticWorld;
let setup: StructureSetup;
let other: StructureSetup;
let counter = 0;
const next = (prefix: string) => `${prefix}-${String(++counter)}`;

beforeAll(async () => {
  world = await createSyntheticOrganisations('parties');
  const [orgA, orgB] = world.organisations;
  const keysEnvironment = syntheticKeysEnvironment(world);
  setup = await structureSetup({
    directory: world.directory,
    database: orgA.database,
    organisationCode: orgA.code,
    keysEnvironment,
    label: 'PARTIES-A',
  });
  other = await structureSetup({
    directory: world.directory,
    database: orgB.database,
    organisationCode: orgB.code,
    keysEnvironment,
    label: 'PARTIES-B',
  });
  // The preparer may approve too, so a refusal of their own preparation is for the preparation alone (PRD-ACS-006).
  await grantSynthetic(orgA.database, { kind: 'user', id: setup.preparer.id }, [
    { recordType: BANK_DETAILS_TYPE, action: 'approve' },
    { recordType: AGREEMENT_TYPE, action: 'approve' },
  ]);
});

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  await (other as StructureSetup | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

type Outcome = { kind: 'success'; answer: PartyChanged } | { kind: 'refusal'; refusal: { code: string } };

function recorded(outcome: Outcome): PartyChanged {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

/** Every term Unknown (POL-01.11): nothing is defaulted. */
const UNKNOWN_TERMS: AgreementTerms = {
  commercialModel: null,
  defaultModel: null,
  ownershipEvent: null,
  returnRights: { allowed: null, window: null, startsAt: null },
  returnConditions: {
    conditionTags: null,
    packagingLimits: null,
    quantityLimits: null,
    supplierApproval: null,
    freightAndDeductions: null,
    settlement: null,
  },
  commissions: null,
  paymentTerms: null,
  creditNoteTerms: null,
  promotionTerms: null,
  cashDiscount: { rate: null, days: null, from: null },
  interest: { rate: null, days: null, from: null },
};

const SYNTHETIC_BANK = {
  accountHolder: 'SYNTHETIC Holder Sixty One',
  accountNumber: 'SYN000111222333',
  ifsc: 'SYNB0000611',
  bankName: 'SYNTHETIC Bank of Tests',
};

const party = async (roles: PartyRole[], on: StructureSetup = setup) =>
  recorded(
    await on.asPreparerDo((c, p) =>
      on.parties.prepareParty(c, p, {
        code: syntheticCode(next('PARTY')),
        legalName: syntheticName(`Party ${String(counter)}`),
        taxIdentities: [{ kind: 'SYNTHETIC-TAX', number: `0${String(counter)}SYN` }],
        msmeClassification: null,
        contacts: [syntheticName('Contact line')],
        roles,
        validFrom: on.today(),
      }),
    ),
  );

const brand = async () =>
  recorded(
    await setup.asPreparerDo((c, p) =>
      setup.catalogue.prepareBrand(c, p, {
        code: syntheticCode(next('BRAND')),
        name: syntheticName(`Brand ${String(counter)}`),
        aliases: [],
        validFrom: setup.today(),
      }),
    ),
  );

const readParty = (partyId: string, on: StructureSetup = setup) =>
  on.run(on.preparer.id, (c) => on.parties.readParty(c, partyId, on.today()));

const changeBank = (partyId: string, versionToken?: string) =>
  setup.asPreparerDo((c, p) =>
    setup.parties.prepareBankDetails(c, p, partyId, {
      ...SYNTHETIC_BANK,
      validFrom: setup.today(),
      ...(versionToken === undefined ? {} : { versionToken }),
    }),
  );

describe('parties (structure-and-masters 5.1; PRD-MER-001)', () => {
  it('PRD-MER-001 keeps one party with its versioned fields and each role its own dated record', async () => {
    const supplier = await party(['supplier', 'invoicing-party']);
    const record = await readParty(supplier.recordId);
    expect(record?.versions).toEqual([
      expect.objectContaining({
        state: 'In force',
        msmeClassification: null,
        contacts: [syntheticName('Contact line')],
      }),
    ]);
    expect(record?.roles.map((role) => role.role)).toEqual(['invoicing-party', 'supplier']);
    // Ending one role from tomorrow leaves the other as it was.
    const invoicing = record?.roles.find((role) => role.role === 'invoicing-party');
    recorded(
      await setup.asPreparerDo((c, p) =>
        setup.parties.preparePartyRoleVersion(c, p, supplier.recordId, {
          role: 'invoicing-party',
          held: false,
          validFrom: setup.day(1),
          versionToken: invoicing?.versionToken,
        }),
      ),
    );
    const after = await readParty(supplier.recordId);
    expect(
      after?.roles.find((role) => role.role === 'invoicing-party')?.versions.map((v) => [v.state, v.held]),
    ).toEqual([
      ['Scheduled', false],
      ['In force', true],
    ]);
    expect(after?.roles.find((role) => role.role === 'supplier')?.versions).toHaveLength(1);
  });

  it('PRD-MOD-010 GC2-7 refuses a party version that starts on a past date, and a stale version token', async () => {
    const known = await party(['agent']);
    const record = await readParty(known.recordId);
    const version = (validFrom: string, versionToken?: string) =>
      setup.asPreparerDo((c, p) =>
        setup.parties.preparePartyVersion(c, p, known.recordId, {
          legalName: syntheticName('Renamed party'),
          taxIdentities: [],
          msmeClassification: 'small',
          contacts: [],
          validFrom,
          versionToken,
        }),
      );
    expect(await version(setup.day(-1), record?.versionToken)).toMatchObject({
      refusal: { code: 'merchandise.starts-in-past' },
    });
    recorded(await version(setup.day(2), record?.versionToken));
    expect(await version(setup.day(3), record?.versionToken)).toMatchObject({
      refusal: { code: 'kernel.stale-version' },
    });
  });
});

describe('bank details (structure-and-masters 5.1, 9 tests 12 and 21; POL-02.07, PRD-ACS-008, PRD-SEC-006)', () => {
  it('POL-02.07 PRD-ACS-008 refuses a supplier’s bank-detail change approved by its preparer (test 12); hidden in every read', async () => {
    const supplier = await party(['supplier']);
    const change = recorded(await changeBank(supplier.recordId));
    expect((await readParty(supplier.recordId))?.bankDetails.versions).toEqual([
      expect.objectContaining({ state: 'Awaiting approval', masked: true }),
    ]);
    const own = await setup.decide(change.requestId ?? '', change.versionId, 'approve', setup.preparer);
    expect(own).toMatchObject({ kind: 'refusal', refusal: { code: 'access.self-preparation' } });
    expect((await readParty(supplier.recordId))?.bankDetails.versions[0]?.state).toBe('Awaiting approval');
    decided(await setup.decide(change.requestId ?? '', change.versionId));
    const read = await readParty(supplier.recordId);
    expect(read?.bankDetails.versions).toEqual([expect.objectContaining({ state: 'In force', masked: true })]);
    // Read a party never carries the value: only the protected Show opens it (5.5; access-and-approvals 3.3).
    expect(JSON.stringify(read)).not.toContain(SYNTHETIC_BANK.accountNumber);
    const opened = await setup.run(setup.preparer.id, (c) =>
      setup.parties.openBankDetails(c, supplier.recordId, change.versionId),
    );
    expect(opened).toEqual(SYNTHETIC_BANK);
  });

  it('PRD-ACS-006 GC2-6 refuses a non-supplier party’s bank-detail change approved by its preparer (test 21)', async () => {
    const agent = await party(['agent']);
    const change = recorded(await changeBank(agent.recordId));
    expect(await setup.decide(change.requestId ?? '', change.versionId, 'approve', setup.preparer)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.self-preparation' },
    });
    decided(await setup.decide(change.requestId ?? '', change.versionId));
    expect((await readParty(agent.recordId))?.bankDetails.versions[0]?.state).toBe('In force');
  });

  it('PRD-SEC-006 keeps bank details only encrypted in the database and names only versions in the audit record', async () => {
    const supplier = await party(['supplier']);
    const change = recorded(await changeBank(supplier.recordId));
    decided(await setup.decide(change.requestId ?? '', change.versionId));
    const client = await connect(world.organisations[0].database, 'migration');
    try {
      const stored = await client.query<{ sealed: string }>(
        'select sealed from merchandise.party_bank_details where id = $1',
        [change.versionId],
      );
      const sealed = stored.rows[0]?.sealed ?? '';
      expect(sealed).not.toBe('');
      const everyValue = Object.values(SYNTHETIC_BANK);
      const rows = await client.query<{ row: string }>(
        `select to_jsonb(b)::text as row from merchandise.party_bank_details b where party_id = $1`,
        [supplier.recordId],
      );
      for (const row of rows.rows) for (const plain of everyValue) expect(row.row).not.toContain(plain);
      const audits = await client.query<{ row: string }>(
        `select to_jsonb(a)::text as row from audit.audit_record a where record_id = $1`,
        [supplier.recordId],
      );
      expect(audits.rows.length).toBeGreaterThan(0);
      for (const row of audits.rows) {
        expect(row.row).not.toContain(sealed);
        for (const plain of everyValue) expect(row.row).not.toContain(plain);
      }
    } finally {
      await client.end();
    }
  });
});

describe('brand–supplier links (structure-and-masters 5.1; PRD-MER-021; DEC-123)', () => {
  it('PRD-MER-021 links brands and suppliers many-to-many, effective-dated, and only a supplier', async () => {
    const [first, second] = [await brand(), await brand()];
    const supplierA = await party(['supplier']);
    const supplierB = await party(['supplier']);
    const agent = await party(['agent']);
    const link = (brandId: string, partyId: string) =>
      setup.asPreparerDo((c, p) =>
        setup.parties.prepareBrandSupplierLink(c, p, { brandId, partyId, linked: true, validFrom: setup.today() }),
      );
    for (const [brandId, partyId] of [
      [first.recordId, supplierA.recordId],
      [first.recordId, supplierB.recordId],
      [second.recordId, supplierA.recordId],
    ] as const) {
      recorded(await link(brandId, partyId));
    }
    expect(await link(second.recordId, agent.recordId)).toMatchObject({
      refusal: { code: 'merchandise.party-not-supplier' },
    });
    const links = await setup.run(setup.preparer.id, (c) => setup.parties.listBrandSupplierLinks(c, setup.today(), {}));
    const ofFirst = links.records.filter((each) => each.brandId === first.recordId);
    // No exclusive supplier is inferred: the first brand has two.
    expect(ofFirst.map((each) => each.partyId).sort()).toEqual([supplierA.recordId, supplierB.recordId].sort());
    expect(ofFirst[0]?.versions).toEqual([expect.objectContaining({ state: 'In force', linked: true })]);
  });
});

describe('agreements (structure-and-masters 5.2, 5.5, 9 tests 13 and 16; POL-01.11, PRD-ORG-016)', () => {
  it('POL-01.11 PRD-MOD-015 keeps agreement terms left Unknown as Unknown (test 13), read as the terms in force', async () => {
    const supplier = await party(['supplier']);
    const prepared = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.parties.prepareAgreement(c, p, {
          code: syntheticCode(next('AGR')),
          counterparty: { kind: 'supplier', partyId: supplier.recordId },
          terms: UNKNOWN_TERMS,
          margins: null,
          signedAgreement: [],
          validFrom: setup.today(),
        }),
      ),
    );
    const terms = () =>
      setup.run(setup.preparer.id, (c) =>
        setup.parties.termsInForce(c, { partyId: supplier.recordId }, setup.today(), true),
      );
    // Not in force until a different person approves it (GC2-2).
    expect(await terms()).toBeUndefined();
    decided(await setup.decide(prepared.requestId ?? '', prepared.versionId));
    expect(await terms()).toMatchObject({
      agreementId: prepared.recordId,
      versionId: prepared.versionId,
      terms: UNKNOWN_TERMS,
      margins: { kind: 'shown', value: null },
    });
  });

  it('GC2-2 PRD-ACS-006 refuses an agreement version approved by its preparer (test 16, agreement clause)', async () => {
    const theBrand = await brand();
    const prepared = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.parties.prepareAgreement(c, p, {
          code: syntheticCode(next('AGR')),
          counterparty: { kind: 'brand', brandId: theBrand.recordId },
          terms: { ...UNKNOWN_TERMS, commercialModel: 'sale-or-return', ownershipEvent: { kind: 'sale-to-customer' } },
          margins: 'SYNTHETIC margin',
          signedAgreement: [],
          validFrom: setup.today(),
        }),
      ),
    );
    expect(await setup.decide(prepared.requestId ?? '', prepared.versionId, 'approve', setup.preparer)).toMatchObject({
      kind: 'refusal',
      refusal: { code: 'access.self-preparation' },
    });
    const record = await setup.run(setup.preparer.id, (c) =>
      setup.parties.readAgreement(c, prepared.recordId, setup.today(), false),
    );
    // A reader without the margin class sees margins masked (PRD-ACS-008).
    expect(record?.versions).toEqual([
      expect.objectContaining({ state: 'Awaiting approval', margins: { kind: 'masked' } }),
    ]);
  });

  it('PRD-PAY-015 keeps cash-discount and interest terms a supplier’s; one agreement per brand or supplier', async () => {
    const theBrand = await brand();
    const draft = (terms: AgreementTerms) => ({
      code: syntheticCode(next('AGR')),
      counterparty: { kind: 'brand' as const, brandId: theBrand.recordId },
      terms,
      margins: null,
      signedAgreement: [],
      validFrom: setup.today(),
    });
    expect(
      await setup.asPreparerDo((c, p) =>
        setup.parties.prepareAgreement(
          c,
          p,
          draft({ ...UNKNOWN_TERMS, cashDiscount: { rate: 'SYNTHETIC rate', days: 7, from: null } }),
        ),
      ),
    ).toMatchObject({ refusal: { code: 'merchandise.supplier-terms-on-brand-agreement' } });
    recorded(await setup.asPreparerDo((c, p) => setup.parties.prepareAgreement(c, p, draft(UNKNOWN_TERMS))));
    expect(
      await setup.asPreparerDo((c, p) => setup.parties.prepareAgreement(c, p, draft(UNKNOWN_TERMS))),
    ).toMatchObject({ refusal: { code: 'merchandise.agreement-exists' } });
  });
});

describe('two Organisations (structure-and-masters 9 test 14; PRD-ORG-002, PRD-ACS-020)', () => {
  it('PRD-ACS-020 a second synthetic Organisation sees none of these records', async () => {
    const mine = await party(['supplier']);
    const theirs = await other.run(other.preparer.id, (c) => other.parties.listParties(c, other.today(), {}));
    expect(theirs.records.map((record) => record.id)).not.toContain(mine.recordId);
    expect(await readParty(mine.recordId, other)).toBeUndefined();
  });
});

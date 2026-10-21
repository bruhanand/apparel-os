import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv7 } from '@apparel-os/domain';
import type { AgreementTerms } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDatabase, migrationSetFolder, readMigrationSet } from '../src/kernel/index.js';
import { ORGANISATION_KEYS_VARIABLE } from '../src/modules/access/index.js';
import { SYNTHETIC_ORGANISATIONS, syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { structureSetup, type StructureSetup } from './support/organisation.js';
import {
  connect,
  createEmptyDatabase,
  createTestDatabase,
  databaseUrl,
  dropDatabase,
  sqlState,
} from './support/postgres.js';

// S2-F01-T01: the agreement's default model for new bookings retired (DEC-129, POL-01.02; RR-545; structure-and-masters
// 5.2 as built). Agreement versions stored in the shape `agreement-terms/1`, before the migration that retires the
// term, read back after it through the parties part's interface with every other term as stored and no default model;
// no stored version carries one, and the versions' guard is back on. Every value here is SYNTHETIC: no term or margin
// is KDPS's (V-14).

const SET = migrationSetFolder('organisation');
const FILES = readMigrationSet(SET);
const RETIRING = FILES.find((file) =>
  file.fileName.endsWith('__merchandise.parties__agreement_terms_without_default_model.sql'),
);
const ORGANISATION = SYNTHETIC_ORGANISATIONS[0];
const scratch = mkdtempSync(join(tmpdir(), 'aos-agreement-terms-'));

/** Every term given, so that each one is seen to come back as it was stored. */
const STORED_TERMS: AgreementTerms = {
  commercialModel: 'sale-or-return',
  ownershipEvent: { kind: 'other', description: syntheticName('Agreed ownership event') },
  returnRights: { allowed: true, window: { kind: 'days', days: 45 }, startsAt: 'receipt' },
  returnConditions: {
    conditionTags: [syntheticName('Tag one'), syntheticName('Tag two')],
    packagingLimits: syntheticName('Packaging limits'),
    quantityLimits: syntheticName('Quantity limits'),
    supplierApproval: false,
    freightAndDeductions: syntheticName('Freight and deductions'),
    settlement: 'credit-note',
  },
  commissions: syntheticName('Commissions'),
  paymentTerms: syntheticName('Payment terms'),
  creditNoteTerms: syntheticName('Credit-note terms'),
  promotionTerms: syntheticName('Promotion terms'),
  cashDiscount: { rate: syntheticName('Cash-discount rate'), days: 10, from: syntheticName('Invoice date') },
  interest: { rate: null, days: null, from: null },
};
/** A later version still awaiting approval, its terms left Unknown (POL-01.11). */
const LATER_TERMS: AgreementTerms = {
  commercialModel: null,
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
const MARGIN = syntheticName('Margin as stored');

let directory: string;
let database: string;
let setup: StructureSetup;
const partyId = uuidv7();
const agreementId = uuidv7();
const approvedId = uuidv7();
const awaitingId = uuidv7();

beforeAll(async () => {
  if (RETIRING === undefined) throw new Error('The migration that retires the default model is not in the set');
  // The Organisation set as it stood before that migration.
  const before = join(scratch, 'organisation');
  mkdirSync(before);
  for (const name of ['tables.json', 'maintenance.sql']) copyFileSync(join(SET, name), join(before, name));
  for (const file of FILES.filter((each) => each.number < RETIRING.number)) {
    copyFileSync(join(SET, file.fileName), join(before, file.fileName));
  }
  directory = await createTestDatabase('directory', 'agrterms_dir');
  database = await createEmptyDatabase('agrterms_org');
  await migrateDatabase({ connectionString: databaseUrl(database, 'migration'), folder: before });
  // Test setup writes what the earlier code stored (code-house-rules 10.1): one approved version in force and a later
  // one awaiting approval, each in `agreement-terms/1`, which held a default model for new bookings.
  const owner = await connect(database, 'migration');
  try {
    await owner.query('insert into merchandise.party (id, code) values ($1, $2)', [
      partyId,
      syntheticCode('TERMS-SUPPLIER'),
    ]);
    await owner.query('insert into merchandise.agreement (id, code, brand_id, party_id) values ($1, $2, null, $3)', [
      agreementId,
      syntheticCode('TERMS-AGR'),
      partyId,
    ]);
    const version = `insert into merchandise.agreement_version (id, agreement_id, terms, terms_format, margins,
        signed_agreement_attachment_ids, valid_during, decision, prepared_by_user_id)
      values ($1, $2, $3, 'agreement-terms/1', $4, '{}', $5::daterange, $6, $7)`;
    await owner.query(version, [
      approvedId,
      agreementId,
      { ...STORED_TERMS, defaultModel: 'consignment' },
      MARGIN,
      '[2026-01-01,2027-01-01)',
      'Approved',
      uuidv7(),
    ]);
    await owner.query(version, [
      awaitingId,
      agreementId,
      { ...LATER_TERMS, defaultModel: null },
      null,
      '[2027-01-01,)',
      'Awaiting approval',
      uuidv7(),
    ]);
  } finally {
    await owner.end();
  }
  // Then the rest of the set, as a deploy would run it (code-house-rules 4.3).
  await migrateDatabase({ connectionString: databaseUrl(database, 'migration'), folder: SET });
  const listing = await connect(directory, 'migration');
  try {
    await listing.query(
      'insert into kernel.directory_entry (id, organisation_code, database_name) values ($1, $2, $3)',
      [uuidv7(), ORGANISATION.code, database],
    );
  } finally {
    await listing.end();
  }
  setup = await structureSetup({
    directory,
    database,
    organisationCode: ORGANISATION.code,
    keysEnvironment: {
      [ORGANISATION_KEYS_VARIABLE]: JSON.stringify({ [ORGANISATION.code]: randomBytes(32).toString('base64url') }),
    },
    label: 'AGREEMENT-TERMS',
  });
});

afterAll(async () => {
  await (setup as StructureSetup | undefined)?.close();
  for (const name of [database as string | undefined, directory as string | undefined]) {
    if (name !== undefined) await dropDatabase(name);
  }
  rmSync(scratch, { recursive: true, force: true });
});

describe('agreement versions stored before the default model was retired (structure-and-masters 5.2; DEC-129)', () => {
  it('DEC-129 POL-01.02 reads every stored version back with every other term as stored and no default model', async () => {
    const record = await setup.run(setup.preparer.id, (c) =>
      setup.parties.readAgreement(c, agreementId, '2026-06-01', true),
    );
    expect(record?.versions).toEqual([
      expect.objectContaining({
        id: awaitingId,
        state: 'Awaiting approval',
        validFrom: '2027-01-01',
        terms: LATER_TERMS,
        margins: { kind: 'shown', value: null },
      }),
      expect.objectContaining({
        id: approvedId,
        state: 'In force',
        validFrom: '2026-01-01',
        validTo: '2027-01-01',
        terms: STORED_TERMS,
        margins: { kind: 'shown', value: MARGIN },
        signedAgreement: [],
      }),
    ]);
    const inForce = await setup.run(setup.preparer.id, (c) =>
      setup.parties.termsInForce(c, { partyId }, '2026-06-01', true),
    );
    expect(inForce).toMatchObject({ agreementId, versionId: approvedId, terms: STORED_TERMS });
    expect(inForce?.terms).toEqual(STORED_TERMS);
  });

  it('DEC-129 RR-545 leaves no stored version carrying a default model, and refuses one written again', async () => {
    const owner = await connect(database, 'migration');
    try {
      const left = await owner.query<{ id: string }>(
        `select id from merchandise.agreement_version
         where terms ? 'defaultModel' or terms_format <> 'agreement-terms/2'`,
      );
      expect(left.rows).toEqual([]);
    } finally {
      await owner.end();
    }
    const runtime = await connect(database, 'runtime');
    try {
      const insert = (terms: unknown, format: string) =>
        runtime.query(
          `insert into merchandise.agreement_version (id, agreement_id, terms, terms_format, margins,
             signed_agreement_attachment_ids, valid_during, decision, prepared_by_user_id)
           values ($1, $2, $3, $4, null, '{}', '[2028-01-01,)', 'Awaiting approval', $5)`,
          [uuidv7(), agreementId, terms, format, uuidv7()],
        );
      // 23514: a check constraint refuses the row (code-house-rules 3.3).
      expect(await sqlState(insert({ ...LATER_TERMS, defaultModel: null }, 'agreement-terms/2'))).toBe('23514');
      expect(await sqlState(insert(LATER_TERMS, 'agreement-terms/1'))).toBe('23514');
      // The versions' guard is on again: an approved version's terms do not change (code-house-rules 7.3).
      expect(
        await sqlState(
          runtime.query('update merchandise.agreement_version set terms = $1 where id = $2', [LATER_TERMS, approvedId]),
        ),
      ).toBe('AO003');
    } finally {
      await runtime.end();
    }
  });
});

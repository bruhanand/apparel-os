import { copyFileSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { uuidv7 } from '@apparel-os/domain';
import type { AgreementTerms, PartyChanged } from '@apparel-os/schemas';
import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrateDatabase, migrationSetFolder, readMigrationSet } from '../src/kernel/index.js';
import { ORGANISATION_KEYS_VARIABLE } from '../src/modules/access/index.js';
import { SYNTHETIC_ORGANISATIONS, syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { decided, structureSetup, type StructureSetup } from './support/organisation.js';
import {
  allowVerifier,
  connect,
  createEmptyDatabase,
  createTestDatabase,
  databaseUrl,
  dropDatabase,
  sqlState,
} from './support/postgres.js';

// S2-F01-T01: the agreement's default model for new bookings retired (DEC-129, POL-01.02; RR-545; structure-and-masters
// 5.2 "The default model retired, as built"). Agreement versions stored in the shape `agreement-terms/1`, before the
// migration that retires the term, are kept exactly as stored; read through the parties part's interface they answer
// without the term, every other term as stored. A new version is written in `agreement-terms/2` and can never carry
// the term, while an old version still changes as its guard allows. Every value here is SYNTHETIC: no term or margin is
// KDPS's (V-14).

const SET = migrationSetFolder('organisation');
const FILES = readMigrationSet(SET);
const RETIRING = FILES.find((file) =>
  file.fileName.endsWith('__merchandise.parties__agreement_terms_without_default_model.sql'),
);
const ORGANISATION = SYNTHETIC_ORGANISATIONS[0];
const scratch = mkdtempSync(join(tmpdir(), 'aos-agreement-terms-'));
const DAY_MS = 86_400_000;
const day = (fromToday: number) => new Date(Date.now() + fromToday * DAY_MS).toISOString().slice(0, 10);

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

/** One supplier's agreement as the earlier code stored it: an approved version in force and a later one awaiting. */
interface Stored {
  readonly partyId: string;
  readonly agreementId: string;
  readonly approvedId: string;
  readonly awaitingId: string;
}
const stored = (): Stored => ({ partyId: uuidv7(), agreementId: uuidv7(), approvedId: uuidv7(), awaitingId: uuidv7() });
/** Read back only. */
const kept = stored();
/** Given a new version, which ends its approved one. */
const revised = stored();

let directory: string;
let database: string;
let setup: StructureSetup;
/** Agreement `kept`'s version rows as stored, before the migration. */
let keptRows: string[];

async function writeStored(owner: Client, label: string, agreement: Stored): Promise<void> {
  await owner.query('insert into merchandise.party (id, code) values ($1, $2)', [
    agreement.partyId,
    syntheticCode(`${label}-SUPPLIER`),
  ]);
  await owner.query(
    `insert into merchandise.party_role (id, party_id, role, held, valid_during, decision, prepared_by_user_id)
     values ($1, $2, 'supplier', true, $3::daterange, 'Approved', $4)`,
    [uuidv7(), agreement.partyId, `[${day(-30)},)`, uuidv7()],
  );
  await owner.query('insert into merchandise.agreement (id, code, brand_id, party_id) values ($1, $2, null, $3)', [
    agreement.agreementId,
    syntheticCode(`${label}-AGR`),
    agreement.partyId,
  ]);
  const version = `insert into merchandise.agreement_version (id, agreement_id, terms, terms_format, margins,
      signed_agreement_attachment_ids, valid_during, decision, prepared_by_user_id)
    values ($1, $2, $3, 'agreement-terms/1', $4, '{}', $5::daterange, $6, $7)`;
  await owner.query(version, [
    agreement.approvedId,
    agreement.agreementId,
    { ...STORED_TERMS, defaultModel: 'consignment' },
    MARGIN,
    `[${day(-30)},${day(60)})`,
    'Approved',
    uuidv7(),
  ]);
  await owner.query(version, [
    agreement.awaitingId,
    agreement.agreementId,
    { ...LATER_TERMS, defaultModel: null },
    null,
    `[${day(60)},)`,
    'Awaiting approval',
    uuidv7(),
  ]);
}

/**
 * The rows of one agreement's versions, whole, as stored: in test setup as the migration role, and in a test as the
 * read-only test role, a raw invariant query (code-house-rules 10.1, 5.1; CH-4).
 */
async function versionRows(agreementId: string, role: 'migration' | 'verify'): Promise<string[]> {
  const client = await connect(database, role);
  try {
    const rows = await client.query<{ row: string }>(
      'select to_jsonb(v)::text as row from merchandise.agreement_version v where agreement_id = $1 order by id',
      [agreementId],
    );
    return rows.rows.map((each) => each.row);
  } finally {
    await client.end();
  }
}

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
  // Test setup writes what the earlier code stored (code-house-rules 10.1), in `agreement-terms/1`, which held a
  // default model for new bookings.
  const owner = await connect(database, 'migration');
  try {
    await writeStored(owner, 'KEPT', kept);
    await writeStored(owner, 'REVISED', revised);
  } finally {
    await owner.end();
  }
  keptRows = await versionRows(kept.agreementId, 'migration');
  // Then the rest of the set, as a deploy would run it (code-house-rules 4.3); only then may the read-only test role
  // connect, since the runner checks who holds privileges on the database.
  await migrateDatabase({ connectionString: databaseUrl(database, 'migration'), folder: SET });
  await allowVerifier(database);
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

function recorded(outcome: { kind: 'success'; answer: PartyChanged } | { kind: 'refusal'; refusal: { code: string } }) {
  if (outcome.kind !== 'success') throw new Error(`Refused: ${outcome.refusal.code}`);
  return outcome.answer;
}

describe('agreement versions stored before the default model was retired (structure-and-masters 5.2; DEC-129)', () => {
  it('DEC-129 PRD-MOD-011 keeps every version stored in agreement-terms/1 exactly as it was stored', async () => {
    expect(keptRows).toHaveLength(2);
    expect(await versionRows(kept.agreementId, 'verify')).toEqual(keptRows);
  });

  it('DEC-129 POL-01.02 reads each stored version back without the default model, every other term as stored', async () => {
    const record = await setup.run(setup.preparer.id, (c) =>
      setup.parties.readAgreement(c, kept.agreementId, day(0), true),
    );
    expect(record?.versions).toEqual([
      expect.objectContaining({
        id: kept.awaitingId,
        state: 'Awaiting approval',
        validFrom: day(60),
        terms: LATER_TERMS,
        margins: { kind: 'shown', value: null },
      }),
      expect.objectContaining({
        id: kept.approvedId,
        state: 'In force',
        validFrom: day(-30),
        validTo: day(60),
        terms: STORED_TERMS,
        margins: { kind: 'shown', value: MARGIN },
        signedAgreement: [],
      }),
    ]);
    const inForce = await setup.run(setup.preparer.id, (c) =>
      setup.parties.termsInForce(c, { partyId: kept.partyId }, day(0), true),
    );
    expect(inForce).toMatchObject({ agreementId: kept.agreementId, versionId: kept.approvedId });
    expect(inForce?.terms).toEqual(STORED_TERMS);
  });

  it('DEC-129 RR-545 writes a new version in agreement-terms/2 and never with the term; an old version still ends', async () => {
    const before = await setup.run(setup.preparer.id, (c) =>
      setup.parties.readAgreement(c, revised.agreementId, day(0), true),
    );
    const prepared = recorded(
      await setup.asPreparerDo((c, p) =>
        setup.parties.prepareAgreementVersion(c, p, revised.agreementId, {
          terms: { ...STORED_TERMS, commercialModel: 'outright' },
          margins: null,
          signedAgreement: [],
          validFrom: day(1),
          versionToken: before?.versionToken,
        }),
      ),
    );
    decided(await setup.decide(prepared.requestId ?? '', prepared.versionId));
    // A raw invariant query, as the read-only test role (code-house-rules 10.1).
    const verifier = await connect(database, 'verify');
    try {
      const rows = await verifier.query<{ id: string; format: string; retired: boolean; ends: string | null }>(
        `select id, terms_format as format, terms ? 'defaultModel' as retired, upper(valid_during)::text as ends
         from merchandise.agreement_version where agreement_id = $1 order by lower(valid_during)`,
        [revised.agreementId],
      );
      // The old approved version ends where the new one starts, its terms still as stored (code-house-rules 7.3).
      expect(rows.rows).toEqual([
        { id: revised.approvedId, format: 'agreement-terms/1', retired: true, ends: day(1) },
        { id: prepared.versionId, format: 'agreement-terms/2', retired: false, ends: null },
        { id: revised.awaitingId, format: 'agreement-terms/1', retired: true, ends: null },
      ]);
    } finally {
      await verifier.end();
    }
    const runtime = await connect(database, 'runtime');
    try {
      const insert = (terms: unknown, format: string) =>
        runtime.query(
          `insert into merchandise.agreement_version (id, agreement_id, terms, terms_format, margins,
             signed_agreement_attachment_ids, valid_during, decision, prepared_by_user_id)
           values ($1, $2, $3, $4, null, '{}', $5::daterange, 'Awaiting approval', $6)`,
          [uuidv7(), revised.agreementId, terms, format, `[${day(90)},)`, uuidv7()],
        );
      // 23514: a new row is refused with the term, or in the shape that held it (code-house-rules 3.3).
      expect(await sqlState(insert({ ...LATER_TERMS, defaultModel: null }, 'agreement-terms/2'))).toBe('23514');
      expect(await sqlState(insert(LATER_TERMS, 'agreement-terms/1'))).toBe('23514');
      expect(await sqlState(insert({ ...LATER_TERMS, defaultModel: null }, 'agreement-terms/1'))).toBe('23514');
      // The versions' guard holds as before: an approved version's terms never change, not even to drop the term
      // (code-house-rules 7.3).
      expect(
        await sqlState(
          runtime.query('update merchandise.agreement_version set terms = $1 where id = $2', [
            STORED_TERMS,
            kept.approvedId,
          ]),
        ),
      ).toBe('AO003');
    } finally {
      await runtime.end();
    }
  });
});

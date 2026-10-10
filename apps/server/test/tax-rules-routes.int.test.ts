import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { taxRuleRecordReadSchema, taxRulesReadSchema } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SyntheticClock,
  SYNTHETIC_ORIGIN,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { writeSyntheticTaxRegistration } from './support/tax-rules.js';

// S1-F09-T04: the tax rules part's routes through the whole application, on real PostgreSQL (shared-calculations 10;
// code-house-rules 12.1, 12.3; DEC-116, API only in stage 1): a classification prepared by one Accounts user, its CA
// evidence referenced and its version decided by another, then read in force; a malformed rounding rule refused with
// its code. Every value here is SYNTHETIC.

let world: SyntheticWorld;
let database: string;
let organisationCode: string;
let api: AccessTestApp;
let keys: Record<string, string>;
let clock: SyntheticClock;
let approveReason: string;
const cookies = new Map<string, string>();
let preparer: SyntheticUser;
let approver: SyntheticUser;
let registrationId: string;

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function freshCode(user: SyntheticUser): string {
  clock.advance(30);
  return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now());
}

async function enrolled(label: string, authorities: readonly SyntheticAuthority[]): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities);
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.52' },
    body: JSON.stringify({ organisationCode, login: user.login, password: user.password, totpCode: freshCode(user) }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
  return user;
}

async function post(user: SyntheticUser, path: string, body: unknown): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SYNTHETIC_ORIGIN,
      cookie: cookies.get(user.id) ?? '',
      'idempotency-key': uuidv7(),
    },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

async function get(user: SyntheticUser, path: string): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, { headers: { cookie: cookies.get(user.id) ?? '' } });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

const today = () => clock.now().toISOString().slice(0, 10);

beforeAll(async () => {
  world = await createSyntheticOrganisations('taxroutes');
  database = world.organisations[0].database;
  organisationCode = world.organisations[0].code;
  keys = syntheticKeysEnvironment(world);
  await writeSyntheticSetting(database, 'access.sign-in-throttling', { failureLimit: 50, windowSeconds: 600 });
  await writeSyntheticSetting(database, 'access.password-rules', { minimumLength: 12 });
  await writeSyntheticSetting(database, 'access.office-session-limits', {
    idleLockSeconds: 1800,
    absoluteSeconds: 28800,
  });
  approveReason = await writeSyntheticReason(database, 'approve');
  registrationId = await writeSyntheticTaxRegistration(database, syntheticCode('REG-1'));
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock });
  preparer = await enrolled('TAX-PREPARER', [
    { recordType: 'finance.tax_rule', action: 'view' },
    { recordType: 'finance.tax_rule', action: 'create' },
    { recordType: 'finance.tax_rule', action: 'edit' },
  ]);
  approver = await enrolled('TAX-APPROVER', [
    { recordType: 'finance.tax_rule', action: 'view' },
    { recordType: 'finance.tax_rule', action: 'approve' },
  ]);
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('the tax rules routes (shared-calculations 10; DEC-116)', () => {
  it('POL-10.05 a classification prepared, referenced and decided by another Accounts user is read in force', async () => {
    const hsn = syntheticCode('HSN-1');
    const made = await post(preparer, '/api/finance/tax-rules/goods-classification', {
      code: hsn,
      validFrom: today(),
      origin: 'synthetic',
    });
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    const { recordId, versionId, requestId } = made.body as Record<string, string>;
    const evidence = await post(approver, '/api/finance/tax-rules/ca-evidence', {
      versions: [{ kind: 'goods-classification', versionId }],
      evidence: {
        kind: 'reference',
        what: syntheticName('CA approval'),
        givenBy: syntheticName('CA'),
        givenOn: today(),
        keptAt: syntheticName('Accounts file'),
      },
    });
    expect(evidence.status, JSON.stringify(evidence.body)).toBe(200);
    // The preparer may not record it: it takes approve (10.1).
    const own = await post(preparer, '/api/finance/tax-rules/ca-evidence', evidence.body);
    expect(own.status).toBe(403);
    const decided = await post(approver, `/api/access/approval-requests/${String(requestId)}/decision`, {
      versionId,
      outcome: 'approve',
      reason: { kind: 'listed', reasonId: approveReason },
      totpCode: freshCode(approver),
    });
    expect(decided.status, JSON.stringify(decided.body)).toBe(200);

    const record = taxRuleRecordReadSchema.parse(
      (await get(approver, `/api/finance/tax-rules/goods-classification/${String(recordId)}`)).body,
    );
    expect(record.record.versions).toEqual([
      expect.objectContaining({
        id: versionId,
        state: 'In force',
        caEvidence: 1,
        content: { kind: 'goods-classification', retired: false },
      }),
    ]);
    const read = await get(
      approver,
      `/api/finance/tax-rules-in-force?date=${today()}&taxRegistrationId=${registrationId}&classifications=${hsn}`,
    );
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const rules = taxRulesReadSchema.parse(read.body).rules;
    expect(rules.classifications).toEqual([
      {
        code: hsn,
        classification: { kind: 'set', value: { code: hsn, version: versionId }, versionId },
        rateRule: { kind: 'not-set' },
      },
    ]);
    expect(rules.priceBasis).toEqual({ kind: 'not-set' });
  });

  it('shared-calculations 3.3 refuses a level on a bill rounding rule with its code', async () => {
    const refused = await post(preparer, '/api/finance/tax-rules/rounding-rule/versions', {
      kind: 'bill',
      unit: 1,
      mode: 'half-up',
      level: 'line',
      validFrom: today(),
      origin: 'synthetic',
    });
    expect(refused.status).toBe(422);
    expect(refused.body).toMatchObject({ error: { code: 'finance.rounding-level-invalid' } });
  });
});

import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import {
  OPEN_TO_BUY_APPROVAL,
  OPEN_TO_BUY_CHECK,
  openToBuyBudgetListSchema,
  openToBuyBudgetReadSchema,
  type AssignmentScope,
} from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  CommandRunner,
  IdempotencyHelper,
  OrganisationRouter,
  OUTBOX_AUTHORITY,
  OUTBOX_PROCESSOR_IDENTITY,
  restrictedValueCipherNotConfigured,
  secretCheckNotImplemented,
  Worker,
  type JobRegistry,
} from '../src/kernel/index.js';
import { approvalDecided, approvalRequested } from '../src/modules/access/index.js';
// The access module's JobIdentities, as AccessJobIdentitiesModule provides it to the worker (RR-273).
import { jobIdentities } from '../src/modules/access/commands/job-identities.js';
import { INBOX_IDENTITY, inboxConsumers } from '../src/modules/inbox/index.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';
import { syntheticWorkerSettings } from './fixtures/worker-settings.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SyntheticClock,
  syntheticTimezone,
  SYNTHETIC_ORIGIN,
  writeSyntheticReason,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import { grantSynthetic, type SyntheticAuthority } from './support/grants.js';
import { capturingLogger, eventually, writeSyntheticServiceIdentity } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { databaseUrl } from './support/postgres.js';

// S2-F01-T02: the open-to-buy budgets of `booking` through the whole application, on real PostgreSQL (goods-in 3.3,
// 10.1, 10.3, section 11; PRD-BKG-004; POL-05.09, POL-02.07; code-house-rules 12.1, 12.3, 12.4, 12.7): Booking
// prepares a budget for a brand and a season; Accounts records its check from My work; the Owner approves it only
// then; neither step is taken by the preparer; a change is a new version through the same steps with its history
// kept; the remaining amount reads the approved budget less what approved bookings reserve, nothing until S2-F01-T03.
// Every brand, season, person and amount here is SYNTHETIC: no budget is set by this test (V-17, RR-080).

const BUDGET = 'booking.open_to_buy_budget';
/** The approval panel's read (access-and-approvals 9.5). */
const PANEL: SyntheticAuthority = { recordType: 'access.approval_request', action: 'view' };
const CHECK = 'booking.open_to_buy_check';
/** SYNTHETIC amounts in paise. */
const SYNTHETIC_AMOUNT = 1_250_000_00;
const SYNTHETIC_RAISED_AMOUNT = 1_500_000_00;

/** My work is fed by the inbox's consumers, run by a worker with SYNTHETIC settings (DEC-118, DEC-119; CH-10). */
const inboxRegistry: JobRegistry = {
  events: [approvalRequested, approvalDecided],
  consumers: inboxConsumers,
  jobKinds: [],
};
const log = capturingLogger();
let router: OrganisationRouter;
let worker: Worker;
let world: SyntheticWorld;
let database: string;
let organisationCode: string;
let api: AccessTestApp;
let keys: Record<string, string>;
let clock: SyntheticClock;
let approveReason: string;
let rejectReason: string;
const cookies = new Map<string, string>();
/** Sets up the SYNTHETIC brands and season through the catalogue's own routes. */
let merchandiser: SyntheticUser;
let confirmer: SyntheticUser;
/** Booking (P-BKG): prepares budgets, and may approve them too, so a refusal of their own is for their preparation. */
let booking: SyntheticUser;
/** Accounts (P-ACC): checks budgets. */
let accounts: SyntheticUser;
/** The Owner (P-OWN): approves budgets. */
let owner: SyntheticUser;
/** Booking scoped to another brand only (access-and-approvals 5.3). */
let otherBrandBooking: SyntheticUser;
let outsider: SyntheticUser;
let brandId: string;
let otherBrandId: string;
/** A SYNTHETIC brand whose first version starts tomorrow, so it is not in force today. */
let laterBrandId: string;
let seasonAttributeId: string;
let seasonValueIds: string[];

interface Call {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

function freshCode(user: SyntheticUser): string {
  clock.advance(30);
  return codeFor(user.factorSecret ?? Buffer.alloc(0), 0, clock.now());
}

async function enrolled(
  label: string,
  authorities: readonly SyntheticAuthority[],
  scope?: AssignmentScope,
): Promise<SyntheticUser> {
  const user = await writeSyntheticUser(database, organisationCode, keys, {
    label: `${label}${String(randomInt(1_000_000))}`,
    enrolled: true,
  });
  await grantSynthetic(database, { kind: 'user', id: user.id }, authorities, scope === undefined ? {} : { scope });
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.71' },
    body: JSON.stringify({ organisationCode, login: user.login, password: user.password, totpCode: freshCode(user) }),
  });
  expect(response.status).toBe(200);
  cookies.set(user.id, (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '');
  return user;
}

async function post(user: SyntheticUser, path: string, body: unknown, key: string = uuidv7()): Promise<Call> {
  const response = await fetch(`${api.baseUrl}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin: SYNTHETIC_ORIGIN,
      cookie: cookies.get(user.id) ?? '',
      'idempotency-key': key,
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
/** The SYNTHETIC season value of an index, as the setup confirmed it. */
function season(index: number): { attributeId: string; valueId: string } {
  const valueId = seasonValueIds[index];
  if (valueId === undefined) throw new Error(`no season ${String(index)}`);
  return { attributeId: seasonAttributeId, valueId };
}
const code = (part: string) => syntheticCode(`${part}-${String(randomInt(1_000_000))}`);

/** A SYNTHETIC brand, recorded at once through the catalogue's route (structure-and-masters 4.1). */
async function syntheticBrand(label: string, validFrom = today()): Promise<string> {
  const made = await post(merchandiser, '/api/merchandise/brands', {
    code: code(label),
    name: syntheticName(label),
    aliases: [],
    validFrom,
  });
  expect(made.status, JSON.stringify(made.body)).toBe(200);
  return made.body.recordId as string;
}

/** A SYNTHETIC season value: proposed, then confirmed by a different person (structure-and-masters 4.2). */
async function syntheticSeason(label: string): Promise<string> {
  const proposed = await post(merchandiser, '/api/merchandise/vocabulary-proposals', {
    attributeId: seasonAttributeId,
    code: code(label),
    name: syntheticName(label),
  });
  expect(proposed.status, JSON.stringify(proposed.body)).toBe(200);
  const confirmed = await decide(confirmer, proposed.body.requestId as string, proposed.body.proposalId as string);
  expect(confirmed.status, JSON.stringify(confirmed.body)).toBe(200);
  const values = (await get(merchandiser, '/api/merchandise/vocabulary-values')).body.records as {
    id: string;
    attributeId: string;
    code: string;
  }[];
  const value = values.find((each) => each.attributeId === seasonAttributeId && each.code.includes(label));
  if (value === undefined) throw new Error(`season ${label} not confirmed`);
  return value.id;
}

function decide(
  by: SyntheticUser,
  requestId: string,
  versionId: string,
  outcome: 'approve' | 'reject' = 'approve',
): Promise<Call> {
  return post(by, `/api/access/approval-requests/${requestId}/decision`, {
    versionId,
    outcome,
    reason: { kind: 'listed', reasonId: outcome === 'approve' ? approveReason : rejectReason },
    totpCode: freshCode(by),
  });
}

/** The open request on a budget version as My work offers it to the user now, or undefined. */
async function offeredNow(
  user: SyntheticUser,
  versionId: string,
): Promise<{ id: string; actionType: string } | undefined> {
  const work = (await get(user, '/api/inbox/my-work')).body.items as {
    kind: string;
    owner: { recordId: string; versionId: string };
  }[];
  const item = work.find((each) => each.kind === 'approval' && each.owner.versionId === versionId);
  if (item === undefined) return undefined;
  const view = (await get(user, `/api/access/approval-requests/${item.owner.recordId}`)).body;
  return { id: view.id as string, actionType: view.actionType as string };
}

/** The request My work offers the user on a budget version, once the worker has published it (11.1). */
async function offered(user: SyntheticUser, versionId: string): Promise<{ id: string; actionType: string }> {
  let found: { id: string; actionType: string } | undefined;
  await eventually(async () => {
    found = await offeredNow(user, versionId);
    return found !== undefined;
  });
  if (found === undefined) throw new Error('not offered');
  return found;
}

/** Accounts checks a version and the Owner approves it, as My work offers each (3.3; POL-05.09). */
async function checkAndApprove(versionId: string, checkRequestId: string): Promise<void> {
  const checked = await decide(accounts, checkRequestId, versionId);
  expect(checked.status, JSON.stringify(checked.body)).toBe(200);
  const approval = await offered(owner, versionId);
  const approved = await decide(owner, approval.id, versionId);
  expect(approved.status, JSON.stringify(approved.body)).toBe(200);
}

async function readBudget(user: SyntheticUser, budgetId: string) {
  const read = await get(user, `/api/booking/open-to-buy-budgets/${budgetId}`);
  expect(read.status, JSON.stringify(read.body)).toBe(200);
  return openToBuyBudgetReadSchema.parse(read.body).budget;
}

/** What preparing answered: the budget, the version and the request of its check. */
function preparedIds(call: Call): { budgetId: string; versionId: string; requestId: string } {
  expect(call.status, JSON.stringify(call.body)).toBe(200);
  return call.body as { budgetId: string; versionId: string; requestId: string };
}

function prepare(user: SyntheticUser, body: Record<string, unknown>, key?: string): Promise<Call> {
  return post(user, '/api/booking/open-to-buy-budgets', { origin: 'synthetic', ...body }, key);
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('opentobuy');
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
  rejectReason = await writeSyntheticReason(database, 'reject');
  await writeSyntheticServiceIdentity(database, OUTBOX_PROCESSOR_IDENTITY, [OUTBOX_AUTHORITY]);
  await writeSyntheticServiceIdentity(database, INBOX_IDENTITY, [{ action: 'edit', recordType: 'inbox.work_item' }]);
  clock = new SyntheticClock();
  api = await startAccessApp(world, keys, { clock });
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: 4 },
    log.logger,
  );
  const runner = new CommandRunner({
    clock: { now: () => new Date() },
    timezones: syntheticTimezone,
    logger: log.logger,
  });
  worker = new Worker({
    router,
    runner,
    helper: new IdempotencyHelper({
      runner,
      logger: log.logger,
      secretCheck: secretCheckNotImplemented,
      cipher: restrictedValueCipherNotConfigured,
    }),
    identities: jobIdentities(),
    logger: log.logger,
    registry: inboxRegistry,
    settings: syntheticWorkerSettings(inboxRegistry, { fast: true }),
  });
  // A consumer receives only events recorded after it is first registered, so the worker starts first.
  await worker.start();
  merchandiser = await enrolled('OTB-MERCHANDISER', [
    { recordType: 'merchandise.brand', action: 'view' },
    { recordType: 'merchandise.brand', action: 'create' },
    { recordType: 'merchandise.brand', action: 'edit' },
    { recordType: 'merchandise.attribute', action: 'view' },
    { recordType: 'merchandise.attribute', action: 'create' },
    { recordType: 'merchandise.vocabulary_value', action: 'view' },
    { recordType: 'merchandise.vocabulary_proposal', action: 'view' },
    { recordType: 'merchandise.vocabulary_proposal', action: 'create' },
  ]);
  confirmer = await enrolled('OTB-CONFIRMER', [
    { recordType: 'merchandise.vocabulary_proposal', action: 'view' },
    { recordType: 'merchandise.vocabulary_proposal', action: 'approve' },
  ]);
  const attribute = await post(merchandiser, '/api/merchandise/attributes', {
    code: code('SEASON'),
    valueKind: 'list',
    name: syntheticName('Season'),
    validFrom: today(),
  });
  expect(attribute.status, JSON.stringify(attribute.body)).toBe(200);
  seasonAttributeId = attribute.body.recordId as string;
  brandId = await syntheticBrand('OTB-BRAND');
  otherBrandId = await syntheticBrand('OTB-OTHER');
  laterBrandId = await syntheticBrand(
    'OTB-LATER',
    new Date(clock.now().getTime() + 86_400_000).toISOString().slice(0, 10),
  );
  seasonValueIds = [];
  for (const label of ['SS1', 'AW1', 'SS2', 'AW2', 'SS3']) seasonValueIds.push(await syntheticSeason(label));
  booking = await enrolled('OTB-BOOKING', [
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'create' },
    { recordType: BUDGET, action: 'edit' },
    { recordType: BUDGET, action: 'approve' },
    { recordType: CHECK, action: 'approve' },
    PANEL,
  ]);
  accounts = await enrolled('OTB-ACCOUNTS', [
    { recordType: BUDGET, action: 'view' },
    { recordType: CHECK, action: 'view' },
    { recordType: CHECK, action: 'approve' },
    PANEL,
  ]);
  owner = await enrolled('OTB-OWNER', [
    { recordType: BUDGET, action: 'view' },
    { recordType: BUDGET, action: 'approve' },
    PANEL,
  ]);
  otherBrandBooking = await enrolled(
    'OTB-OTHER-BOOKING',
    [
      { recordType: BUDGET, action: 'view' },
      { recordType: BUDGET, action: 'create' },
    ],
    {
      kind: 'dimensions',
      legalEntity: { kind: 'all' },
      place: { kind: 'all' },
      brand: { kind: 'selected', members: [otherBrandId] },
    },
  );
  outsider = await enrolled('OTB-OUTSIDER', [{ recordType: 'merchandise.brand', action: 'view' }]);
});

afterAll(async () => {
  await (worker as Worker | undefined)?.stop();
  await (router as OrganisationRouter | undefined)?.close();
  await (api as AccessTestApp | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('preparing a budget (goods-in 3.3; PRD-BKG-004)', () => {
  it('PRD-BKG-004 POL-05.09 a budget prepared by Booking waits for Accounts’ check and is not usable', async () => {
    const made = await prepare(booking, {
      brandId,
      season: season(0),
      amount: SYNTHETIC_AMOUNT,
    });
    const { budgetId, versionId, requestId } = preparedIds(made);
    const budget = await readBudget(booking, budgetId);
    expect(budget).toMatchObject({
      id: budgetId,
      brand: { id: brandId },
      season: season(0),
      versionToken: versionId,
      remaining: { kind: 'not-approved' },
      versions: [
        {
          id: versionId,
          amount: SYNTHETIC_AMOUNT,
          origin: 'synthetic',
          state: 'Awaiting approval',
          awaiting: 'check',
          preparedBy: booking.id,
          request: { id: requestId, state: 'Awaiting approval' },
        },
      ],
    });
    // The check is offered to Accounts in My work; nothing is offered to the Owner yet (POL-05.09).
    expect(await offered(accounts, versionId)).toEqual({ id: requestId, actionType: OPEN_TO_BUY_CHECK });
    expect(await offeredNow(owner, versionId)).toBeUndefined();
    expect(OPEN_TO_BUY_APPROVAL).toBe('booking.open_to_buy_budget.change');
    const list = openToBuyBudgetListSchema.parse((await get(owner, '/api/booking/open-to-buy-budgets')).body);
    expect(list.budgets.map((each) => each.id)).toContain(budgetId);
  });
});

describe('the check and the approval (goods-in 3.3; POL-05.09, POL-02.07)', () => {
  it('POL-05.09 POL-02.07 Accounts checks and the Owner approves, each other than the preparer; only then is the budget used', async () => {
    const { budgetId, versionId, requestId } = preparedIds(
      await prepare(booking, { brandId, season: season(1), amount: SYNTHETIC_AMOUNT }),
    );
    // The preparer may not check their own version, though they hold the check (PRD-ACS-006).
    const ownCheck = await decide(booking, requestId, versionId);
    expect(ownCheck.body).toMatchObject({ error: { code: 'access.self-preparation' } });
    // Nobody may approve before the check: no approval is requested yet, so the Owner has nothing to decide.
    expect(await offeredNow(owner, versionId)).toBeUndefined();
    expect((await readBudget(owner, budgetId)).remaining).toEqual({ kind: 'not-approved' });

    const checked = await decide(accounts, requestId, versionId);
    expect(checked.status, JSON.stringify(checked.body)).toBe(200);
    const afterCheck = await readBudget(booking, budgetId);
    expect(afterCheck.versions).toEqual([
      expect.objectContaining({
        id: versionId,
        state: 'Awaiting approval',
        awaiting: 'approval',
        check: { checkedBy: accounts.id, checkedAt: expect.any(String) as string },
      }),
    ]);
    expect(afterCheck.remaining).toEqual({ kind: 'not-approved' });
    const approval = await offered(owner, versionId);
    expect(approval.actionType).toBe(OPEN_TO_BUY_APPROVAL);
    expect(afterCheck.versions[0]?.request).toEqual({ id: approval.id, state: 'Awaiting approval' });
    // Accounts' check gives Accounts no approval: it holds no approve on the budget.
    expect((await decide(accounts, approval.id, versionId)).body).toMatchObject({
      error: { code: 'access.not-eligible' },
    });
    // The preparer may not approve their own version either, though they hold the approval (POL-02.07).
    expect((await decide(booking, approval.id, versionId)).body).toMatchObject({
      error: { code: 'access.self-preparation' },
    });

    const approved = await decide(owner, approval.id, versionId);
    expect(approved.status, JSON.stringify(approved.body)).toBe(200);
    const inForce = await readBudget(booking, budgetId);
    expect(inForce.versions).toEqual([
      expect.objectContaining({ id: versionId, state: 'In force', inForceFrom: expect.any(String) as string }),
    ]);
    expect(inForce.versions[0]).not.toHaveProperty('awaiting');
    // Nothing is reserved until bookings are approved against it (S2-F01-T03).
    expect(inForce.remaining).toEqual({
      kind: 'approved',
      versionId,
      approved: SYNTHETIC_AMOUNT,
      reserved: 0,
      remaining: SYNTHETIC_AMOUNT,
    });
  });

  it('POL-05.09 a check Accounts rejects, and an approval the Owner rejects, return the version to Booking unused', async () => {
    const first = preparedIds(await prepare(booking, { brandId, season: season(2), amount: SYNTHETIC_AMOUNT }));
    const returned = await decide(accounts, first.requestId, first.versionId, 'reject');
    expect(returned.status, JSON.stringify(returned.body)).toBe(200);
    expect((await readBudget(booking, first.budgetId)).versions).toEqual([
      expect.objectContaining({
        id: first.versionId,
        state: 'Rejected',
        request: { id: first.requestId, state: 'Rejected' },
      }),
    ]);
    // A decided version takes no later decision (PRD-ACS-007).
    expect((await decide(accounts, first.requestId, first.versionId)).body).toMatchObject({
      error: { code: 'access.approval-not-open' },
    });
    const budget = await readBudget(booking, first.budgetId);
    const second = preparedIds(
      await post(booking, `/api/booking/open-to-buy-budgets/${first.budgetId}/versions`, {
        amount: SYNTHETIC_RAISED_AMOUNT,
        origin: 'synthetic',
        versionToken: budget.versionToken,
      }),
    );
    expect((await decide(accounts, second.requestId, second.versionId)).status).toBe(200);
    const approval = await offered(owner, second.versionId);
    expect((await decide(owner, approval.id, second.versionId, 'reject')).status).toBe(200);
    const after = await readBudget(booking, first.budgetId);
    expect(after.versions.map((each) => each.state)).toEqual(['Rejected', 'Rejected']);
    expect(after.remaining).toEqual({ kind: 'not-approved' });
  });
});

describe('a budget’s versions (goods-in 3.3; code-house-rules 7.3, 12.7)', () => {
  it('PRD-MOD-010 a change is a new version through the same steps; the one in force stays until it is approved, and history is kept', async () => {
    const first = preparedIds(await prepare(booking, { brandId, season: season(3), amount: SYNTHETIC_AMOUNT }));
    await checkAndApprove(first.versionId, first.requestId);
    const change = (versionToken: string, amount: number) =>
      post(booking, `/api/booking/open-to-buy-budgets/${first.budgetId}/versions`, {
        amount,
        origin: 'synthetic',
        versionToken,
      });
    const second = preparedIds(await change(first.versionId, SYNTHETIC_RAISED_AMOUNT));
    // The newest version's token is asked: a change on a stale one is refused (12.7).
    const stale = await change(first.versionId, SYNTHETIC_RAISED_AMOUNT);
    expect(stale.status).toBe(409);
    expect(stale.body).toMatchObject({ error: { code: 'kernel.stale-version' } });
    // Until the new version is approved, the one in force is used.
    const waiting = await readBudget(owner, first.budgetId);
    expect(waiting.remaining).toMatchObject({
      kind: 'approved',
      versionId: first.versionId,
      approved: SYNTHETIC_AMOUNT,
    });
    expect(waiting.versions.map((each) => [each.id, each.state, each.awaiting])).toEqual([
      [first.versionId, 'In force', undefined],
      [second.versionId, 'Awaiting approval', 'check'],
    ]);
    // A newer version replaces one still waiting: its request is Superseded and can no longer be decided (9.6).
    const third = preparedIds(await change(second.versionId, SYNTHETIC_RAISED_AMOUNT + 100));
    expect((await decide(accounts, second.requestId, second.versionId)).body).toMatchObject({
      error: { code: 'access.approval-superseded' },
    });
    await checkAndApprove(third.versionId, third.requestId);
    const after = await readBudget(booking, first.budgetId);
    expect(after.versions.map((each) => [each.id, each.state])).toEqual([
      [first.versionId, 'Ended'],
      [second.versionId, 'Superseded'],
      [third.versionId, 'In force'],
    ]);
    const [ended, , current] = after.versions;
    expect(ended?.inForceUntil).toBe(current?.inForceFrom);
    expect(after.remaining).toEqual({
      kind: 'approved',
      versionId: third.versionId,
      approved: SYNTHETIC_RAISED_AMOUNT + 100,
      reserved: 0,
      remaining: SYNTHETIC_RAISED_AMOUNT + 100,
    });
    // A version superseded while it waited at the approval step is Superseded too, whichever step it waited at.
    const fourth = preparedIds(await change(third.versionId, SYNTHETIC_AMOUNT));
    expect((await decide(accounts, fourth.requestId, fourth.versionId)).status).toBe(200);
    const fourthApproval = await offered(owner, fourth.versionId);
    const fifth = preparedIds(await change(fourth.versionId, SYNTHETIC_AMOUNT + 1));
    expect((await decide(owner, fourthApproval.id, fourth.versionId)).body).toMatchObject({
      error: { code: 'access.approval-superseded' },
    });
    const last = await readBudget(booking, first.budgetId);
    expect(last.versions.map((each) => each.state)).toEqual([
      'Ended',
      'Superseded',
      'In force',
      'Superseded',
      'Awaiting approval',
    ]);
    expect(last.versionToken).toBe(fifth.versionId);
  });
});

describe('what preparing refuses, naming why (goods-in 3.3; PRD-UXP-003)', () => {
  it('PRD-UXP-003 refuses a second budget for a brand and season, a brand not in force and a season off its vocabulary', async () => {
    const made = preparedIds(
      await prepare(booking, { brandId: otherBrandId, season: season(4), amount: SYNTHETIC_AMOUNT }),
    );
    const again = await prepare(booking, { brandId: otherBrandId, season: season(4), amount: SYNTHETIC_AMOUNT });
    expect(again.status).toBe(422);
    expect(again.body).toMatchObject({
      error: {
        code: 'booking.budget-exists',
        missing: [{ kind: 'record', recordType: BUDGET, recordId: made.budgetId }],
      },
    });
    // A brand whose first version starts tomorrow is not in force today (structure-and-masters 2.2).
    const notInForce = await prepare(booking, { brandId: laterBrandId, season: season(4), amount: SYNTHETIC_AMOUNT });
    expect(notInForce.body).toMatchObject({
      error: {
        code: 'booking.brand-not-in-force',
        missing: [{ kind: 'record', recordType: 'merchandise.brand', recordId: laterBrandId }],
      },
    });
    const offVocabulary = await prepare(booking, {
      brandId,
      season: { attributeId: seasonAttributeId, valueId: uuidv7() },
      amount: SYNTHETIC_AMOUNT,
    });
    expect(offVocabulary.body).toMatchObject({ error: { code: 'booking.season-not-in-vocabulary' } });
    // An amount below zero is no amount (PRD-MOD-014).
    const negative = await prepare(booking, { brandId, season: season(4), amount: -1 });
    expect(negative.status).toBe(400);
  });

  it('PRD-ACS-001 PRD-UXP-003 refuses a person outside the brand’s scope, or holding no permission, naming what is missing', async () => {
    const outside = await prepare(otherBrandBooking, { brandId, season: season(4), amount: SYNTHETIC_AMOUNT });
    expect(outside.status).toBe(403);
    expect(outside.body).toMatchObject({ error: { code: 'access.not-authorised' } });
    const none = await prepare(outsider, { brandId, season: season(4), amount: SYNTHETIC_AMOUNT });
    expect(none.status).toBe(403);
    expect(none.body).toMatchObject({
      error: {
        code: 'access.not-authorised',
        missing: [expect.objectContaining({ action: 'create', recordType: BUDGET })],
      },
    });
    // The list shows only the budgets the reader's scope covers; a budget outside it is not read.
    const listed = openToBuyBudgetListSchema.parse(
      (await get(otherBrandBooking, '/api/booking/open-to-buy-budgets')).body,
    );
    expect(listed.budgets.every((each) => each.brand.id === otherBrandId)).toBe(true);
    const own = preparedIds(await prepare(booking, { brandId, season: season(4), amount: SYNTHETIC_AMOUNT }));
    expect((await get(otherBrandBooking, `/api/booking/open-to-buy-budgets/${own.budgetId}`)).status).toBe(403);
    expect((await get(outsider, '/api/booking/open-to-buy-budgets')).status).toBe(403);
    expect((await get(booking, `/api/booking/open-to-buy-budgets/${uuidv7()}`)).status).toBe(404);
  });

  it('code-house-rules 12.14 refuses a value of an origin this environment does not accept, and replays a key once', async () => {
    const testSetup = await post(booking, '/api/booking/open-to-buy-budgets', {
      brandId: otherBrandId,
      season: season(3),
      amount: SYNTHETIC_AMOUNT,
      origin: 'test-setup',
    });
    expect(testSetup.body).toMatchObject({ error: { code: 'configuration.origin-not-allowed' } });
    const key = uuidv7();
    const body = { brandId: otherBrandId, season: season(3), amount: SYNTHETIC_AMOUNT };
    const made = await prepare(booking, body, key);
    expect(made.status, JSON.stringify(made.body)).toBe(200);
    // The same key and content answers the same, recording nothing more (PRD-INT-002; 12.4).
    expect((await prepare(booking, body, key)).body).toEqual(made.body);
    expect((await readBudget(booking, made.body.budgetId as string)).versions).toHaveLength(1);
  });
});

describe('the budgets as policy 5’s values (goods-in 10.5; module-map 4.4; DM-6)', () => {
  it('POL-05.09 every approved budget is reported to the policy gate under policy 5, with who entered it', async () => {
    const reader = await enrolled('OTB-READINESS', [{ recordType: 'configuration.policy_status', action: 'view' }]);
    const made = preparedIds(
      await prepare(booking, { brandId: otherBrandId, season: season(1), amount: SYNTHETIC_AMOUNT }),
    );
    const valuesOf = async (user: SyntheticUser) => {
      const read = await get(user, '/api/access/policy-readiness');
      expect(read.status, JSON.stringify(read.body)).toBe(200);
      const policies = read.body.policies as {
        policy: number;
        values: { check: string; key: string; enteredByYou: boolean }[];
      }[];
      return (policies.find((each) => each.policy === 5)?.values ?? []).filter(
        (each) => each.check === 'booking.open-to-buy-budgets',
      );
    };
    // A budget waiting for its check is no value yet.
    expect((await valuesOf(reader)).map((each) => each.key)).not.toContain(made.budgetId);
    await checkAndApprove(made.versionId, made.requestId);
    expect(await valuesOf(reader)).toContainEqual({
      check: 'booking.open-to-buy-budgets',
      key: made.budgetId,
      origin: 'synthetic',
      enteredByYou: false,
    });
  });
});

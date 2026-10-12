import { billFormatReadSchema, financialYearListSchema } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LOCK_STEP } from '../src/kernel/index.js';
import type { SyntheticUser } from './support/access.js';
import { BILL_FORMAT, DevicesWorld, errorOf, type Call } from './support/billing-devices.js';
import { APPROVE, formatCode, NumberingChanges, PREPARE } from './support/numbering-changes.js';
import { backendPid, gate, waitUntilAnyWaitingForLock } from './support/transactions.js';

// S1-F12-T03 review fixes: two approvals at once of the financial years or the bill-number format, in an Organisation
// with no billing device, so only `numbering`'s settings row serialises them (code-house-rules 8.1, 8.2, 10.3); and the
// preparer withdrawing their own pending change, anyone else needing cancel (offline-counter 4.3b; access-and-approvals
// 9.1a; RR-489; product owner, 12 Oct 2026). Through the whole application on real PostgreSQL, each concurrent decision
// on its own connection. Every year, format, person and reason here is SYNTHETIC.

const w = new DevicesWorld('posnumchanges');
const changes = new NumberingChanges(w);

let preparer: SyntheticUser;
let approver: SyntheticUser;
let secondApprover: SyntheticUser;
let canceller: SyntheticUser;
let otherPreparer: SyntheticUser;

beforeAll(async () => {
  await w.start();
  await changes.start();
  preparer = (await w.enrolled('NUMBERING-PREPARER', [...PREPARE])).user;
  otherPreparer = (await w.enrolled('NUMBERING-OTHER', [...PREPARE])).user;
  approver = (await w.enrolled('NUMBERING-APPROVER', [...APPROVE])).user;
  // A second approver, so two decisions at once never wait on one person's authenticator code.
  secondApprover = (await w.enrolled('NUMBERING-APPROVER-2', [...APPROVE])).user;
  canceller = (
    await w.enrolled('NUMBERING-CANCELLER', [
      { recordType: 'pos.financial_year_change', action: 'view' },
      { recordType: 'pos.financial_year_change', action: 'cancel' },
      { recordType: 'pos.bill_format_change', action: 'view' },
      { recordType: 'pos.bill_format_change', action: 'cancel' },
    ])
  ).user;
});
afterAll(() => w.close());

/**
 * Holds `numbering`'s settings row in a change of its own, starts both decisions, waits until PostgreSQL shows each
 * waiting for a lock, then lets them go: the order comes from PostgreSQL, never from a sleep (code-house-rules 10.3).
 */
async function decidedTogether(first: () => Promise<Call>, second: () => Promise<Call>): Promise<Call[]> {
  const held = gate();
  const release = gate();
  let pid = 0;
  const holding = w.inChange(async (context) => {
    await context.lock(LOCK_STEP.document, await w.numbering.settingsLockTargets(context));
    pid = await backendPid(context);
    held.open();
    await release.wait;
  });
  await held.wait;
  const one = first();
  const waitingOne = await waitUntilAnyWaitingForLock(w.database, [pid]);
  const two = second();
  await waitUntilAnyWaitingForLock(w.database, [pid, waitingOne]);
  release.open();
  await holding;
  return Promise.all([one, two]);
}

describe('two approvals at once serialise on the numbering settings row (code-house-rules 8.1, 8.2)', () => {
  it('code-house-rules 8.1 PRD-MOD-010 of two overlapping years approved at once with no billing device, one is defined and the other refused with its reason', async () => {
    const devices = await w.query<{ id: string }>('select id from pos.billing_device');
    expect(devices).toEqual([]);
    const a = await changes.preparedYear(preparer, 10, 400);
    const b = await changes.preparedYear(preparer, 200, 600);
    const answers = await decidedTogether(
      () => changes.decide(a, approver),
      () => changes.decide(b, secondApprover),
    );
    expect(answers.map((each) => each.status).sort()).toEqual([200, 422]);
    const refused = answers.find((each) => each.status === 422);
    expect(refused === undefined ? undefined : errorOf(refused).code).toBe('numbering.financial-year-overlaps');
    const list = financialYearListSchema.parse(
      (await w.get(w.cookies.get(preparer.id) ?? '', '/api/pos/financial-years')).body,
    );
    expect(list.years.map((each) => each.label).filter((label) => label === a.label || label === b.label)).toHaveLength(
      1,
    );
  });

  it('code-house-rules 8.1 numbering-and-audit 3.5 two bill formats of one code approved at once each become its next version, neither failing', async () => {
    const code = formatCode();
    const first = await changes.prepareFormat(preparer, { formatCode: code, parts: BILL_FORMAT, origin: 'synthetic' });
    expect((await changes.decide(first, approver)).status).toBe(200);
    const parts = (text: string) => [{ kind: 'text', text }, { kind: 'scope' }, { kind: 'sequence', width: 5 }];
    const b = await changes.prepareFormat(preparer, { formatCode: code, parts: parts('SYNB-'), origin: 'synthetic' });
    const c = await changes.prepareFormat(preparer, { formatCode: code, parts: parts('SYNC-'), origin: 'synthetic' });
    expect([b.status, c.status]).toEqual([200, 200]);
    const answers = await decidedTogether(
      () => changes.decide(b, approver),
      () => changes.decide(c, secondApprover),
    );
    expect(answers.map((each) => each.status)).toEqual([200, 200]);
    const versions = await w.query<{ version: number }>(
      `select v.version from numbering.number_format_version v
         join numbering.number_format f on f.id = v.number_format_id
        where f.code = $1 order by v.version`,
      [code],
    );
    expect(versions.map((each) => each.version)).toEqual([1, 2, 3]);
  });
});

describe('the preparer withdraws their own pending change (access-and-approvals 9.1a; RR-489; product owner, 12 Oct 2026)', () => {
  const yearsRead = async () =>
    financialYearListSchema.parse((await w.get(w.cookies.get(preparer.id) ?? '', '/api/pos/financial-years')).body);

  it('PRD-ACS-006 the preparer withdraws their own pending financial-year change without cancel; it can no longer be decided and defines nothing', async () => {
    const prepared = await changes.preparedYear(preparer, 1000, 1100);
    const withdrawn = await changes.withdraw('financial-year', prepared.body.changeId, preparer);
    expect(withdrawn.status).toBe(200);
    expect(withdrawn.body).toEqual({ changeId: prepared.body.changeId });
    const read = await yearsRead();
    expect(read.changes.find((each) => each.changeId === prepared.body.changeId)?.state).toBe('Withdrawn');
    expect(errorOf(await changes.decide(prepared, approver)).code).toBe('access.approval-not-open');
    expect((await yearsRead()).years.map((each) => each.label)).not.toContain(prepared.label);
    // Withdrawn already: a second withdrawal is refused with its reason.
    expect(errorOf(await changes.withdraw('financial-year', prepared.body.changeId, preparer)).code).toBe(
      'pos.change-not-awaiting',
    );
    const [record] = await w.query<{ actor_id: string }>(
      `select actor_id from audit.audit_record where record_id = $1 and operation = 'withdraw-financial-year-change'`,
      [prepared.body.changeId],
    );
    expect(record?.actor_id).toBe(preparer.id);
  });

  it('POL-02.03 anyone else needs cancel through a role assignment: another preparer is refused, a person holding cancel withdraws a bill-format change', async () => {
    const prepared = await changes.prepareFormat(preparer, {
      formatCode: formatCode(),
      parts: BILL_FORMAT,
      origin: 'synthetic',
    });
    expect(prepared.status).toBe(200);
    const refused = await changes.withdraw('bill-format', prepared.body.changeId, otherPreparer);
    expect(refused.status).toBe(403);
    expect(errorOf(refused).code).toBe('access.not-authorised');
    expect((await changes.withdraw('bill-format', prepared.body.changeId, canceller)).status).toBe(200);
    const read = billFormatReadSchema.parse(
      (await w.get(w.cookies.get(preparer.id) ?? '', '/api/pos/bill-format')).body,
    );
    expect(read.changes.find((each) => each.changeId === prepared.body.changeId)?.state).toBe('Withdrawn');
  });

  it('PRD-UXP-003 a decided change is not withdrawn, and a change that does not exist is not found', async () => {
    const prepared = await changes.preparedYear(preparer, 1200, 1300);
    expect((await changes.decide(prepared, approver, 'reject')).status).toBe(200);
    expect(errorOf(await changes.withdraw('financial-year', prepared.body.changeId, preparer)).code).toBe(
      'pos.change-not-awaiting',
    );
    const missing = await changes.withdraw('financial-year', '0199c0de-0000-7000-8000-000000000000', canceller);
    expect(missing.status).toBe(404);
    expect(errorOf(missing).code).toBe('pos.change-not-found');
  });
});

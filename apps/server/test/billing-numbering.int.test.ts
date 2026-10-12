import { randomInt } from 'node:crypto';
import { billFormatReadSchema, deviceEnrolledSchema, financialYearListSchema } from '@apparel-os/schemas';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { unitDevicesCheck } from '../src/modules/pos/index.js';
import { syntheticCode } from './fixtures/synthetic.js';
import type { SyntheticUser } from './support/access.js';
import { BILL_FORMAT, DevicesWorld, done, errorOf, NO_DEVICE_FORMAT, type Call } from './support/billing-devices.js';
import { APPROVE, formatCode, NumberingChanges, PREPARE, yearLabel } from './support/numbering-changes.js';
import { backendPid, gate, waitUntilAnyWaitingForLock } from './support/transactions.js';

// S1-F12-T03: the financial years and the bill-number format, each prepared by one person and taking effect only when
// a different authorised person approves it, through the whole application on real PostgreSQL (offline-counter 4.1,
// 4.3b; numbering-and-audit 3.3, 3.5; access-and-approvals 9.8b; PRD-ACS-006, PRD-POS-020, PRD-OFF-002, POL-02.03,
// POL-10.07; DEC-116, DEC-117). The approving decision gives every Active device its missing series in its own
// transaction. The dates and the format are OPEN (GC5-1, RR-060; V-40, RR-101): every year, format, person and reason
// here is SYNTHETIC.

const w = new DevicesWorld('posnumbering');
const changes = new NumberingChanges(w);

let preparer: SyntheticUser;
let approver: SyntheticUser;

beforeAll(async () => {
  await w.start();
  await changes.start();
  // The preparer holds approve too, so only independence keeps them from deciding their own change (PRD-ACS-006).
  preparer = (
    await w.enrolled('NUMBERING-PREPARER', [
      ...PREPARE,
      { recordType: 'pos.financial_year_change', action: 'approve' },
      { recordType: 'pos.bill_format_change', action: 'approve' },
    ])
  ).user;
  approver = (await w.enrolled('NUMBERING-APPROVER', [...APPROVE])).user;
});
afterAll(() => w.close());

const label = yearLabel;
const prepareYear = (body: Record<string, unknown>, by: SyntheticUser = preparer): Promise<Call> =>
  changes.prepareYear(by, body);
const prepareFormat = (body: Record<string, unknown>, by: SyntheticUser = preparer): Promise<Call> =>
  changes.prepareFormat(by, body);
/** A SYNTHETIC year from `first` to `last` days from today, prepared by the preparer. */
const preparedYear = (first: number, last: number) => changes.preparedYear(preparer, first, last);
const decide = (prepared: Call, outcome: 'approve' | 'reject' = 'approve', by: SyntheticUser = approver) =>
  changes.decide(prepared, by, outcome);

async function seriesOf(deviceId: string) {
  return (await w.listed(w.admin)).find((each) => each.deviceId === deviceId)?.series ?? [];
}

const yearsOf = (series: { financialYear: string; taxRegistrationId: string }[]) =>
  series.map((each) => `${each.financialYear}|${each.taxRegistrationId}`).sort();

/** The first SYNTHETIC year, from 30 days ago, and the one after it; defined by the first test. */
let firstYear: string;
let nextYear: string;

describe('the approving change gives every Active device its missing series (offline-counter 4.1; DEC-117)', () => {
  it('PRD-ACS-006 DEC-116 DEC-117 a device enrolled before the year and the format gets its series when the last approval commits; the preparer cannot approve their own', async () => {
    const early = await w.registered([w.stores.wholeStore, w.stores.counterOtherRegistration]);
    const enrolled = deviceEnrolledSchema.parse((await w.enrol(early.deviceId, await w.newKey())).body);
    expect(enrolled.series).toEqual([]);

    // The year this date falls in, and the one after it, each approved by a different person. With no format, the
    // device gets no series and the devices check still names the format (offline-counter section 11; test 8).
    const first = await preparedYear(-30, 300);
    firstYear = first.label;
    expect((await decide(first)).status).toBe(200);
    const next = await preparedYear(301, 665);
    nextYear = next.label;
    expect((await decide(next)).status).toBe(200);
    expect(await seriesOf(early.deviceId)).toEqual([]);
    expect(await w.inChange((context) => unitDevicesCheck(context, w.stores.wholeStore, w.today()))).toEqual([
      { kind: 'device-series', deviceId: early.deviceId, code: early.code, lacks: 'bill-format' },
    ]);

    const format = await prepareFormat({ formatCode: formatCode(), parts: BILL_FORMAT, origin: 'synthetic' });
    expect(format.status).toBe(200);
    // The preparer, even holding approve, never decides their own change (PRD-ACS-006); nothing takes effect.
    expect(errorOf(await decide(format, 'approve', preparer)).code).toBe('access.self-preparation');
    expect(await seriesOf(early.deviceId)).toEqual([]);

    // A different person approves it: the device gets its series for this year and the next one defined already, one
    // per registration, Open (offline-counter 4.3: each year's series is defined before the year starts).
    expect((await decide(format)).status).toBe(200);
    const series = await seriesOf(early.deviceId);
    expect(yearsOf(series)).toEqual(
      [
        `${firstYear}|${w.stores.registrationIds[0]}`,
        `${firstYear}|${w.stores.registrationIds[1]}`,
        `${nextYear}|${w.stores.registrationIds[0]}`,
        `${nextYear}|${w.stores.registrationIds[1]}`,
      ].sort(),
    );
    expect(series.every((each) => each.state === 'Open')).toBe(true);
    expect(await w.inChange((context) => unitDevicesCheck(context, w.stores.wholeStore, w.today()))).toEqual([]);
    // The approval's audit record names the setting and the series it defined (PRD-ACS-013).
    const [record] = await w.query<{ changes: { field: string; after: unknown }[] }>(
      `select changes from audit.audit_record where record_id = $1 and operation = 'approve-bill-format-change'`,
      [format.body.changeId],
    );
    expect(record?.changes.find((each) => each.field === 'seriesIds')?.after).toEqual(
      expect.arrayContaining(series.map((each) => each.seriesId)),
    );
  });

  it('DEC-117 PRD-MOD-010 a later format defines only what is missing and leaves every existing series as it is, its numbers in their first style', async () => {
    // Enrolled now, the device gets this year's series only; the next year's is missing.
    const device = await w.activeDevice([w.stores.wholeStore]);
    const before = await seriesOf(device.deviceId);
    expect(before.map((each) => each.financialYear)).toEqual([firstYear]);
    const laterCode = formatCode();
    const later = await prepareFormat({
      formatCode: laterCode,
      parts: [
        { kind: 'text', text: 'SYN2-' },
        { kind: 'scope' },
        { kind: 'text', text: '-' },
        { kind: 'sequence', width: 6 },
      ],
      origin: 'synthetic',
    });
    expect((await decide(later)).status).toBe(200);
    // The existing series is untouched; only the next year's, missing, is defined (DEC-117).
    const after = await seriesOf(device.deviceId);
    expect(after).toEqual(expect.arrayContaining(before));
    const added = after.filter((each) => !before.some((kept) => kept.seriesId === each.seriesId));
    expect(added.map((each) => [each.financialYear, each.state])).toEqual([[nextYear, 'Open']]);
    const [record] = await w.query<{ changes: { field: string; after: unknown }[] }>(
      `select changes from audit.audit_record where record_id = $1 and operation = 'approve-bill-format-change'`,
      [later.body.changeId],
    );
    expect(record?.changes.find((each) => each.field === 'seriesIds')?.after).toEqual(
      added.map((each) => each.seriesId),
    );
    // A series keeps the format it was defined with (numbering-and-audit 3.5): this year's next number is in the first
    // style, the new series' in the new one.
    const current = before[0]?.seriesId ?? '';
    expect(done(await w.allocateFrom(current)).formattedText.startsWith('SYN/')).toBe(true);
    expect(done(await w.allocateFrom(added[0]?.seriesId ?? '')).formattedText.startsWith('SYN2-')).toBe(true);
    // The new format is in force, with its parts and origin, for series defined from now on.
    const read = billFormatReadSchema.parse(
      (await w.get(w.cookies.get(preparer.id) ?? '', '/api/pos/bill-format')).body,
    );
    expect(read.format).toEqual({
      kind: 'set',
      formatCode: laterCode,
      parts: [
        { kind: 'text', text: 'SYN2-' },
        { kind: 'scope' },
        { kind: 'text', text: '-' },
        { kind: 'sequence', width: 6 },
      ],
      origin: 'synthetic',
    });
    expect(read.changes.find((each) => each.changeId === later.body.changeId)?.state).toBe('Approved');
    // The decision is final: deciding it again is refused, and defines nothing (PRD-ACS-007).
    expect((await decide(later)).status).not.toBe(200);
    expect(await seriesOf(device.deviceId)).toEqual(after);
  });

  it('code-house-rules 8.2 PRD-LIF-015 DEC-117 the approval waits for a revocation in progress, and the device it ends gets no series', async () => {
    const revoked = await w.activeDevice([w.stores.wholeStore]);
    const kept = await w.activeDevice([w.stores.wholeStore]);
    const later = await preparedYear(666, 1030);
    // The revocation holds the device rows until the test lets it go (offline-counter 3.7 "Locks").
    const held = gate();
    const release = gate();
    let pid = 0;
    const revoking = w.inChange(async (context) => {
      const facts = await w.pos.deviceFacts(context, revoked.deviceId, w.setup.today());
      if (facts === undefined) throw new Error('No such device');
      const ended = await w.pos.endBillingDevice(
        context,
        { userId: w.admin.id, roleAssignmentId: w.adminAssignmentId, networkAddress: '10.9.12.1' },
        facts,
        revoked.deviceId,
        'revoke',
      );
      pid = await backendPid(context);
      held.open();
      await release.wait;
      return ended;
    });
    await held.wait;
    const approving = decide(later);
    await waitUntilAnyWaitingForLock(w.database, [pid]);
    release.open();
    expect((await revoking).kind).toBe('success');
    expect((await approving).status).toBe(200);
    const live = await w.query<{ id: string }>(
      `select id from numbering.series where kind = 'pos.bill' and scope_key like $1 and state <> 'Closed'`,
      [`device:${revoked.deviceId};%`],
    );
    expect(live).toEqual([]);
    expect((await seriesOf(kept.deviceId)).map((each) => each.financialYear)).toContain(later.label);
  });
});

describe('preparing and deciding a change (access-and-approvals 9.8b; code-house-rules 12.14)', () => {
  it('PRD-UXP-003 a year that overlaps, takes a label, or ends before it starts is refused with its reason, and so is a format without the device, one of another kind or an origin not accepted here', async () => {
    expect(
      errorOf(
        await prepareYear({
          label: firstYear,
          firstDay: w.setup.day(2000),
          lastDay: w.setup.day(2100),
          origin: 'synthetic',
        }),
      ).code,
    ).toBe('numbering.financial-year-label-taken');
    expect(
      errorOf(
        await prepareYear({ label: label(), firstDay: w.setup.day(10), lastDay: w.setup.day(20), origin: 'synthetic' }),
      ).code,
    ).toBe('numbering.financial-year-overlaps');
    expect(
      errorOf(
        await prepareYear({
          label: label(),
          firstDay: w.setup.day(2010),
          lastDay: w.setup.day(2000),
          origin: 'synthetic',
        }),
      ).code,
    ).toBe('numbering.financial-year-invalid');
    // A test-setup value is accepted only on kdps-test (code-house-rules 12.14).
    expect(
      errorOf(
        await prepareYear({
          label: label(),
          firstDay: w.setup.day(2000),
          lastDay: w.setup.day(2100),
          origin: 'test-setup',
        }),
      ).code,
    ).toBe('configuration.origin-not-allowed');
    expect(
      errorOf(await prepareFormat({ formatCode: formatCode(), parts: NO_DEVICE_FORMAT, origin: 'synthetic' })).code,
    ).toBe('pos.bill-format-without-device');
    expect(
      errorOf(
        await prepareFormat({
          formatCode: formatCode(),
          parts: [{ kind: 'scope' }, { kind: 'sequence', width: 0 }],
          origin: 'synthetic',
        }),
      ).code,
    ).toBe('numbering.format-invalid');
    // A format another kind uses, such as a journal's, is never changed through the bill's.
    const journal = syntheticCode(`JV-${String(randomInt(1_000_000))}`);
    await w.inChange(async (context) =>
      done(await w.numbering.defineFormatVersion(context, journal, [{ kind: 'year' }, { kind: 'sequence', width: 5 }])),
    );
    expect(errorOf(await prepareFormat({ formatCode: journal, parts: BILL_FORMAT, origin: 'synthetic' })).code).toBe(
      'pos.format-code-taken',
    );
  });

  it('POL-02.03 preparing needs create through a role assignment, and reading needs view', async () => {
    const year = await prepareYear(
      { label: label(), firstDay: w.setup.day(3000), lastDay: w.setup.day(3100), origin: 'synthetic' },
      w.outsider,
    );
    expect(year.status).toBe(403);
    expect(errorOf(year).code).toBe('access.not-authorised');
    expect((await w.get(w.cookies.get(w.outsider.id) ?? '', '/api/pos/financial-years')).status).toBe(403);
  });

  it('PRD-ACS-006 a rejected change takes no effect; approve still refuses, writing nothing, a year that meets one approved since it was prepared', async () => {
    const rejected = await preparedYear(1100, 1200);
    expect((await decide(rejected, 'reject')).status).toBe(200);
    const first = await preparedYear(1300, 1400);
    const overlapping = await preparedYear(1350, 1450);
    expect((await decide(first)).status).toBe(200);
    const refused = await decide(overlapping);
    expect(errorOf(refused).code).toBe('numbering.financial-year-overlaps');
    const list = financialYearListSchema.parse(
      (await w.get(w.cookies.get(preparer.id) ?? '', '/api/pos/financial-years')).body,
    );
    const labels = list.years.map((each) => each.label);
    expect(labels).toContain(first.label);
    expect(labels).not.toContain(rejected.label);
    expect(labels).not.toContain(overlapping.label);
    const stateOf = (changeId: unknown) => list.changes.find((each) => each.changeId === changeId)?.state;
    expect(stateOf(rejected.body.changeId)).toBe('Rejected');
    expect(stateOf(first.body.changeId)).toBe('Approved');
    expect(stateOf(overlapping.body.changeId)).toBe('Awaiting approval');
    expect(list.changes.find((each) => each.changeId === first.body.changeId)).toMatchObject({
      label: first.label,
      firstDay: w.setup.day(1300),
      lastDay: w.setup.day(1400),
      origin: 'synthetic',
      preparedByUserId: preparer.id,
      requestId: first.body.requestId,
    });
  });
});

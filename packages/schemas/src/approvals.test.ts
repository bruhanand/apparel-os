import { uuidv7 } from '@apparel-os/domain';
import { describe, expect, it } from 'vitest';
import {
  approvalRequestViewSchema,
  approvalValueSchema,
  decisionRefusalCodes,
  decisionRequestSchema,
  userVersionDraftSchema,
} from './approvals.js';
import { errorCodes, errorKindOf } from './errors.js';
import { myWorkSchema, exposureSchema, workItemSchema } from './work-item.js';

function without(value: object, key: string): object {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

const document = { module: 'access', recordType: 'access.role_assignment', recordId: uuidv7(), versionId: uuidv7() };
const at = '2026-10-06T10:00:00+05:30';

describe('approval value (PRD-ACS-015, PRD-ACS-016, PRD-MOD-015)', () => {
  it('keeps none, Unknown and zero apart', () => {
    const none = approvalValueSchema.parse({ kind: 'none' });
    const unknown = approvalValueSchema.parse({ kind: 'unknown', basis: 'cost' });
    const zero = approvalValueSchema.parse({ kind: 'known', basis: 'cost', amount: 0 });
    expect(new Set([none.kind, unknown.kind, zero.kind]).size).toBe(3);
  });

  it('refuses an amount that is not whole paise', () => {
    expect(approvalValueSchema.safeParse({ kind: 'known', basis: 'cost', amount: 10.5 }).success).toBe(false);
  });
});

describe('approval request (PRD-ACS-006, PRD-ACS-007, PRD-UXP-003)', () => {
  const view = {
    id: uuidv7(),
    actionType: 'access.role_assignment.change',
    document,
    value: { kind: 'none' },
    preparers: [uuidv7()],
    state: 'Awaiting approval',
    requestedAt: at,
    decidable: { kind: 'unavailable', code: 'access.self-preparation', missing: [] },
    asOf: at,
  };

  it('names at least one preparer, the exact version and whether the reader may decide', () => {
    expect(approvalRequestViewSchema.safeParse(view).success).toBe(true);
    expect(approvalRequestViewSchema.safeParse({ ...view, preparers: [] }).success).toBe(false);
    expect(approvalRequestViewSchema.safeParse({ ...view, state: 'Pending' }).success).toBe(false);
    expect(approvalRequestViewSchema.safeParse(without(view, 'decidable')).success).toBe(false);
  });

  it('DEC-117 shows a request withdrawn before approval', () => {
    expect(approvalRequestViewSchema.safeParse({ ...view, state: 'Withdrawn' }).success).toBe(true);
  });
});

describe('decision (POL-02.23, DEC-104, PRD-SEC-001)', () => {
  const decision = {
    versionId: uuidv7(),
    outcome: 'approve',
    reason: { kind: 'listed', reasonId: uuidv7() },
    totpCode: '123456',
  };

  it('needs a fresh authenticator code and a reason', () => {
    expect(decisionRequestSchema.safeParse(decision).success).toBe(true);
    expect(decisionRequestSchema.safeParse(without(decision, 'totpCode')).success).toBe(false);
    expect(decisionRequestSchema.safeParse(without(decision, 'reason')).success).toBe(false);
  });

  it('takes a free-text reason in shape; access allows it only on a reason-list change', () => {
    expect(
      decisionRequestSchema.safeParse({ ...decision, reason: { kind: 'free-text', text: 'Synthetic reason' } }).success,
    ).toBe(true);
    expect(decisionRequestSchema.safeParse({ ...decision, reason: { kind: 'free-text', text: '' } }).success).toBe(
      false,
    );
  });

  it('RR-246 declares every reason a decision is refused with as an access code with its kind', () => {
    for (const code of decisionRefusalCodes) expect(code in errorCodes, code).toBe(true);
    expect(errorKindOf('access.no-reason-list-in-force')).toBe('unavailable');
    expect(errorKindOf('access.self-preparation')).toBe('refused');
    expect(errorKindOf('access.not-eligible')).toBe('not-authorised');
  });
});

describe('user version (DEC-112, access-and-approvals 2.1)', () => {
  it('states the user’s state; Active, Disabled and Ended only', () => {
    const draft = { displayName: 'SYNTHETIC user', personas: ['P-AUD'], state: 'Disabled' };
    expect(userVersionDraftSchema.safeParse(draft).success).toBe(true);
    expect(userVersionDraftSchema.safeParse({ ...draft, state: 'Locked' }).success).toBe(false);
    expect(userVersionDraftSchema.safeParse(without(draft, 'state')).success).toBe(false);
  });
});

describe('work item (PRD-ACS-009, PRD-MOD-015)', () => {
  it('keeps Unknown exposure apart from zero and allows no due time', () => {
    expect(exposureSchema.parse({ kind: 'unknown' })).not.toEqual(exposureSchema.parse({ kind: 'known', amount: 0 }));
    const item = {
      id: uuidv7(),
      kind: 'approval',
      owner: document,
      due: { kind: 'none' },
      exposure: { kind: 'none' },
      state: 'Awaiting approval',
    };
    expect(workItemSchema.safeParse(item).success).toBe(true);
    expect(workItemSchema.safeParse({ ...item, due: { kind: 'at', at } }).success).toBe(true);
    expect(workItemSchema.safeParse({ ...item, due: null }).success).toBe(false);
    expect(myWorkSchema.safeParse({ asOf: at, items: [item] }).success).toBe(true);
  });
});

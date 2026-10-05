import { uuidv7 } from '@apparel-os/domain';
import { describe, expect, it } from 'vitest';
import { approvalRequestViewSchema, approvalValueSchema, decisionRequestSchema } from './approvals.js';
import { exposureSchema, workItemSchema } from './work-item.js';

function without(value: object, key: string): object {
  return Object.fromEntries(Object.entries(value).filter(([name]) => name !== key));
}

const document = { module: 'access', recordType: 'access.role_assignment', recordId: uuidv7(), versionId: uuidv7() };

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

describe('approval request (PRD-ACS-006, PRD-ACS-007)', () => {
  it('names at least one preparer and the exact version', () => {
    const view = {
      id: uuidv7(),
      actionType: 'access.role_assignment.change',
      document,
      value: { kind: 'none' },
      preparers: [uuidv7()],
      state: 'Awaiting approval',
    };
    expect(approvalRequestViewSchema.safeParse(view).success).toBe(true);
    expect(approvalRequestViewSchema.safeParse({ ...view, preparers: [] }).success).toBe(false);
    expect(approvalRequestViewSchema.safeParse({ ...view, state: 'Pending' }).success).toBe(false);
  });
});

describe('decision (POL-02.23, DEC-104, PRD-SEC-001)', () => {
  const decision = {
    requestId: uuidv7(),
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
    expect(workItemSchema.safeParse({ ...item, due: { kind: 'at', at: '2026-10-06T10:00:00+05:30' } }).success).toBe(
      true,
    );
    expect(workItemSchema.safeParse({ ...item, due: null }).success).toBe(false);
  });
});

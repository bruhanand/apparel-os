import type { ApprovalRequestView } from '@apparel-os/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SessionContext, type ShellSession } from '../shell/session';
import { ApprovalPanelView, panelCase } from './ApprovalPanel';

// S1-F01-T16: the approval panel (design-language 10.14; access-and-approvals 9.3, 9.5, 9.6; spec section 6
// "Approval panel"; PRD-ACS-006, PRD-ACS-007, PRD-UXP-003; POL-02.23, DEC-104). Every value here is SYNTHETIC.

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ADMIN = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f701';
const APPROVER = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f702';
const VERSION = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7a1';
const REASON = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7b1';
const session: ShellSession = {
  state: 'active',
  user: {
    organisationCode: 'SYN-ORG-A',
    userId: APPROVER,
    displayName: 'SYNTHETIC Approver',
    personasHeld: [],
    roleAssignmentInForce: true,
    timeZone: 'UTC',
  },
  grants: [],
};

function view(overrides: Partial<ApprovalRequestView> = {}): ApprovalRequestView {
  return {
    id: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7c1',
    actionType: 'access.role_assignment.change',
    document: {
      module: 'access',
      recordType: 'access.role_assignment',
      recordId: VERSION,
      versionId: VERSION,
    },
    value: { kind: 'none' },
    preparers: [ADMIN],
    state: 'Awaiting approval',
    requestedAt: '2026-10-07T09:00:00.000Z',
    decidable: { kind: 'available', reason: 'listed', outcomes: ['approve', 'reject'], missing: [] },
    asOf: '2026-10-07T10:00:00.000Z',
    ...overrides,
  };
}

const reasons = [
  { id: REASON, versionId: VERSION, code: 'SYN-OK', kind: 'approve' as const, text: 'SYNTHETIC checked' },
  {
    id: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7b2',
    versionId: VERSION,
    code: 'SYN-NO',
    kind: 'reject' as const,
    text: 'SYNTHETIC not needed',
  },
];

/** The radio input of one outcome, as rendered. */
const radio = (html: string, outcome: string) =>
  new RegExp(`<input[^>]*type="radio"[^>]*value="${outcome}"[^>]*>`).exec(html)?.[0] ?? '';

function render(shown: ApprovalRequestView) {
  return renderToStaticMarkup(
    <SessionContext value={{ session, setSession: () => undefined }}>
      <ApprovalPanelView
        view={shown}
        names={new Map([[ADMIN, 'SYNTHETIC Admin']])}
        reasons={reasons}
        submission={{ kind: 'ready' }}
        onDecide={() => undefined}
        timeZone="UTC"
      />
    </SessionContext>,
  );
}

describe('panelCase', () => {
  it('names the case the panel shows (spec section 6)', () => {
    expect(panelCase(view())).toBe('decide');
    expect(
      panelCase(
        view({ decidable: { kind: 'unavailable', code: 'access.self-preparation', missing: [{ kind: 'preparer' }] } }),
      ),
    ).toBe('unavailable');
    expect(panelCase(view({ state: 'Superseded' }))).toBe('superseded');
    expect(panelCase(view({ state: 'Withdrawn' }))).toBe('closed');
    expect(
      panelCase(
        view({
          state: 'Approved',
          decision: {
            id: VERSION,
            outcome: 'Approved',
            approverId: APPROVER,
            reason: { kind: 'free-text', text: 'SYNTHETIC first list' },
            decidedAt: '2026-10-07T09:30:00.000Z',
          },
        }),
      ),
    ).toBe('decided');
  });
});

describe('the approval panel', () => {
  it('PRD-ACS-007 shows the version, who prepared it and the value, and asks a reason and a fresh code', () => {
    const html = render(view());
    expect(text(html)).toContain('Role assignment change');
    expect(text(html)).toContain('Awaiting approval');
    expect(text(html)).toContain('Prepared by SYNTHETIC Admin');
    expect(text(html)).toContain(VERSION);
    expect(text(html)).toContain('No value: an access change has none, so no approval limit applies');
    expect(text(html)).toContain('You didn’t prepare this, so you can decide it');
    expect(text(html)).toContain('SYNTHETIC checked');
    expect(html).toMatch(/autocomplete="one-time-code"/i);
    expect(text(html)).toContain('Approve');
  });

  it('DEC-104 a reason-list change takes a reason in your own words', () => {
    const html = render(
      view({ decidable: { kind: 'available', reason: 'free-text', outcomes: ['approve', 'reject'], missing: [] } }),
    );
    expect(html).toContain('<textarea');
    expect(text(html)).not.toContain('SYNTHETIC checked');
  });

  it('POL-02.23 PRD-UXP-003 offers only the outcomes with reasons in force, and names what the other lacks', () => {
    const approveOnly = render(
      view({
        decidable: {
          kind: 'available',
          reason: 'listed',
          outcomes: ['approve'],
          missing: [{ kind: 'reason-list', reasonKind: 'reject' }],
        },
      }),
    );
    expect(radio(approveOnly, 'reject')).toContain('disabled');
    expect(radio(approveOnly, 'approve')).not.toContain('disabled');
    expect(text(approveOnly)).toContain('Reject isn’t available: no reject reason is in force yet');
    const rejectOnly = render(
      view({
        decidable: {
          kind: 'available',
          reason: 'listed',
          outcomes: ['reject'],
          missing: [{ kind: 'reason-list', reasonKind: 'approve' }],
        },
      }),
    );
    expect(radio(rejectOnly, 'approve')).toContain('disabled');
    expect(radio(rejectOnly, 'reject')).not.toContain('disabled');
    expect(text(rejectOnly)).toContain('Approve isn’t available: no approve reason is in force yet');
    // The form starts on the open outcome, so it offers the reject reasons.
    expect(text(rejectOnly)).toContain('SYNTHETIC not needed');
    expect(text(rejectOnly)).not.toContain('SYNTHETIC checked');
  });

  it('PRD-ACS-006 PRD-UXP-003 an unavailable decision names what is missing and offers no decision', () => {
    const html = render(
      view({ decidable: { kind: 'unavailable', code: 'access.self-preparation', missing: [{ kind: 'preparer' }] } }),
    );
    expect(text(html)).toContain('You prepared or changed this version, so another person must decide it');
    expect(text(html)).toContain('You are one of the people who prepared this version.');
    expect(html).not.toContain('one-time-code');
  });

  it('POL-02.23 with no reason list in force, deciding is unavailable and says so', () => {
    const html = render(
      view({
        decidable: {
          kind: 'unavailable',
          code: 'access.no-reason-list-in-force',
          missing: [{ kind: 'reason-list', reasonKind: 'approve' }],
        },
      }),
    );
    expect(text(html)).toContain('No approve or reject reasons are in force yet');
    expect(html).not.toContain('one-time-code');
  });

  it('shows a decision with its outcome, reason and approver, and a superseded request as such', () => {
    const decided = render(
      view({
        state: 'Approved',
        decidable: { kind: 'unavailable', code: 'access.approval-not-open', missing: [] },
        decision: {
          id: VERSION,
          outcome: 'Approved',
          approverId: ADMIN,
          reason: { kind: 'listed', reasonId: REASON, code: 'SYN-OK', text: 'SYNTHETIC checked' },
          decidedAt: '2026-10-07T09:30:00.000Z',
        },
      }),
    );
    expect(text(decided)).toContain('Approved by SYNTHETIC Admin');
    expect(text(decided)).toContain('07 Oct 2026, 09:30');
    expect(text(decided)).toContain('SYNTHETIC checked');
    expect(decided).not.toContain('one-time-code');
    const superseded = render(view({ state: 'Superseded' }));
    expect(text(superseded)).toContain('A newer version replaced this request');
    expect(superseded).not.toContain('one-time-code');
  });
});

import type { AssignmentList, ReasonList, RoleList, UserList } from '@apparel-os/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { Grant } from '../shell/screens';
import { SessionContext, type ShellSession } from '../shell/session';
import { AssignmentScopeFields, AssignmentsScreen, scopeOfChoices } from './AssignmentsScreen';
import { formatDate, formatPaise } from './format';
import { permissionGrid, permissionsOfGrid, withAllActions } from './permission-grid';
import { RecordDrawer } from './RecordDrawer';
import { ReasonsScreen } from './ReasonsScreen';
import { RolesScreen } from './RolesScreen';
import { UsersScreen } from './UsersScreen';

// S1-F01-T16: the access setup screens (access-and-approvals 2.1, 4, 5, 9.5, 14; design-language 10.3, 10.7, 10.9,
// 10.13, 10.15; spec section 6 "Users, roles, assignments", "Approval reasons"). Every value here is SYNTHETIC.

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const ADMIN = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f701';
const NEW_USER = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f702';
const ROLE = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f710';
const AS_OF = '2026-10-07T10:00:00.000Z';
const id = (n: number) => `0199b3c4-5d6e-7f80-91a2-b3c4d5e6${n.toString(16).padStart(4, '0')}`;

const view = (recordType: string): Grant => ({ recordType, action: 'view' });
const create = (recordType: string): Grant => ({ recordType, action: 'create' });

function render(node: ReactNode, grants: Grant[], seed: (client: QueryClient) => void) {
  const client = new QueryClient();
  seed(client);
  const session: ShellSession = {
    state: 'active',
    user: {
      organisationCode: 'SYN-ORG-A',
      userId: ADMIN,
      displayName: 'SYNTHETIC Admin',
      personasHeld: ['P-ADM'],
      roleAssignmentInForce: true,
      timeZone: 'UTC',
    },
    grants,
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <SessionContext value={{ session, setSession: () => undefined }}>{node}</SessionContext>
    </QueryClientProvider>,
  );
}

const users: UserList = {
  asOf: AS_OF,
  users: [
    {
      id: ADMIN,
      login: 'SYN-ADMIN',
      versions: [
        {
          id: id(1),
          displayName: 'SYNTHETIC Admin',
          personas: ['P-ADM'],
          userState: 'Active',
          validFrom: '2026-10-01',
          state: 'In force',
        },
      ],
    },
    {
      id: NEW_USER,
      login: 'SYN-AUDITOR',
      versions: [
        {
          id: id(2),
          displayName: 'SYNTHETIC Auditor',
          personas: ['P-AUD'],
          userState: 'Active',
          validFrom: '2026-10-07',
          state: 'Awaiting approval',
          request: { id: id(3), state: 'Awaiting approval' },
        },
      ],
    },
  ],
};

describe('India formatting (design-language 8)', () => {
  it('writes paise as rupees with Indian grouping, and a business date as DD MMM YYYY', () => {
    expect(formatPaise(12_345_678)).toBe('₹1,23,456.78');
    expect(formatPaise(5)).toBe('₹0.05');
    expect(formatDate('2026-10-07')).toBe('07 Oct 2026');
  });
});

describe('Setup › Users (access-and-approvals 2.1; DEC-112; RR-214)', () => {
  it('lists each user with login, name, personas, the user state in force and the latest version’s state', () => {
    const html = render(<UsersScreen />, [view('access.user'), create('access.user')], (client) => {
      client.setQueryData(['listUsers', {}], users);
    });
    const rows = [...html.matchAll(/<tr[^>]*>(.*?)<\/tr>/gs)].map((match) => text(match[1] ?? ''));
    expect(rows[1]).toContain('SYN-ADMIN');
    expect(rows[1]).toContain('SYNTHETIC Admin');
    expect(rows[1]).toContain('P-ADM');
    expect(rows[1]).toContain('Active');
    expect(rows[1]).toContain('In force');
    // A user whose first version waits has no state in force and cannot sign in (access-and-approvals 2.1).
    expect(rows[2]).toContain('Not in force yet');
    expect(rows[2]).toContain('Awaiting approval');
    expect(text(html)).toContain('New user');
    expect(text(html)).toContain('as of');
  });

  it('PRD-UXP-003 without create, New user is disabled and names the missing permission', () => {
    const html = render(<UsersScreen />, [view('access.user')], (client) => {
      client.setQueryData(['listUsers', {}], users);
    });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>New user<\/button>/);
    expect(text(html)).toContain('Needs Create on User');
  });
});

describe('the role editor (access-and-approvals 4.1, 4.2; POL-02.01, POL-02.03)', () => {
  it('offers each declared record type with only the actions it declares', () => {
    const grid = permissionGrid();
    const role = grid.find((row) => row.recordType === 'access.role');
    expect(role?.actions).toEqual(['view', 'create', 'edit', 'approve']);
    expect(grid.find((row) => row.recordType === 'access.approval_request')?.actions).toEqual(['view']);
  });

  it('POL-02.03 expands All actions into the explicit actions and saves only explicit permissions', () => {
    const selection = withAllActions(new Set<string>(), 'access.role');
    expect(permissionsOfGrid(selection)).toEqual(
      (['view', 'create', 'edit', 'approve'] as const).map((action) => ({
        kind: 'action',
        recordType: 'access.role',
        action,
        selfService: false,
      })),
    );
  });

  it('lists roles with their code, name and state', () => {
    const roles: RoleList = {
      asOf: AS_OF,
      roles: [
        {
          id: ROLE,
          code: 'SYN-READER',
          selfService: false,
          versions: [
            {
              id: id(11),
              name: 'SYNTHETIC reader',
              permissions: [{ kind: 'action', recordType: 'access.role', action: 'view', selfService: false }],
              validFrom: '2026-10-08',
              state: 'Scheduled',
            },
          ],
        },
      ],
    };
    const html = render(<RolesScreen />, [view('access.role')], (client) => {
      client.setQueryData(['listRoles', {}], roles);
    });
    expect(text(html)).toContain('SYN-READER');
    expect(text(html)).toContain('SYNTHETIC reader');
    expect(text(html)).toContain('Scheduled');
    expect(text(html)).toContain('08 Oct 2026');
  });
});

describe('the assignment editor (access-and-approvals 4.3, 5.1, 5.2, 14; PRD-ACS-005, PRD-ACS-021)', () => {
  it('builds a scope per dimension, and says an empty dimension grants nothing', () => {
    expect(scopeOfChoices({ legalEntity: 'all', place: 'empty', brand: 'all' })).toEqual({
      kind: 'dimensions',
      legalEntity: { kind: 'all' },
      place: { kind: 'empty' },
      brand: { kind: 'all' },
    });
    const warned = renderToStaticMarkup(
      <AssignmentScopeFields choices={{ legalEntity: 'all', place: 'empty', brand: 'all' }} register={() => ({})} />,
    );
    expect(text(warned)).toContain('A dimension left empty grants nothing');
    const full = renderToStaticMarkup(
      <AssignmentScopeFields choices={{ legalEntity: 'all', place: 'all', brand: 'all' }} register={() => ({})} />,
    );
    expect(text(full)).not.toContain('A dimension left empty grants nothing');
    expect(text(full)).toContain('A selected Site covers its Stores and business units, including ones added later');
    expect(text(full)).toContain('Selected members arrive with the legal entities, places and brands');
  });

  it('lists assignments with the person, the role, the scope per dimension, the dates and the state', () => {
    const assignments: AssignmentList = {
      asOf: AS_OF,
      assignments: [
        {
          id: id(21),
          actor: { kind: 'user', userId: NEW_USER, name: 'SYNTHETIC Auditor' },
          role: { id: ROLE, code: 'SYN-READER' },
          scope: { kind: 'dimensions', legalEntity: { kind: 'all' }, place: { kind: 'all' }, brand: { kind: 'all' } },
          validFrom: '2026-10-07',
          state: 'Awaiting approval',
          request: { id: id(22), state: 'Awaiting approval' },
        },
      ],
    };
    const html = render(<AssignmentsScreen />, [view('access.role_assignment')], (client) => {
      client.setQueryData(['listRoleAssignments', {}], assignments);
    });
    expect(text(html)).toContain('SYNTHETIC Auditor');
    expect(text(html)).toContain('SYN-READER');
    expect(text(html)).toContain('Legal entity: All members · Place: All members · Brand: All members');
    expect(text(html)).toContain('From 07 Oct 2026');
    expect(text(html)).toContain('Awaiting approval');
  });
});

describe('Setup › Reason codes (access-and-approvals 9.5; POL-02.23)', () => {
  it('lists each reason with its kind, text and state', () => {
    const reasons: ReasonList = {
      asOf: AS_OF,
      reasons: [
        {
          id: id(31),
          code: 'SYN-OK',
          kind: 'approve',
          versions: [{ id: id(32), text: 'SYNTHETIC checked', validFrom: '2026-10-07', state: 'In force' }],
        },
      ],
    };
    const html = render(<ReasonsScreen />, [view('access.approval_reason')], (client) => {
      client.setQueryData(['listApprovalReasonRecords', {}], reasons);
    });
    expect(text(html)).toContain('SYN-OK');
    expect(text(html)).toContain('Approve reason');
    expect(text(html)).toContain('SYNTHETIC checked');
    expect(text(html)).toContain('In force');
  });
});

describe('the record drawer (design-language 10.15; RR-312)', () => {
  it('has a reference, a title, the status badge, Details and History tabs and a close button', () => {
    const html = render(
      <RecordDrawer
        reference="SYN-READER"
        title="SYNTHETIC reader"
        state="In force"
        onClose={() => undefined}
        details={<p>{'details'}</p>}
        history={<p>{'history'}</p>}
      />,
      [],
      () => undefined,
    );
    expect(html).toContain('role="dialog"');
    expect(text(html)).toContain('SYN-READER');
    expect(text(html)).toContain('SYNTHETIC reader');
    expect(text(html)).toContain('In force');
    expect(text(html)).toContain('Details');
    expect(text(html)).toContain('History');
    expect(html).toContain('aria-label="Close"');
  });
});

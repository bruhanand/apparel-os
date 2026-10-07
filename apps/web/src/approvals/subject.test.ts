import type { ApprovalRequestView } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { approvalSubject } from './subject';

// What an approval request is for (access-and-approvals 9.1, 11.2; PRD-UXP-003; visual review finding 3). Every value
// here is SYNTHETIC.

const ADMIN = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f701';
const ROLE = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7d1';
const VERSION = '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7a1';
const AS_OF = '2026-10-07T10:00:00.000Z';

const view: ApprovalRequestView = {
  id: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7c1',
  actionType: 'access.role.change',
  document: { module: 'access', recordType: 'access.role', recordId: ROLE, versionId: VERSION },
  value: { kind: 'none' },
  preparers: [ADMIN],
  state: 'Awaiting approval',
  requestedAt: '2026-10-07T09:00:00.000Z',
  decidable: { kind: 'available', reason: 'listed', outcomes: ['approve'], missing: [] },
  asOf: AS_OF,
};

const version = { id: VERSION, validFrom: '2026-10-07', state: 'Awaiting approval' as const };

describe('approvalSubject', () => {
  it('names the action, the record and its preparers from the lists the reader may view', () => {
    const subject = approvalSubject(view, {
      users: {
        asOf: AS_OF,
        users: [
          {
            id: ADMIN,
            login: 'syn-admin',
            versions: [{ ...version, displayName: 'SYNTHETIC Admin', personas: [], userState: 'Active' }],
          },
        ],
      },
      roles: {
        asOf: AS_OF,
        roles: [
          {
            id: ROLE,
            code: 'SYN-AUDIT',
            selfService: false,
            versions: [{ ...version, name: 'SYNTHETIC auditor', permissions: [] }],
          },
        ],
      },
    });
    expect(subject).toEqual({
      title: 'Role change',
      name: 'SYN-AUDIT · SYNTHETIC auditor',
      preparedBy: 'SYNTHETIC Admin',
      requestedAt: '2026-10-07T09:00:00.000Z',
    });
  });

  it('says only what the request says where the reader may not read the record or the users, never an identifier', () => {
    const subject = approvalSubject(view, {});
    expect(subject.title).toBe('Role change');
    expect(subject.name).toBeNull();
    expect(subject.preparedBy).not.toContain(ADMIN);
  });
});

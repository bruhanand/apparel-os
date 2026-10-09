import { paise } from '@apparel-os/domain';
import type { AssignmentScope } from '@apparel-os/schemas';
import { describe, expect, it } from 'vitest';
import { authorityOf, offeredTo, type LimitRow } from './approval-limits.js';

// S1-F05-T01: who may decide a valued request, and to whom it is offered (access-and-approvals 9.2 to 9.4; POL-02.09,
// POL-02.15, PRD-ACS-015, PRD-ACS-016; DEC-043). Pure: no database. Every limit here is SYNTHETIC.

const ALL: AssignmentScope = {
  kind: 'dimensions',
  legalEntity: { kind: 'all' },
  place: { kind: 'all' },
  brand: { kind: 'all' },
};
const ROLE = '01900000-0000-7000-8000-00000000a001';
const OTHER_ROLE = '01900000-0000-7000-8000-00000000a002';
const USER = '01900000-0000-7000-8000-00000000b001';
const ASSIGNMENT = { assignmentId: '01900000-0000-7000-8000-00000000c001', roleId: ROLE };
const known = (rupees: number) => ({ kind: 'known' as const, amountPaise: paise(rupees * 100) });
const coversAll = () => true;

function roleLimit(id: string, authority: Partial<LimitRow> = {}): LimitRow {
  return {
    id,
    holder: { kind: 'role', roleId: ROLE, scope: ALL },
    amount: null,
    unlimited: false,
    coversUnknown: false,
    ...authority,
  };
}

describe('the authority of one approver (access-and-approvals 9.2, 9.3)', () => {
  it('POL-02.09 a missing limit grants nothing', () => {
    expect(authorityOf(USER, [ASSIGNMENT], [], coversAll, known(10))).toEqual({ kind: 'no-limit' });
  });

  it('POL-02.09 a limit covers a value at most the limit, and names the limit and the assignment relied on', () => {
    const limit = roleLimit('L1', { amount: paise(1_000) });
    expect(authorityOf(USER, [ASSIGNMENT], [limit], coversAll, known(10))).toEqual({
      kind: 'covered',
      assignmentId: ASSIGNMENT.assignmentId,
      limit,
    });
    expect(authorityOf(USER, [ASSIGNMENT], [limit], coversAll, known(10.01))).toEqual({
      kind: 'above',
      highest: limit,
    });
  });

  it('POL-02.15 a limit of another role, or whose scope does not cover the facts, does not apply', () => {
    const other = {
      ...roleLimit('L1', { amount: paise(1_000) }),
      holder: { kind: 'role' as const, roleId: OTHER_ROLE, scope: ALL },
    };
    expect(authorityOf(USER, [ASSIGNMENT], [other], coversAll, known(1))).toEqual({ kind: 'no-limit' });
    expect(authorityOf(USER, [ASSIGNMENT], [roleLimit('L2', { amount: paise(1_000) })], () => false, known(1))).toEqual(
      {
        kind: 'no-limit',
      },
    );
  });

  it('PRD-ACS-016 an Unknown value needs explicit authority over Unknown, which unlimited authority is not', () => {
    const unlimited = roleLimit('L1', { unlimited: true });
    expect(authorityOf(USER, [ASSIGNMENT], [unlimited], coversAll, { kind: 'unknown' })).toEqual({
      kind: 'unknown-not-covered',
    });
    const unknown = roleLimit('L2', { coversUnknown: true });
    expect(authorityOf(USER, [ASSIGNMENT], [unknown], coversAll, { kind: 'unknown' })).toMatchObject({
      kind: 'covered',
      limit: unknown,
    });
    // Authority over Unknown alone gives no authority over a known value.
    expect(authorityOf(USER, [ASSIGNMENT], [unknown], coversAll, known(1))).toEqual({ kind: 'no-limit' });
  });

  it('access-and-approvals 9.2 an individual limit replaces the role limit for that user, through its assignment', () => {
    const role = roleLimit('L1', { amount: paise(100_000) });
    const individual: LimitRow = {
      id: 'L2',
      holder: { kind: 'individual', userId: USER, roleAssignmentId: ASSIGNMENT.assignmentId },
      amount: paise(1_000),
      unlimited: false,
      coversUnknown: false,
    };
    expect(authorityOf(USER, [ASSIGNMENT], [role, individual], coversAll, known(50))).toEqual({
      kind: 'above',
      highest: individual,
    });
    // Another user's individual limit changes nothing for this one.
    const elsewhere = {
      ...individual,
      holder: { ...individual.holder, userId: '01900000-0000-7000-8000-00000000b002' },
    };
    expect(authorityOf(USER, [ASSIGNMENT], [role, elsewhere], coversAll, known(50))).toMatchObject({
      kind: 'covered',
      limit: role,
    });
  });

  it('DEC-043 of several limits that cover, the lowest is relied on; explicit unlimited authority comes after', () => {
    const second = { assignmentId: '01900000-0000-7000-8000-00000000c002', roleId: OTHER_ROLE };
    const high = roleLimit('L1', { amount: paise(100_000) });
    const unlimited = {
      ...roleLimit('L2', { unlimited: true }),
      holder: { kind: 'role' as const, roleId: OTHER_ROLE, scope: ALL },
    };
    expect(authorityOf(USER, [second, ASSIGNMENT], [unlimited, high], coversAll, known(10))).toEqual({
      kind: 'covered',
      assignmentId: ASSIGNMENT.assignmentId,
      limit: high,
    });
  });
});

describe('routing (access-and-approvals 9.4; DEC-043)', () => {
  const at = (id: string, authority: Partial<LimitRow>) => ({
    kind: 'covered' as const,
    assignmentId: `a-${id}`,
    limit: roleLimit(id, authority),
  });

  it('DEC-043 a request is offered to the approvers with the lowest limit that covers it', () => {
    expect(
      offeredTo(
        [
          { actorId: 'low', authority: at('1', { amount: paise(1_000) }) },
          { actorId: 'tied', authority: at('2', { amount: paise(1_000) }) },
          { actorId: 'high', authority: at('3', { amount: paise(5_000) }) },
          { actorId: 'unlimited', authority: at('4', { unlimited: true }) },
          { actorId: 'short', authority: { kind: 'above', highest: roleLimit('5', { amount: paise(1) }) } },
        ],
        known(5),
      ),
    ).toEqual(['low', 'tied']);
  });

  it('POL-02.09 explicit unlimited authority is offered a request only when no finite limit covers it', () => {
    expect(
      offeredTo(
        [
          { actorId: 'unlimited', authority: at('4', { unlimited: true }) },
          { actorId: 'short', authority: { kind: 'above', highest: roleLimit('5', { amount: paise(1) }) } },
        ],
        known(5),
      ),
    ).toEqual(['unlimited']);
  });

  it('PRD-ACS-016 an Unknown value is offered to every approver with explicit authority over Unknown', () => {
    expect(
      offeredTo(
        [
          { actorId: 'unknown-low', authority: at('1', { amount: paise(10), coversUnknown: true }) },
          { actorId: 'unknown-only', authority: at('2', { coversUnknown: true }) },
          { actorId: 'none', authority: { kind: 'unknown-not-covered' } },
        ],
        { kind: 'unknown' },
      ),
    ).toEqual(['unknown-low', 'unknown-only']);
  });

  it('POL-02.09 with nobody eligible, nobody is offered it', () => {
    expect(offeredTo([{ actorId: 'none', authority: { kind: 'no-limit' } }], known(1))).toEqual([]);
  });
});

import type { MyWork, WorkItem } from '@apparel-os/schemas';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { myWorkCount, MyWorkCounter, MyWorkList } from './MyWork';

// S1-F01-T16: My work and its counter (access-and-approvals 11.2; design-language 10.5, 10.13; PRD-ACS-009,
// PRD-UXP-003, PRD-PRF-004). Every value here is SYNTHETIC.

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const AS_OF = '2026-10-07T10:00:00.000Z';

function item(index: number, overrides: Partial<WorkItem> = {}): WorkItem {
  const hex = index.toString(16).padStart(4, '0');
  return {
    id: `0199b3c4-5d6e-7f80-91a2-b3c4d5e6${hex}`,
    kind: 'approval',
    owner: {
      module: 'access',
      recordType: 'access.approval_request',
      recordId: `0199b3c4-5d6e-7f80-91a2-b3c4d5e7${hex}`,
      versionId: `0199b3c4-5d6e-7f80-91a2-b3c4d5e8${hex}`,
    },
    due: { kind: 'none' },
    exposure: { kind: 'none' },
    state: 'Awaiting approval',
    nextAction: 'access.decide-approval',
    ...overrides,
  };
}

const work = (items: WorkItem[]): MyWork => ({ asOf: AS_OF, items });

describe('the My work counter (design-language 10.5)', () => {
  it('counts the open items; zero is a plain 0; 100 or more is 99+', () => {
    expect(myWorkCount(work([]))).toEqual({ kind: 'zero' });
    expect(myWorkCount(work([item(1), item(2)]))).toEqual({ kind: 'count', count: 2 });
    expect(myWorkCount(work(Array.from({ length: 100 }, (_, index) => item(index))))).toEqual({
      kind: 'count',
      count: 100,
    });
    expect(text(renderToStaticMarkup(<MyWorkCounter count={{ kind: 'count', count: 100 }} />))).toBe('My work 99+');
    expect(text(renderToStaticMarkup(<MyWorkCounter count={{ kind: 'count', count: 2 }} />))).toBe('My work 2');
    expect(text(renderToStaticMarkup(<MyWorkCounter count={{ kind: 'zero' }} />))).toBe('My work 0');
  });

  it('shows the overdue items in the Attention family when any is past its due time', () => {
    const overdue = item(1, { due: { kind: 'at', at: '2026-10-07T09:00:00.000Z' } });
    const later = item(2, { due: { kind: 'at', at: '2026-10-08T09:00:00.000Z' } });
    expect(myWorkCount(work([overdue, later]))).toEqual({ kind: 'overdue', count: 1 });
    const html = renderToStaticMarkup(<MyWorkCounter count={{ kind: 'overdue', count: 1 }} />);
    expect(text(html)).toBe('My work ! 1 overdue');
    expect(html).toContain('bg-w-bg');
  });
});

describe('the My work list (access-and-approvals 11.2; PRD-ACS-009, PRD-UXP-003)', () => {
  it('keeps the order the server gives and shows each item’s state, due time, exposure and next action', () => {
    const html = renderToStaticMarkup(
      <MyWorkList work={work([item(1), item(2, { exposure: { kind: 'unknown' } })])} onOpen={() => undefined} />,
    );
    const rows = [...html.matchAll(/<li[^>]*>(.*?)<\/li>/gs)].map((match) => text(match[1] ?? ''));
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Approval');
    expect(rows[0]).toContain('Awaiting approval');
    expect(rows[0]).toContain('No due time');
    expect(rows[0]).toContain('No value');
    expect(rows[0]).toContain('Open and decide');
    expect(rows[1]).toContain('Value not known yet');
    expect(text(html)).toContain('as of');
  });

  it('explains an empty list', () => {
    const html = renderToStaticMarkup(<MyWorkList work={work([])} onOpen={() => undefined} />);
    expect(text(html)).toContain('Nothing waiting for you');
  });
});

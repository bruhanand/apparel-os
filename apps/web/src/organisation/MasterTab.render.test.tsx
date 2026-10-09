import { masterRoutes } from '@apparel-os/schemas';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { SessionContext, type ShellSession } from '../shell/session';
import { MasterTab, type MasterPage } from './MasterTab';

// S1-F02-T04 review: a grouping kind migration 0044 recorded with no version, as an earlier region or cluster on dev,
// is listed as having no version yet, so an Admin gives it its first version through flow A (structure-and-masters
// 3.6). Every value here is SYNTHETIC.

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const session: ShellSession = {
  state: 'active',
  user: {
    organisationCode: 'SYN-ORG-A',
    userId: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f701',
    displayName: 'SYNTHETIC Admin',
    personasHeld: ['P-ADM'],
    roleAssignmentInForce: true,
    timeZone: 'UTC',
    idleLockSeconds: 900,
  },
  grants: [{ recordType: 'organisation.grouping_kind', action: 'view' }],
};

describe('a grouping kind with no version (structure-and-masters 3.6; RR-440)', () => {
  it('PRD-ORG-007 is listed as having no version yet', () => {
    const page: MasterPage = {
      asOf: '2026-10-09T10:00:00.000Z',
      records: [{ id: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f720', code: 'SYN-REGION', versions: [] }],
      next: null,
    };
    const client = new QueryClient();
    client.setQueryData([masterRoutes.grouping_kind.list, 'pages'], {
      pages: [page],
      pageParams: [undefined],
    });
    const html = renderToStaticMarkup(
      <QueryClientProvider client={client}>
        <SessionContext value={{ session, setSession: () => undefined }}>
          <MasterTab kind="grouping_kind" />
        </SessionContext>
      </QueryClientProvider>,
    );
    expect(text(html)).toContain('SYN-REGION');
    expect(text(html)).toContain('No version yet');
  });
});

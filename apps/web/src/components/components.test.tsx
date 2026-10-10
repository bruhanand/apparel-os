import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Banner } from './Banner';
import { EmptyState, ErrorState, LoadingState } from './StandardStates';
import { StatusBadge } from './StatusBadge';
import { UnavailableState } from './UnavailableState';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('StatusBadge (design-language 7, 10.2)', () => {
  it('shows the glyph and the word of the state, never the colour alone', () => {
    const html = renderToStaticMarkup(<StatusBadge state="awaiting-approval" />);
    expect(text(html)).toBe('◔ Awaiting approval');
    expect(html).toContain('bg-i-bg');
  });

  it('hugs its text, even inside a column that stretches its children (visual review finding 4)', () => {
    expect(renderToStaticMarkup(<StatusBadge state="in-force" />)).toMatch(/class="[^"]*\bw-fit\b[^"]*\bself-start\b/);
  });
});

describe('the standard states (design-language 10.13)', () => {
  it('empty: says why the list is empty and what to do next', () => {
    expect(text(renderToStaticMarkup(<EmptyState title="screen.not-built.title" body="screen.not-built.body" />))).toBe(
      '0 This screen is not built yet It arrives with a later piece of stage 1 work. Nothing here can change a record.',
    );
  });

  it('empty: the neutral mark of design-system 3.7, a bordered sunken circle with its glyph, not a plain disc', () => {
    const html = renderToStaticMarkup(<EmptyState title="screen.not-built.title" body="screen.not-built.body" />);
    const mark = /<span aria-hidden="true"[^>]*>([^<]*)<\/span>/.exec(html);
    expect(mark?.[0]).toContain('border-border');
    expect(mark?.[0]).toContain('bg-sunken');
    expect(mark?.[1]).toBe('0');
  });

  it('loading: skeleton rows marked busy', () => {
    const html = renderToStaticMarkup(<LoadingState rows={3} />);
    expect(html).toContain('aria-busy="true"');
    expect(html.match(/skeleton/g)).toHaveLength(3);
  });

  it('error: an alert with the cause from the code, the reference in its display form and Retry', () => {
    const html = renderToStaticMarkup(
      <ErrorState
        what="screen.setup.users"
        error={{ kind: 'timed-out', code: 'kernel.timed-out', reference: '0199b3c4-5d6e-7f80-91a2-b3c4d5e6f7a8' }}
        onRetry={() => undefined}
      />,
    );
    expect(html).toContain('role="alert"');
    expect(text(html)).toBe(
      '✕ Couldn’t load Users This took too long and nothing was saved. Send it again. Reference ERR-E6F7A8 Retry',
    );
  });

  it('error with no answer from the server says so, with no reference', () => {
    expect(
      text(renderToStaticMarkup(<ErrorState what="screen.setup.users" error={null} onRetry={() => undefined} />)),
    ).toBe('✕ Couldn’t load Users The server did not answer. Check the connection and try again. Retry');
  });
});

describe('UnavailableState (design-language 10.17; PRD-UXP-003)', () => {
  it('names what is missing, item by item, and where to look next', () => {
    const html = renderToStaticMarkup(
      <UnavailableState
        missing={[
          { kind: 'policy', policy: '2', lacks: 'signature' },
          { kind: 'scope', dimension: 'place', id: 'x' },
        ]}
      />,
    );
    expect(text(html)).toBe(
      '! Live action unavailable 2 things are missing Policy 2 · Permissions and approvals is not signed. None of your role assignments covers the record’s scope. See Setup › Policy readiness',
    );
    expect(html).toContain('bg-w-bg');
  });

  it('PRD-SEC-017 names the policy by number and name, what it lacks, and links to it on Policy readiness (S1-F04-T01)', () => {
    const html = renderToStaticMarkup(
      <UnavailableState
        missing={[
          { kind: 'capability', capability: 'test-syn-gate.feature' },
          { kind: 'policy', policy: '14', lacks: 'signature' },
          { kind: 'policy', policy: '14', lacks: 'validation' },
          { kind: 'activity', activity: 'receiving', placeType: 'site', placeId: 'x' },
        ]}
      />,
    );
    expect(text(html)).toBe(
      '! Live action unavailable 4 things are missing The capability test-syn-gate.feature is switched off. Policy 14 · Opening and cutover is not signed. Policy 14 · Opening and cutover: its real values are not validated by a person who did not enter them. Receiving is not granted to the Site x. See Setup › Policy readiness',
    );
    expect(html).toContain('href="/setup/policy-readiness?policy=14"');
  });

  it('PRD-UXP-003 names the place a scope stops short of, by its code (S1-F02-T03)', () => {
    const html = renderToStaticMarkup(
      <UnavailableState
        missing={[
          { kind: 'scope', dimension: 'place', factType: 'store', factId: 'x', factCode: 'SYN-STORE-2' },
          { kind: 'scope', dimension: 'legal-entity', factType: 'legal-entity', factId: 'y' },
        ]}
      />,
    );
    expect(text(html)).toContain('None of your role assignments covers the Store SYN-STORE-2.');
    expect(text(html)).toContain('None of your role assignments covers the legal entity y.');
  });

  it('PRD-UXP-003 names the missing permission: the action and the record type (S1-F01-AT18)', () => {
    const html = renderToStaticMarkup(
      <UnavailableState
        missing={[
          { kind: 'action', action: 'view', recordType: 'access.role' },
          { kind: 'permission', action: 'approve', recordType: 'access.user' },
        ]}
      />,
    );
    expect(text(html)).toContain('Needs View on Role.');
    expect(text(html)).toContain('Needs Approve on User.');
  });

  it('a missing permission is not a policy gate: its own title, who to ask, and no Policy readiness link (visual review finding 6)', () => {
    const html = renderToStaticMarkup(
      <UnavailableState missing={[{ kind: 'action', action: 'view', recordType: 'access.role' }]} />,
    );
    expect(text(html)).toBe(
      '! Not available to you Needs View on Role. Ask an Admin for a role assignment that grants it.',
    );
    expect(text(html)).not.toContain('Live action unavailable');
    expect(text(html)).not.toContain('Policy readiness');
  });

  it('names an item of a kind it has no text for as something missing, never nothing', () => {
    expect(text(renderToStaticMarkup(<UnavailableState missing={[{ kind: 'new-kind' }]} />))).toContain(
      'Something it needs is missing.',
    );
  });
});

describe('Banner (design-language 10.12)', () => {
  it('shows its glyph beside its text: info (i), success, warning, danger', () => {
    expect(text(renderToStaticMarkup(<Banner tone="info" message="environment.dev" />))).toBe(
      'i dev · SYNTHETIC data only',
    );
  });
});

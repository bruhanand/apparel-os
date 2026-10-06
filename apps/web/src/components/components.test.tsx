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
});

describe('the standard states (design-language 10.13)', () => {
  it('empty: says why the list is empty and what to do next', () => {
    expect(text(renderToStaticMarkup(<EmptyState title="screen.not-built.title" body="screen.not-built.body" />))).toBe(
      'This screen is not built yet It arrives with a later piece of stage 1 work. Nothing here can change a record.',
    );
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
      '! Live action unavailable 2 things are missing The policy it depends on is not signed, or its values are not configured. None of your role assignments covers the record’s scope. See Setup › Policy readiness',
    );
    expect(html).toContain('bg-w-bg');
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

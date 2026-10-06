import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { AppShell } from './AppShell';
import type { Grant } from './screens';
import type { ShellSession } from './session';

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

// SYNTHETIC: a display name and grants for a synthetic first Admin; none is a KDPS value.
const grants: Grant[] = (['access.user', 'access.role', 'access.role_assignment'] as const).map((recordType) => ({
  recordType,
  action: 'view',
}));
const user = { displayName: 'SYNTHETIC Admin', personasHeld: ['P-ADM'] } as const;
const banner = { environment: 'dev', message: 'environment.dev', tone: 'info' } as const;

function render(session: ShellSession) {
  return renderToStaticMarkup(
    <AppShell session={session} banner={banner} current="setup.users">
      <form>
        <input name="typed" defaultValue="kept" />
      </form>
    </AppShell>,
  );
}

describe('AppShell (design-language 6 A)', () => {
  it('PRD-ACS-002 lists in the sidebar only the screens the role assignments grant, and My work', () => {
    const html = render({ state: 'active', user, grants });
    const nav = /<nav[^>]*>(.*?)<\/nav>/s.exec(html)?.[1] ?? '';
    expect(text(nav)).toBe('Home My work Setup Users Roles Role assignments');
  });

  it('puts the skip link first and the environment banner on every screen', () => {
    const html = render({ state: 'active', user, grants });
    expect(text(html).startsWith('Skip to content i dev · SYNTHETIC data only')).toBe(true);
    expect(
      text(renderToStaticMarkup(<AppShell session={{ state: 'signed-out' }} banner={banner} current={null} />)),
    ).toContain('dev · SYNTHETIC data only');
  });

  it('shows the personas held as chips with their IDs (design-language 10.18)', () => {
    expect(text(render({ state: 'active', user, grants }))).toContain('P-ADM Admin');
  });

  it('PRD-ACS-017 covers a locked page with the lock overlay and keeps the page and its input underneath', () => {
    const html = render({ state: 'locked', user, grants });
    expect(html).toContain('role="dialog"');
    expect(text(html)).toContain('Session locked');
    expect(html).toMatch(/<div[^>]*inert=""[^>]*>.*value="kept"/s);
  });

  it('shows no screen and no menu while signed out', () => {
    const html = renderToStaticMarkup(<AppShell session={{ state: 'signed-out' }} banner={banner} current={null} />);
    expect(html).not.toContain('<nav');
    expect(text(html)).toContain('Sign in to continue');
  });
});

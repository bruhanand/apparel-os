import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Button } from '../components/Button';
import { AppShell, PersonaChip } from './AppShell';
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
const user = {
  organisationCode: 'SYN-ORG-A',
  userId: '01900000-0000-7000-8000-0000000000a1',
  displayName: 'SYNTHETIC Admin',
  personasHeld: ['P-ADM'],
  roleAssignmentInForce: true,
  timeZone: 'UTC',
} as const;
const banner = { environment: 'dev', message: 'environment.dev', tone: 'info' } as const;

function render(session: ShellSession, menuOpen = false) {
  return renderToStaticMarkup(
    <AppShell
      session={session}
      banner={banner}
      current="setup.users"
      defaultMenuOpen={menuOpen}
      signOut={<Button label="shell.sign-out" />}
    >
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

  it('never breaks a persona ID across lines, however long the name (visual review finding 2)', () => {
    const html = renderToStaticMarkup(<PersonaChip persona="P-CHA" />);
    expect(html).toMatch(/<span class="[^"]*whitespace-nowrap[^"]*">P-CHA<\/span>/);
  });

  it('PRD-ACS-017 covers a locked page with the lock overlay and keeps the page and its input underneath', () => {
    const html = render({ state: 'locked', user, grants });
    expect(html).toContain('role="dialog"');
    expect(text(html)).toContain('Session locked');
    expect(html).toMatch(/<div[^>]*inert=""[^>]*>.*value="kept"/s);
  });

  it('PRD-ACS-002 shows only "No access assigned" and Sign out, with no menu, to a person with no role assignment in force (DEC-118; RR-260)', () => {
    const html = renderToStaticMarkup(
      <AppShell
        session={{ state: 'active', user: { ...user, roleAssignmentInForce: false }, grants: [] }}
        banner={banner}
        current="my-work"
        signOut={<Button label="shell.sign-out" />}
      >
        <form>
          <input name="typed" defaultValue="screen" />
        </form>
      </AppShell>,
    );
    expect(html).not.toContain('<nav');
    expect(html).not.toContain('value="screen"');
    expect(text(html)).toContain('No access assigned');
    expect(text(html)).toContain('An Admin must assign you a role');
    expect(text(html)).toContain('Sign out');
  });

  // S1-F01-T32 (design-language 6 A, 6 D; test report F5). A static render has no screen width, so the phone width
  // is read from the classes Tailwind turns into its media queries: `max-sm:hidden` hides below 640 px, `sm:hidden`
  // from 640 px up. The browser journeys check the same at 375 px.
  describe('at phone width (design-language 6 D)', () => {
    const topBar = (html: string) => /<header[^>]*data-testid="top-bar"[^>]*>(.*?)<\/header>/s.exec(html)?.[1] ?? '';
    const aside = (html: string) => /<aside[^>]*>(.*?)<\/aside>/s.exec(html)?.[1] ?? '';
    const tag = (html: string, testId: string) =>
      new RegExp(`<[^>]*data-testid="${testId}"[^>]*>`).exec(html)?.[0] ?? '';

    it('keeps in the top bar only the menu, the logo slot and My work: the name and profile menu are hidden', () => {
      const html = topBar(render({ state: 'active', user, grants }));
      expect(html).toContain('aria-label="Logo"');
      expect(text(html)).toContain('Open menu');
      expect(text(html)).toContain('My work');
      expect(tag(html, 'top-bar-account')).toContain('max-sm:hidden');
      expect(html.slice(html.indexOf('data-testid="top-bar-account"'))).toContain('SYNTHETIC Admin');
    });

    it('puts the profile at the bottom of the left drawer, after the menu: name, personas held, theme and Sign out', () => {
      const html = aside(render({ state: 'active', user, grants }, true));
      const profile = html.slice(html.indexOf('data-testid="drawer-profile"'));
      expect(html.indexOf('aria-label="Main menu"')).toBeLessThan(html.indexOf('data-testid="drawer-profile"'));
      expect(text(profile)).toContain('SYNTHETIC Admin');
      expect(text(profile)).toContain('P-ADM Admin');
      expect(text(profile)).toContain('Sign out');
      expect(tag(html, 'drawer-profile')).toMatch(/class="[^"]*\bsm:hidden\b/);
    });

    it('has one profile while the menu is closed, so desktop and the journeys find exactly one', () => {
      const html = render({ state: 'active', user, grants });
      expect(html.match(/aria-label="Profile"/g)).toHaveLength(1);
      expect(html).not.toContain('data-testid="drawer-profile"');
    });
  });

  it('shows no screen and no menu while signed out', () => {
    const html = renderToStaticMarkup(<AppShell session={{ state: 'signed-out' }} banner={banner} current={null} />);
    expect(html).not.toContain('<nav');
    expect(text(html)).toContain('Sign in to continue');
  });
});

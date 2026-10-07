import type { PersonaId } from '@apparel-os/schemas';
import { cn } from '@apparel-os/ui';
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/StandardStates';
import { LockOverlay } from '../lock/LockOverlay';
import { t } from '../messages/catalogue';
import type { EnvironmentBanner } from './environment';
import { landingScreen } from './landing';
import { NoAccessAssigned } from './NoAccessAssigned';
import { openScreens, screens, sections, type ScreenId } from './screens';
import type { ShellSession } from './session';
import { ThemeSwitch } from './ThemeSwitch';

/** Renders a link to a screen; the router passes its own link so navigation stays in the page. */
export type RenderLink = (id: ScreenId, className: string, children: ReactNode) => ReactNode;

const anchor: RenderLink = (id, className, children) => (
  <a href={screens[id].path} className={className}>
    {children}
  </a>
);

/**
 * A persona chip: mono ID and name in Neutral (design-language 10.18). The ID never breaks across lines; a long name
 * may wrap beside it, and the chip then grows from its 24 px height.
 */
export function PersonaChip({ persona }: { persona: PersonaId }) {
  return (
    <span className="inline-flex min-h-6 w-fit items-center gap-1 rounded-[12px] bg-n-bg px-2 py-0.5 text-caption text-n-fg">
      <span className="shrink-0 whitespace-nowrap font-mono">{persona}</span>
      <span>{t(`persona.${persona}`)}</span>
    </span>
  );
}

/**
 * Keeps the CSS variable `--banner-h` on <html> equal to the environment banner's height, so the sticky top bar sits
 * under the banner and every overlay (drawer, dialog, lock) starts at the banner's lower edge, the banner staying
 * visible above it (design-language 5, 6 A "As built").
 */
function useBannerHeight() {
  const banner = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = banner.current;
    if (element === null) return undefined;
    const set = () => {
      document.documentElement.style.setProperty('--banner-h', `${String(element.offsetHeight)}px`);
    };
    set();
    const observer = new ResizeObserver(set);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return banner;
}

/**
 * The back-office shell (design-language 6 A): skip link, environment banner, glass top bar, a solid sidebar listing
 * only what the person's role assignments grant (PRD-ACS-002), the page header and the screen. A locked session keeps
 * the page, inert, under the lock overlay (access-and-approvals 3.3). Signed out, it shows no menu and no screen: only the sign-in screens.
 * The scope chip and the search field arrive with the records they act on (S1-F02, S1-F03).
 */
export function AppShell({
  session,
  banner,
  current,
  children,
  renderLink = anchor,
  unlock,
  signIn,
  signOut,
  myWork,
}: {
  session: ShellSession;
  banner: EnvironmentBanner;
  current: ScreenId | null;
  children?: ReactNode;
  renderLink?: RenderLink;
  /** The unlock form of the lock screen (S1-F01-T09). */
  unlock?: ReactNode;
  /** The sign-in screens, shown while signed out (S1-F01-T15). */
  signIn?: ReactNode;
  /** The sign-out action of the profile menu (S1-F01-T09). */
  signOut?: ReactNode;
  /** The My work counter of the top bar (design-language 10.5; S1-F01-T16); the plain label without it. */
  myWork?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const bannerRef = useBannerHeight();
  return (
    <div className="flex min-h-screen flex-col bg-bg text-text">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-2">
        {t('shell.skip-to-content')}
      </a>
      <div ref={bannerRef} className="sticky top-0 z-30" data-testid="environment-banner">
        <Banner tone={banner.tone} message={banner.message} />
      </div>
      {session.state === 'signed-out' ? (
        <main id="content" className="flex-1 p-4 sm:p-8">
          {signIn ?? <EmptyState title="session.signed-out.title" body="session.signed-out.body" />}
        </main>
      ) : landingScreen(session.user.roleAssignmentInForce, session.user.personasHeld, session.grants) ===
        'no-access-assigned' ? (
        <>
          <main id="content" className="flex-1 p-4 sm:p-8" inert={session.state === 'locked'}>
            <NoAccessAssigned signOut={signOut} />
          </main>
          {session.state === 'locked' && <LockOverlay>{unlock}</LockOverlay>}
        </>
      ) : (
        <>
          <div className="flex flex-1 flex-col" inert={session.state === 'locked'}>
            <header
              data-testid="top-bar"
              className="glass sticky top-[var(--banner-h)] z-30 flex h-14 items-center gap-4 border-b px-4"
            >
              <button
                type="button"
                className="h-9 rounded-control px-2 text-accent lg:hidden"
                aria-expanded={menuOpen}
                onClick={() => {
                  setMenuOpen(!menuOpen);
                }}
              >
                {t(menuOpen ? 'shell.close-menu' : 'shell.open-menu')}
              </button>
              <span role="img" aria-label={t('shell.logo')} className="h-8 w-[200px] max-w-[30vw]" />
              <span className="flex-1" />
              {renderLink(
                'my-work',
                'text-body-sm font-medium text-text hover:text-accent',
                myWork ?? t('my-work.label'),
              )}
              <ThemeSwitch />
              <details className="relative">
                <summary className="cursor-pointer list-none text-body-sm font-medium" aria-label={t('shell.profile')}>
                  {session.user.displayName}
                </summary>
                <div className="absolute right-0 mt-2 flex w-64 flex-col gap-2 rounded-card border border-border bg-raised p-3 shadow-e2">
                  <span className="text-label font-semibold text-text-2">{t('shell.personas-held')}</span>
                  {session.user.personasHeld.map((persona) => (
                    <PersonaChip key={persona} persona={persona} />
                  ))}
                  {signOut}
                </div>
              </details>
            </header>
            <div className="flex flex-1">
              <aside
                className={cn(
                  'border-r border-border bg-surface',
                  collapsed ? 'lg:w-16' : 'lg:w-[232px]',
                  menuOpen
                    ? 'glass fixed bottom-0 left-0 top-[calc(var(--banner-h)+56px)] z-20 block w-[300px]'
                    : 'hidden lg:block',
                )}
              >
                <nav
                  aria-label={t('shell.main-menu')}
                  className={cn('flex flex-col gap-4 p-3', collapsed && 'lg:sr-only')}
                >
                  {sections.map((section) => {
                    const items = openScreens(session.grants).filter((id) => screens[id].section === section);
                    if (items.length === 0) return null;
                    return (
                      <div key={section} className="flex flex-col gap-1">
                        <h2 className="px-2 text-label font-semibold text-text-2">{t(`section.${section}`)}</h2>
                        {items.map((id) => (
                          <span key={id}>
                            {renderLink(
                              id,
                              cn(
                                'block rounded-control px-2 py-2 text-body',
                                id === current ? 'bg-tint font-semibold text-on-tint' : 'hover:bg-hover',
                              ),
                              t(`screen.${id}`),
                            )}
                          </span>
                        ))}
                      </div>
                    );
                  })}
                </nav>
                <button
                  type="button"
                  className="hidden h-9 w-full text-caption text-text-3 lg:block"
                  onClick={() => {
                    setCollapsed(!collapsed);
                  }}
                >
                  {t(collapsed ? 'shell.expand-menu' : 'shell.collapse-menu')}
                </button>
              </aside>
              <main id="content" className="min-w-0 flex-1 p-8">
                {current !== null && (
                  <header className="mb-6 flex flex-col gap-1">
                    <nav aria-label={t('shell.breadcrumb')} className="text-body-sm text-text-2">
                      {t(`section.${screens[current].section}`)}
                    </nav>
                    <h1 className="text-title font-semibold">{t(`screen.${current}`)}</h1>
                  </header>
                )}
                {children}
              </main>
            </div>
          </div>
          {session.state === 'locked' && <LockOverlay>{unlock}</LockOverlay>}
        </>
      )}
    </div>
  );
}

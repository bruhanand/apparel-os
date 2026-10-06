import type { PersonaId } from '@apparel-os/schemas';
import { cn } from '@apparel-os/ui';
import { useState, type ReactNode } from 'react';
import { Banner } from '../components/Banner';
import { EmptyState } from '../components/StandardStates';
import { LockOverlay } from '../lock/LockOverlay';
import { t } from '../messages/catalogue';
import type { EnvironmentBanner } from './environment';
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

/** A persona chip: mono ID and name in Neutral (design-language 10.18). */
export function PersonaChip({ persona }: { persona: PersonaId }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-n-bg px-2 text-caption text-n-fg">
      <span className="font-mono">{persona}</span>
      <span>{t(`persona.${persona}`)}</span>
    </span>
  );
}

/**
 * The back-office shell (design-language 6 A): skip link, environment banner, glass top bar, a solid sidebar listing
 * only what the person's role assignments grant (PRD-ACS-002), the page header and the screen. A locked session keeps
 * the page, inert, under the lock overlay (access-and-approvals 3.3). Signed out, it shows no menu and no screen.
 * The scope chip and the search field arrive with the records they act on (S1-F02, S1-F03).
 */
export function AppShell({
  session,
  banner,
  current,
  children,
  renderLink = anchor,
  unlock,
}: {
  session: ShellSession;
  banner: EnvironmentBanner;
  current: ScreenId | null;
  children?: ReactNode;
  renderLink?: RenderLink;
  /** The unlock form of the lock screen (S1-F01-T09). */
  unlock?: ReactNode;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="min-h-screen bg-bg text-text">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-surface focus:p-2">
        {t('shell.skip-to-content')}
      </a>
      <Banner tone={banner.tone} message={banner.message} />
      {session.state === 'signed-out' ? (
        <main id="content" className="p-8">
          <EmptyState title="session.signed-out.title" body="session.signed-out.body" />
        </main>
      ) : (
        <>
          <div inert={session.state === 'locked'}>
            <header className="glass sticky top-0 z-30 flex h-14 items-center gap-4 border-b px-4">
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
              {renderLink('my-work', 'text-body-sm font-medium text-text hover:text-accent', t('my-work.label'))}
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
                </div>
              </details>
            </header>
            <div className="flex">
              <aside
                className={cn(
                  'min-h-[calc(100vh-56px)] border-r border-border bg-surface',
                  collapsed ? 'lg:w-16' : 'lg:w-[232px]',
                  menuOpen ? 'glass fixed inset-y-14 left-0 z-20 block w-[300px]' : 'hidden lg:block',
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

import {
  createRootRoute,
  createRoute,
  createRouter,
  Link,
  Navigate,
  Outlet,
  useRouterState,
} from '@tanstack/react-router';
import { EmptyState } from './components/StandardStates';
import { UnavailableState } from './components/UnavailableState';
import { banner } from './banner';
import { AppShell, type RenderLink } from './shell/AppShell';
import { landingScreen } from './shell/landing';
import { screenIds, screenOpen, screens, type ScreenId } from './shell/screens';
import { useSession } from './shell/session';

// The router (PRD Stack: Web, TanStack Router): one route per screen of the registry, and `/`, which sends the person
// to their landing screen (DEC-116).

const renderLink: RenderLink = (id, className, children) => (
  <Link to={screens[id].path} className={className}>
    {children}
  </Link>
);

function screenAt(pathname: string): ScreenId | null {
  return screenIds.find((id) => screens[id].path === pathname) ?? null;
}

function Root() {
  const { session } = useSession();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  return (
    <AppShell session={session} banner={banner} current={screenAt(pathname)} renderLink={renderLink}>
      <Outlet />
    </AppShell>
  );
}

/** `/`: the landing screen of the first persona held (DEC-116; personas.md section 2 "Landing"). */
function Landing() {
  const { session } = useSession();
  if (session.state === 'signed-out') return null;
  return <Navigate to={screens[landingScreen(session.user.personasHeld, session.grants)].path} replace />;
}

/**
 * A screen of the registry. One the person's role assignments do not grant is unavailable and says what is missing
 * (PRD-UXP-003); the screens themselves arrive with S1-F01-T16 and T18.
 */
function ScreenPage({ id }: { id: ScreenId }) {
  const { session } = useSession();
  if (session.state === 'signed-out') return null;
  const need = screens[id].need;
  if (!screenOpen(id, session.grants) && need.kind === 'grant') {
    return (
      <UnavailableState missing={[{ kind: 'action', action: need.grant.action, recordType: need.grant.recordType }]} />
    );
  }
  return <EmptyState title="screen.not-built.title" body="screen.not-built.body" />;
}

function NotFound() {
  return <EmptyState title="screen.not-found.title" body="screen.not-found.body" />;
}

const rootRoute = createRootRoute({ component: Root, notFoundComponent: NotFound });

const routeTree = rootRoute.addChildren([
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: Landing }),
  ...screenIds.map((id) =>
    createRoute({
      getParentRoute: () => rootRoute,
      path: screens[id].path,
      component: () => <ScreenPage id={id} />,
    }),
  ),
]);

export const router = createRouter({ routeTree });

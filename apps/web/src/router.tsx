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
import { AuditLogScreen } from './history/AuditLogScreen';
import { GeographyScreen, OrganisationStructureScreen } from './organisation/StructureScreens';
import { VocabulariesScreen } from './merchandise/VocabulariesScreen';
import { ProductsScreen } from './merchandise/ProductsScreen';
import { TrackingProfilesScreen } from './merchandise/TrackingProfilesScreen';
import { SuppliersScreen } from './merchandise/SuppliersScreen';
import { AgreementScreen } from './merchandise/AgreementScreen';
import { MyWorkCount, MyWorkScreen } from './inbox/MyWorkScreen';
import { ExceptionRulesScreen } from './exceptions/ExceptionRulesScreen';
import { FailedJobsScreen } from './operations/FailedJobsScreen';
import { ApprovalLimitsScreen } from './setup/ApprovalLimitsScreen';
import { AssignmentsScreen } from './setup/AssignmentsScreen';
import { ReasonsScreen } from './setup/ReasonsScreen';
import { RolesScreen } from './setup/RolesScreen';
import { PolicyReadinessScreen } from './setup/PolicyReadinessScreen';
import { SecuritySettingsScreen } from './setup/SecuritySettingsScreen';
import { UsersScreen } from './setup/UsersScreen';
import { AppShell, type RenderLink } from './shell/AppShell';
import { landingScreen } from './shell/landing';
import { screenIds, screenOpen, screens, type ScreenId } from './shell/screens';
import { useSession } from './shell/session';
import { SignInScreens } from './sign-in/SignInScreens';
import { SignOutButton } from './lock/SignOutButton';
import { UnlockForm } from './lock/UnlockForm';

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
    <AppShell
      session={session}
      banner={banner}
      current={screenAt(pathname)}
      renderLink={renderLink}
      signIn={<SignInScreens />}
      unlock={<UnlockForm />}
      signOut={<SignOutButton />}
      myWork={<MyWorkCount />}
    >
      <Outlet />
    </AppShell>
  );
}

/** `/`: the landing screen of the first persona held (DEC-116; personas.md section 2 "Landing"). */
function Landing() {
  const { session } = useSession();
  if (session.state === 'signed-out') return null;
  const landing = landingScreen(session.user.roleAssignmentInForce, session.user.personasHeld, session.grants);
  // "No access assigned" is the shell's own page, whatever the address (AppShell; DEC-118, RR-260).
  if (landing === 'no-access-assigned') return null;
  return <Navigate to={screens[landing].path} replace />;
}

/**
 * A screen of the registry. One the person's role assignments do not grant is unavailable and says what is missing
 * (PRD-UXP-003). Setup › Audit log is S1-F01-T18's; My work and the access setup screens are S1-F01-T16's.
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
  switch (id) {
    case 'my-work':
      return <MyWorkScreen />;
    case 'setup.users':
      return <UsersScreen />;
    case 'setup.roles':
      return <RolesScreen />;
    case 'setup.role-assignments':
      return <AssignmentsScreen />;
    case 'setup.reason-codes':
      return <ReasonsScreen />;
    case 'setup.approval-limits':
      return <ApprovalLimitsScreen />;
    case 'setup.security-settings':
      return <SecuritySettingsScreen />;
    case 'setup.organisation-structure':
      return <OrganisationStructureScreen />;
    case 'setup.geography':
      return <GeographyScreen />;
    case 'setup.vocabularies':
      return <VocabulariesScreen />;
    case 'setup.products':
      return <ProductsScreen />;
    case 'setup.merchandise-tracking-profiles':
      return <TrackingProfilesScreen />;
    case 'setup.suppliers-and-agreements':
      return <SuppliersScreen />;
    case 'setup.agreement':
      return <AgreementScreen />;
    case 'setup.exception-rules':
      return <ExceptionRulesScreen />;
    case 'setup.operations':
      return <FailedJobsScreen />;
    case 'setup.policy-readiness':
      return <PolicyReadinessScreen />;
    case 'setup.audit-log':
      return <AuditLogScreen grants={session.grants} />;
    default:
      break;
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

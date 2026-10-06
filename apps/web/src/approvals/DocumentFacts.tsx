import type { ApprovalRequestView } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { api } from '../api';
import { readQuery } from '../api/query';
import { t, type MessageId } from '../messages/catalogue';
import { PersonaChip } from '../shell/AppShell';
import { useSession } from '../shell/session';
import { permissionText, scopeText } from '../setup/describe';
import { formatDate } from '../setup/format';

// The material facts of the version an approval request binds to (PRD-ACS-007; access-and-approvals 9.1; spec
// section 5 step 6), read through the same lists the access setup screens use, where the reader's role assignments
// grant them. Shown as read-only fields on the approval panel (design-language 10.14).

function Fact({ label, children }: { label: MessageId; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-label font-semibold text-text-2">{t(label)}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

function Facts({ children }: { children: ReactNode }) {
  return <dl className="grid gap-3 rounded-card border border-border bg-raised p-3 sm:grid-cols-2">{children}</dl>;
}

function dates(validFrom: string, validTo: string | undefined): string {
  return validTo === undefined
    ? t('dates.from', { from: formatDate(validFrom) })
    : t('dates.between', { from: formatDate(validFrom), to: formatDate(validTo) });
}

function useViewable(recordType: string): boolean {
  const { session } = useSession();
  if (session.state === 'signed-out') return false;
  return session.grants.some((grant) => grant.recordType === recordType && grant.action === 'view');
}

function UserFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({ ...readQuery(api, 'listUsers', {}), enabled: useViewable('access.user') });
  const user = query.data?.users.find((each) => each.id === view.document.recordId);
  const version = user?.versions.find((each) => each.id === view.document.versionId);
  if (user === undefined || version === undefined) return null;
  return (
    <Facts>
      <Fact label="user.login">
        <span className="font-mono">{user.login}</span>
      </Fact>
      <Fact label="user.display-name">{version.displayName}</Fact>
      <Fact label="user.personas">
        <span className="flex flex-wrap gap-1">
          {version.personas.map((persona) => (
            <PersonaChip key={persona} persona={persona} />
          ))}
        </span>
      </Fact>
      <Fact label="user.state">{t(`user-state.${version.userState}`)}</Fact>
    </Facts>
  );
}

function RoleFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({ ...readQuery(api, 'listRoles', {}), enabled: useViewable('access.role') });
  const role = query.data?.roles.find((each) => each.id === view.document.recordId);
  const version = role?.versions.find((each) => each.id === view.document.versionId);
  if (role === undefined || version === undefined) return null;
  return (
    <Facts>
      <Fact label="role.code">
        <span className="font-mono">{role.code}</span>
      </Fact>
      <Fact label="role.name">{version.name}</Fact>
      <Fact label="dates.label">{dates(version.validFrom, version.validTo)}</Fact>
      <Fact label="role.permissions">
        <ul className="m-0 list-none p-0">
          {version.permissions.map((permission, index) => (
            <li key={index}>{permissionText(permission)}</li>
          ))}
        </ul>
      </Fact>
    </Facts>
  );
}

function AssignmentFacts({ view, withdrawal }: { view: ApprovalRequestView; withdrawal: boolean }) {
  const query = useQuery({
    ...readQuery(api, 'listRoleAssignments', {}),
    enabled: useViewable('access.role_assignment'),
  });
  const assignment = query.data?.assignments.find((each) =>
    withdrawal ? each.withdrawal?.id === view.document.recordId : each.id === view.document.recordId,
  );
  if (assignment === undefined) return null;
  return (
    <Facts>
      <Fact label="assignment.actor">
        {assignment.actor.kind === 'user' ? (assignment.actor.name ?? assignment.actor.userId) : assignment.actor.code}
      </Fact>
      <Fact label="assignment.role">
        <span className="font-mono">{assignment.role.code}</span>
      </Fact>
      <Fact label="assignment.scope">{scopeText(assignment.scope)}</Fact>
      <Fact label="dates.label">{dates(assignment.validFrom, assignment.validTo)}</Fact>
      {withdrawal && assignment.withdrawal !== undefined && (
        <Fact label="assignment.withdrawal-reason">{assignment.withdrawal.reason}</Fact>
      )}
    </Facts>
  );
}

function ReasonFacts({ view }: { view: ApprovalRequestView }) {
  const query = useQuery({
    ...readQuery(api, 'listApprovalReasonRecords', {}),
    enabled: useViewable('access.approval_reason'),
  });
  const reason = query.data?.reasons.find((each) => each.id === view.document.recordId);
  const version = reason?.versions.find((each) => each.id === view.document.versionId);
  if (reason === undefined || version === undefined) return null;
  return (
    <Facts>
      <Fact label="reason.code">
        <span className="font-mono">{reason.code}</span>
      </Fact>
      <Fact label="reason.kind">{t(`reason.kind.${reason.kind}`)}</Fact>
      <Fact label="reason.text">{version.text}</Fact>
      <Fact label="dates.label">{dates(version.validFrom, version.validTo)}</Fact>
    </Facts>
  );
}

/** The facts of the request's version, by its action type; nothing where the reader may not read them. */
export function DocumentFacts({ view }: { view: ApprovalRequestView }) {
  switch (view.actionType) {
    case 'access.user.change':
      return <UserFacts view={view} />;
    case 'access.role.change':
      return <RoleFacts view={view} />;
    case 'access.role_assignment.change':
      return <AssignmentFacts view={view} withdrawal={false} />;
    case 'access.role_assignment.withdrawal':
      return <AssignmentFacts view={view} withdrawal />;
    case 'access.approval_reason.change':
      return <ReasonFacts view={view} />;
    default:
      return null;
  }
}

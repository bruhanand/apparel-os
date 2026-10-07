import type { ApprovalRequestView, WorkItem } from '@apparel-os/schemas';
import { useQueries, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import { readQuery } from '../api/query';
import { useSession } from '../shell/session';
import { approvalSubject, type ApprovalSubject, type SubjectLists } from './subject';

// The reads behind the subjects of approval requests (subject.ts): each list only where the reader's role assignments
// grant view on its type, so nothing is asked that would be refused. The query keys are the screens' own, so the
// approval panel and the setup screens share what was read.

function useViewable(): (recordType: string) => boolean {
  const { session } = useSession();
  const grants = session.state === 'signed-out' ? [] : session.grants;
  return (recordType) => grants.some((grant) => grant.recordType === recordType && grant.action === 'view');
}

/** The lists a subject is named from, read where granted. */
export function useSubjectLists(): SubjectLists {
  const viewable = useViewable();
  const users = useQuery({ ...readQuery(api, 'listUsers', {}), enabled: viewable('access.user') });
  const roles = useQuery({ ...readQuery(api, 'listRoles', {}), enabled: viewable('access.role') });
  const assignments = useQuery({
    ...readQuery(api, 'listRoleAssignments', {}),
    enabled: viewable('access.role_assignment'),
  });
  const reasons = useQuery({
    ...readQuery(api, 'listApprovalReasonRecords', {}),
    enabled: viewable('access.approval_reason'),
  });
  const settings = useQuery({ ...readQuery(api, 'listSecuritySettings', {}), enabled: viewable('access.setting') });
  return {
    users: users.data,
    roles: roles.data,
    assignments: assignments.data,
    reasons: reasons.data,
    settings: settings.data,
  };
}

/** The reads a subject is named from, for a refresh to read again. */
export const subjectReads = [
  'readApprovalRequest',
  'listUsers',
  'listRoles',
  'listRoleAssignments',
  'listApprovalReasonRecords',
  'listSecuritySettings',
] as const;

/** The request read of one approval, shared with its panel. */
export function approvalRead(requestId: string) {
  return readQuery(api, 'readApprovalRequest', { params: { requestId } });
}

/**
 * The subject of each approval item of My work, by item identifier: read from its request where the reader may view
 * approval requests; an item whose request is not read yet, or may not be, has none and shows its kind.
 */
export function useApprovalSubjects(items: readonly WorkItem[]): ReadonlyMap<string, ApprovalSubject> {
  const viewable = useViewable();
  const approvals = items.filter((item) => item.kind === 'approval');
  const requests = useQueries({
    queries: approvals.map((item) => ({
      ...approvalRead(item.owner.recordId),
      enabled: viewable('access.approval_request'),
    })),
  });
  const lists = useSubjectLists();
  const subjects = new Map<string, ApprovalSubject>();
  approvals.forEach((item, index) => {
    const view: ApprovalRequestView | undefined = requests[index]?.data;
    if (view !== undefined) subjects.set(item.id, approvalSubject(view, lists));
  });
  return subjects;
}

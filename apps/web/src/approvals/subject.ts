import type {
  ApprovalRequestView,
  AssignmentList,
  ReasonList,
  RoleList,
  SecuritySettings,
  UserList,
} from '@apparel-os/schemas';
import { isMessageId, t } from '../messages/catalogue';

// What an approval request is for, in words (access-and-approvals 9.1, 11.2; design-language 10.5, 10.14; visual
// review finding 3): the action on the record, the record by its name, and who prepared it when. The names come from
// the same list reads the access setup screens use, and only where the reader's role assignments grant them; where
// they do not, the subject says only what the request itself says.

/** The list reads a subject may be named from: each present only where the reader may view its type. */
export interface SubjectLists {
  readonly users?: UserList | undefined;
  readonly roles?: RoleList | undefined;
  readonly assignments?: AssignmentList | undefined;
  readonly reasons?: ReasonList | undefined;
  readonly settings?: SecuritySettings | undefined;
}

export interface ApprovalSubject {
  /** The action, such as "Role change". */
  readonly title: string;
  /** The record by its name, such as "AUDIT · Auditor"; null where the reader may not read it. */
  readonly name: string | null;
  /** The preparers' names, joined; a preparer the reader may not view is named as such, never by identifier. */
  readonly preparedBy: string;
  readonly requestedAt: string;
}

/** An action type in words, or its code where the catalogue has none yet. */
export function actionTitle(actionType: string): string {
  const id = `approval.action.${actionType}`;
  return isMessageId(id) ? t(id) : actionType;
}

function userName(lists: SubjectLists, userId: string): string | null {
  const user = lists.users?.users.find((each) => each.id === userId);
  if (user === undefined) return null;
  return user.versions[0]?.displayName ?? user.login;
}

function recordName(view: ApprovalRequestView, lists: SubjectLists): string | null {
  const { recordId, versionId } = view.document;
  switch (view.actionType) {
    case 'access.user.change': {
      const user = lists.users?.users.find((each) => each.id === recordId);
      if (user === undefined) return null;
      const version = user.versions.find((each) => each.id === versionId) ?? user.versions[0];
      return t('approval.subject.user', { name: version?.displayName ?? user.login, login: user.login });
    }
    case 'access.role.change': {
      const role = lists.roles?.roles.find((each) => each.id === recordId);
      if (role === undefined) return null;
      const version = role.versions.find((each) => each.id === versionId) ?? role.versions[0];
      return version === undefined ? role.code : t('approval.subject.role', { code: role.code, name: version.name });
    }
    case 'access.role_assignment.change':
    case 'access.role_assignment.withdrawal': {
      const withdrawal = view.actionType === 'access.role_assignment.withdrawal';
      const assignment = lists.assignments?.assignments.find((each) =>
        withdrawal ? each.withdrawal?.id === recordId : each.id === recordId,
      );
      if (assignment === undefined) return null;
      const actor =
        assignment.actor.kind === 'user'
          ? (assignment.actor.name ?? userName(lists, assignment.actor.userId) ?? t('approval.subject.user-not-shown'))
          : assignment.actor.code;
      return t('approval.subject.assignment', { actor, role: assignment.role.code });
    }
    case 'access.approval_reason.change': {
      const reason = lists.reasons?.reasons.find((each) => each.id === recordId);
      if (reason === undefined) return null;
      const version = reason.versions.find((each) => each.id === versionId) ?? reason.versions[0];
      return version === undefined
        ? reason.code
        : t('approval.subject.reason', { code: reason.code, text: version.text });
    }
    case 'access.setting.change': {
      const setting = lists.settings?.settings.find((each) => each.settingId === recordId);
      return setting === undefined ? null : t(`security.setting.${setting.setting}`);
    }
    default:
      return null;
  }
}

/** The subject of one request, named as far as the reader's lists allow. */
export function approvalSubject(view: ApprovalRequestView, lists: SubjectLists): ApprovalSubject {
  return {
    title: actionTitle(view.actionType),
    name: recordName(view, lists),
    preparedBy: view.preparers.map((id) => userName(lists, id) ?? t('approval.subject.user-not-shown')).join(', '),
    requestedAt: view.requestedAt,
  };
}

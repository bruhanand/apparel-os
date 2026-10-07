import { assignmentScopeSchema, permissionSchema, personaIdSchema } from '@apparel-os/schemas';
import { z } from 'zod';
import { actionTitle, type SubjectLists } from '../approvals/subject';
import { isMessageId, t } from '../messages/catalogue';
import { permissionText, recordTypeName, scopeText } from '../setup/describe';
import { formatDate } from '../setup/format';

// The changed fields of a history entry in words (numbering-and-audit 4.1; design-language 8, 11; code-house-rules
// 12.13; visual review finding 5): each field by its catalogue label, never its code, and each value as the screens
// write it: persona names, role and user names where the reader may view them, scope in words, business dates as
// DD MMM YYYY. A value of a shape it does not know shows as recorded, so nothing is hidden by a missing rule.

/** A field's label, or its code where the catalogue has none yet. */
export function fieldLabel(field: string): string {
  const id = `history.field.${field}`;
  return isMessageId(id) ? t(id) : field;
}

const uuid = z.uuid();
const date = z.iso.date();
const userActor = z.object({ kind: z.literal('user'), userId: uuid });
const serviceActor = z.object({ kind: z.literal('service-identity') });
const documentRef = z.object({ recordType: z.string() });
const numbers = z.record(z.string(), z.number());
const lenientPermission = z.union([
  permissionSchema,
  z.object({ kind: z.literal('action'), recordType: z.string(), action: permissionSchema.options[0].shape.action }),
  z.object({
    kind: z.literal('field-class'),
    fieldClass: permissionSchema.options[1].shape.fieldClass,
    access: permissionSchema.options[1].shape.access,
  }),
]);

function userName(id: string, lists: SubjectLists): string {
  const user = lists.users?.users.find((each) => each.id === id);
  return user === undefined ? t('history.value.user-not-shown') : (user.versions[0]?.displayName ?? user.login);
}

function roleName(id: string, lists: SubjectLists): string {
  const role = lists.roles?.roles.find((each) => each.id === id);
  if (role === undefined) return t('history.value.role-not-shown');
  const name = role.versions[0]?.name;
  return name === undefined ? role.code : t('approval.subject.role', { code: role.code, name });
}

/** A long identifier, shortened to its last six characters, so a reader can tell two apart without reading 36. */
export function shortId(id: string): string {
  return t('history.value.id', { short: id.slice(-6).toUpperCase() });
}

function recorded(value: unknown): string {
  if (typeof value === 'string') return uuid.safeParse(value).success ? shortId(value) : value;
  if (typeof value === 'number') return String(value);
  if (typeof value === 'boolean') return t(value ? 'history.value.yes' : 'history.value.no');
  return JSON.stringify(value);
}

/** One recorded value of a field, in words. */
export function valueText(field: string, value: unknown, lists: SubjectLists): string {
  if (value === null || value === undefined) {
    return t(field === 'validTo' ? 'history.value.open-ended' : 'history.empty-value');
  }
  switch (field) {
    case 'personas': {
      const personas = z.array(personaIdSchema).safeParse(value);
      if (!personas.success) break;
      if (personas.data.length === 0) return t('history.value.none');
      return personas.data.map((persona) => `${persona} ${t(`persona.${persona}`)}`).join(', ');
    }
    case 'roleId':
      if (typeof value === 'string') return roleName(value, lists);
      break;
    case 'actor': {
      const user = userActor.safeParse(value);
      if (user.success) return userName(user.data.userId, lists);
      if (serviceActor.safeParse(value).success) return t('history.value.service-identity');
      break;
    }
    case 'preparers': {
      const ids = z.array(uuid).safeParse(value);
      if (ids.success) return ids.data.map((id) => userName(id, lists)).join(', ');
      break;
    }
    case 'scope': {
      const scope = assignmentScopeSchema.safeParse(value);
      if (scope.success) return scopeText(scope.data);
      break;
    }
    case 'validFrom':
    case 'validTo':
    case 'startsOn':
      if (date.safeParse(value).success) return formatDate(value as string);
      break;
    case 'permissions': {
      const permissions = z.array(lenientPermission).safeParse(value);
      if (!permissions.success) break;
      if (permissions.data.length === 0) return t('history.value.none');
      return permissions.data.map((each) => permissionText({ ...each, selfService: false })).join(', ');
    }
    case 'actionType':
      if (typeof value === 'string') return actionTitle(value);
      break;
    case 'document': {
      const document = documentRef.safeParse(value);
      if (document.success) return recordTypeName(document.data.recordType);
      break;
    }
    case 'key': {
      const id = `security.setting.${typeof value === 'string' ? value : ''}`;
      if (isMessageId(id)) return t(id);
      break;
    }
    case 'origin': {
      const id = `security.origin.${typeof value === 'string' ? value : ''}`;
      if (isMessageId(id)) return t(id);
      break;
    }
    case 'kind': {
      const id = `reason.kind.${typeof value === 'string' ? value : ''}`;
      if (isMessageId(id)) return t(id);
      break;
    }
    case 'value': {
      const values = numbers.safeParse(value);
      if (!values.success) break;
      return Object.entries(values.data)
        .map(([name, number]) => {
          const id = `security.field.${name}`;
          return `${isMessageId(id) ? t(id) : name}: ${String(number)}`;
        })
        .join(', ');
    }
    default:
      break;
  }
  return recorded(value);
}

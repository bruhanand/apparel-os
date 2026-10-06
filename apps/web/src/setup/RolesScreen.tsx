import { routes, type RoleRecord } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { useKeptDraft } from '../forms/use-kept-draft';
import { useRouteForm } from '../forms/use-route-form';
import { AsOf } from '../history/AsOf';
import { KeptDraftBanner } from '../lock/KeptDraftBanner';
import { t } from '../messages/catalogue';
import { permissionText, recordTypeName } from './describe';
import { formatDate } from './format';
import { Card, GrantedButton, HistoryTab, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from './parts';
import {
  actionCell,
  fieldCell,
  fieldClasses,
  gridOfPermissions,
  permissionGrid,
  permissionsOfGrid,
  withAllActions,
} from './permission-grid';
import { RecordDrawer } from './RecordDrawer';
import { stateIdOf } from './states';

// Setup › Roles (access-and-approvals 4.1, 4.2, 9.11, 14; POL-02.01, POL-02.03): every role with each version, and the
// role editor. A role is a named set of explicit permissions; it can start from an existing role's permissions. The
// eleven templates' permission sets are KDPS's to confirm (V-01) and are not in code yet, so none is offered (RR-340).
// A new role and every version are approved by a different authorised person (POL-02.07).

const LIST_READS = ['listRoles', 'listMyWork'] as const;

/** The permission grid: a row per record type with its declared actions and All actions; then the field classes. */
function PermissionGrid({
  selection,
  onChange,
}: {
  selection: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  const toggle = (cell: string) => {
    const next = new Set(selection);
    if (next.has(cell)) next.delete(cell);
    else next.add(cell);
    onChange(next);
  };
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="text-body-sm font-semibold">{t('role.permissions')}</legend>
      <p className="text-caption text-text-2">{t('setup.roles.permissions-help')}</p>
      <ul className="m-0 flex list-none flex-col gap-2 p-0">
        {permissionGrid().map((row) => (
          <li key={row.recordType} className="flex flex-col gap-1 border-b border-border pb-2">
            <span className="font-semibold">{recordTypeName(row.recordType)}</span>
            <span className="flex flex-wrap items-center gap-3">
              {row.actions.map((action) => {
                const cell = actionCell(row.recordType, action);
                return (
                  <label key={action} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={selection.has(cell)}
                      onChange={() => {
                        toggle(cell);
                      }}
                    />
                    {t(`action.${action}`)}
                  </label>
                );
              })}
              <Button
                size="small"
                variant="ghost"
                label="setup.roles.all-actions"
                onClick={() => {
                  onChange(withAllActions(selection, row.recordType));
                }}
              />
            </span>
          </li>
        ))}
        {fieldClasses.map((fieldClass) => (
          <li key={fieldClass} className="flex flex-col gap-1 border-b border-border pb-2">
            <span className="font-semibold">{t(`field-class.${fieldClass}`)}</span>
            <span className="flex flex-wrap gap-3">
              {(['view', 'view-and-edit'] as const).map((access) => {
                const cell = fieldCell(fieldClass, access);
                return (
                  <label key={access} className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={selection.has(cell)}
                      onChange={() => {
                        toggle(cell);
                      }}
                    />
                    {t(`field-access.${access}`)}
                  </label>
                );
              })}
            </span>
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

/** Start from an existing role's latest version (its permissions copied, never linked). */
function StartFrom({ roles, onPick }: { roles: readonly RoleRecord[]; onPick: (cells: Set<string>) => void }) {
  return (
    <FormField id="role-start-from" label="setup.roles.start-from" help="setup.roles.start-from-help">
      <select
        id="role-start-from"
        className={inputClass}
        aria-describedby="role-start-from-help"
        defaultValue=""
        onChange={(event) => {
          const role = roles.find((each) => each.id === event.target.value);
          if (role?.versions[0] !== undefined) onPick(gridOfPermissions(role.versions[0].permissions));
        }}
      >
        <option value="">{t('setup.roles.start-empty')}</option>
        {roles.map((role) => (
          <option key={role.id} value={role.id}>
            {t('setup.roles.option', { code: role.code, name: role.versions[0]?.name ?? '' })}
          </option>
        ))}
      </select>
    </FormField>
  );
}

/** A new role: code, name, start and permissions (access-and-approvals 4.2). */
function NewRoleForm({ roles }: { roles: readonly RoleRecord[] }) {
  const form = useRouteForm(routes.prepareRole, { permissions: [] });
  const kept = useKeptDraft(routes.prepareRole, form, 'setup.new-role');
  const submission = useSubmission('prepareRole', LIST_READS);
  const [selection, setSelection] = useState<Set<string>>(new Set());
  const errors = form.formState.errors;
  const choose = (next: Set<string>) => {
    setSelection(next);
    form.setValue('permissions', permissionsOfGrid(next), { shouldDirty: true });
  };
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const done = await submission.submit({ body: values });
          if (done !== undefined) kept.forget();
        })(event);
      }}
    >
      {kept.offered !== null && (
        <KeptDraftBanner
          onRestore={() => {
            kept.restore();
            setSelection(gridOfPermissions(form.getValues('permissions')));
          }}
          onDiscard={kept.discard}
        />
      )}
      <SubmissionBanner state={submission.state} />
      <FormField id="role-code" label="role.code" required error={errors.code}>
        <input
          id="role-code"
          className={`${inputClass} font-mono`}
          {...describedBy('role-code', { invalid: errors.code !== undefined, help: false })}
          {...form.register('code')}
        />
      </FormField>
      <FormField id="role-name" label="role.name" required error={errors.name}>
        <input
          id="role-name"
          className={inputClass}
          {...describedBy('role-name', { invalid: errors.name !== undefined, help: false })}
          {...form.register('name')}
        />
      </FormField>
      <FormField id="role-from" label="setup.valid-from" required error={errors.validFrom} help="setup.valid-from-help">
        <input
          id="role-from"
          type="date"
          className={inputClass}
          {...describedBy('role-from', { invalid: errors.validFrom !== undefined, help: true })}
          {...form.register('validFrom')}
        />
      </FormField>
      <StartFrom roles={roles} onPick={choose} />
      <PermissionGrid selection={selection} onChange={choose} />
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          label="setup.request-approval"
          disabled={submission.state.kind === 'pending'}
        />
      </div>
    </form>
  );
}

/** A new version of a role: name, start and permissions; it supersedes an earlier version's open request (9.6). */
function RoleVersionForm({ role }: { role: RoleRecord }) {
  const latest = role.versions[0];
  const start = gridOfPermissions(latest?.permissions ?? []);
  const form = useRouteForm(routes.prepareRoleVersion, {
    name: latest?.name ?? '',
    permissions: permissionsOfGrid(start),
  });
  const kept = useKeptDraft(routes.prepareRoleVersion, form, `setup.role-version.${role.id}`);
  const submission = useSubmission('prepareRoleVersion', LIST_READS);
  const [selection, setSelection] = useState<Set<string>>(start);
  const errors = form.formState.errors;
  const choose = (next: Set<string>) => {
    setSelection(next);
    form.setValue('permissions', permissionsOfGrid(next), { shouldDirty: true });
  };
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const done = await submission.submit({ params: { roleId: role.id }, body: values });
          if (done !== undefined) kept.forget();
        })(event);
      }}
    >
      {kept.offered !== null && (
        <KeptDraftBanner
          onRestore={() => {
            kept.restore();
            setSelection(gridOfPermissions(form.getValues('permissions')));
          }}
          onDiscard={kept.discard}
        />
      )}
      <SubmissionBanner state={submission.state} />
      <FormField id="role-version-name" label="role.name" required error={errors.name}>
        <input
          id="role-version-name"
          className={inputClass}
          {...describedBy('role-version-name', { invalid: errors.name !== undefined, help: false })}
          {...form.register('name')}
        />
      </FormField>
      <FormField
        id="role-version-from"
        label="setup.valid-from"
        required
        error={errors.validFrom}
        help="setup.valid-from-help"
      >
        <input
          id="role-version-from"
          type="date"
          className={inputClass}
          {...describedBy('role-version-from', { invalid: errors.validFrom !== undefined, help: true })}
          {...form.register('validFrom')}
        />
      </FormField>
      <PermissionGrid selection={selection} onChange={choose} />
      <div className="flex justify-end">
        <Button
          type="submit"
          variant="primary"
          label="setup.request-approval"
          disabled={submission.state.kind === 'pending'}
        />
      </div>
    </form>
  );
}

function RoleDrawer({ role, onClose }: { role: RoleRecord; onClose: () => void }) {
  const [changing, setChanging] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const latest = role.versions[0];
  return (
    <RecordDrawer
      reference={role.code}
      title={latest?.name ?? role.code}
      {...(latest === undefined ? {} : { state: latest.state })}
      onClose={onClose}
      history={<HistoryTab recordType="access.role" recordId={role.id} />}
      details={
        <>
          <Card title="setup.versions">
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {role.versions.map((version) => (
                <li key={version.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{version.name}</span>
                    <StatusBadge state={stateIdOf(version.state)} />
                  </div>
                  <span className="text-body-sm text-text-2">
                    {t('dates.from', { from: formatDate(version.validFrom) })}
                  </span>
                  <ul className="m-0 list-disc pl-5 text-body-sm">
                    {version.permissions.map((permission, index) => (
                      <li key={index}>{permissionText(permission)}</li>
                    ))}
                  </ul>
                  {version.request?.state === 'Awaiting approval' && (
                    <div>
                      <Button
                        size="small"
                        variant="ghost"
                        label="setup.open-approval"
                        onClick={() => {
                          setPanel(version.request?.id ?? null);
                        }}
                      />
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </Card>
          {panel !== null && <ApprovalPanel requestId={panel} />}
          <Card title="setup.roles.change">
            {changing ? (
              <RoleVersionForm role={role} />
            ) : (
              <GrantedButton
                label="setup.roles.change"
                recordType="access.role"
                action="edit"
                onClick={() => {
                  setChanging(true);
                }}
              />
            )}
          </Card>
        </>
      }
    />
  );
}

/** Setup › Roles. */
export function RolesScreen() {
  const query = useQuery(readQuery(api, 'listRoles', {}));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="setup.roles.new"
          recordType="access.role"
          action="create"
          variant="primary"
          onClick={() => {
            setOpen('new');
          }}
        />
        <span className="flex-1" />
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <ListRead query={query} what="setup.roles.what">
        {(list) => {
          const shown = list.roles.find((role) => role.id === open);
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <AsOf asOf={list.asOf} />
              </div>
              {list.roles.length === 0 ? (
                <EmptyState title="setup.roles.empty.title" body="setup.roles.empty.body" />
              ) : (
                <div className="overflow-x-auto rounded-card border border-border bg-surface">
                  <table className="w-full border-collapse text-body">
                    <thead>
                      <tr>
                        <Th label="role.code" />
                        <Th label="role.name" />
                        <Th label="dates.label" />
                        <Th label="setup.latest-version" />
                      </tr>
                    </thead>
                    <tbody>
                      {list.roles.map((role) => {
                        const latest = role.versions[0];
                        return (
                          <tr key={role.id} className="h-10 border-t border-border hover:bg-hover">
                            <td className="px-3">
                              <button
                                type="button"
                                className="font-mono text-accent underline"
                                onClick={() => {
                                  setOpen(role.id);
                                }}
                              >
                                {role.code}
                              </button>
                            </td>
                            <td className="px-3">{latest?.name}</td>
                            <td className="px-3">
                              {latest !== undefined && t('dates.from', { from: formatDate(latest.validFrom) })}
                            </td>
                            <td className="px-3">
                              {latest !== undefined && <StatusBadge state={stateIdOf(latest.state)} />}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {shown !== undefined && (
                <RoleDrawer
                  role={shown}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              )}
              {open === 'new' && (
                <RecordDrawer
                  title={t('setup.roles.new')}
                  onClose={() => {
                    setOpen(null);
                  }}
                  details={<NewRoleForm roles={list.roles} />}
                />
              )}
            </div>
          );
        }}
      </ListRead>
    </div>
  );
}

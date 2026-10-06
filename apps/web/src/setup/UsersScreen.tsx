import { personaIdSchema, routes, type UserRecord } from '@apparel-os/schemas';
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
import { PersonaChip } from '../shell/AppShell';
import { formatDate } from './format';
import { Card, GrantedButton, HistoryTab, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from './parts';
import { RecordDrawer } from './RecordDrawer';
import { stateIdOf } from './states';

// Setup › Users (access-and-approvals 2.1, 3.2, 9.11, 14; DEC-112; spec section 6): every user with the personas held
// and the state of the version in force (RR-214), the latest version's own state, and in the drawer every version,
// the change form and the history (RR-312). Creating a user and every change to one is a version a different
// authorised person approves; a new user cannot sign in until then (PRD-ACS-023, DEC-112).

const LIST_READS = ['listUsers', 'listMyWork'] as const;

/** The user state of the version in force, or null while none is (a first version still waiting). */
function stateInForce(user: UserRecord) {
  return user.versions.find((version) => version.state === 'In force')?.userState ?? null;
}

function PersonaChoices({ register, idPrefix }: { register: () => object; idPrefix: string }) {
  return (
    <fieldset className="flex flex-col gap-1">
      <legend className="text-body-sm font-semibold">{t('user.personas')}</legend>
      <p className="text-caption text-text-2">{t('setup.users.personas-help')}</p>
      <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
        {personaIdSchema.options.map((persona) => (
          <label key={persona} htmlFor={`${idPrefix}-${persona}`} className="flex items-center gap-2">
            <input id={`${idPrefix}-${persona}`} type="checkbox" value={persona} {...register()} />
            <PersonaChip persona={persona} />
          </label>
        ))}
      </div>
    </fieldset>
  );
}

/** A new user: login, display name, personas and a temporary password handed over in person (3.2; DEC-099). */
function NewUserForm() {
  // No persona ticked is an empty list, not a missing field: a user may hold none, and a persona grants nothing
  // (PRD-ACS-002). Without it the form could not be sent until a persona was ticked (found by S1-F01-T20).
  const form = useRouteForm(routes.prepareUser, { personas: [] });
  const kept = useKeptDraft(routes.prepareUser, form, 'setup.new-user');
  const submission = useSubmission('prepareUser', LIST_READS);
  const errors = form.formState.errors;
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const done = await submission.submit({ body: values });
          if (done !== undefined) {
            kept.forget();
            form.reset();
          }
        })(event);
      }}
    >
      {kept.offered !== null && <KeptDraftBanner onRestore={kept.restore} onDiscard={kept.discard} />}
      <SubmissionBanner state={submission.state} />
      <FormField id="new-user-login" label="user.login" required error={errors.login}>
        <input
          id="new-user-login"
          autoComplete="off"
          className={`${inputClass} font-mono`}
          {...describedBy('new-user-login', { invalid: errors.login !== undefined, help: false })}
          {...form.register('login')}
        />
      </FormField>
      <FormField id="new-user-name" label="user.display-name" required error={errors.displayName}>
        <input
          id="new-user-name"
          className={inputClass}
          {...describedBy('new-user-name', { invalid: errors.displayName !== undefined, help: false })}
          {...form.register('displayName')}
        />
      </FormField>
      <PersonaChoices idPrefix="new-user-persona" register={() => form.register('personas')} />
      <FormField
        id="new-user-password"
        label="setup.users.temporary-password"
        required
        error={errors.temporaryPassword}
        help="setup.users.temporary-password-help"
      >
        <input
          id="new-user-password"
          type="password"
          autoComplete="new-password"
          className={inputClass}
          {...describedBy('new-user-password', { invalid: errors.temporaryPassword !== undefined, help: true })}
          {...form.register('temporaryPassword')}
        />
      </FormField>
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

/** A new version of a user: details, personas and state (Active, Disabled or Ended; 2.1, 9.11). */
function UserVersionForm({ user }: { user: UserRecord }) {
  const latest = user.versions[0];
  const form = useRouteForm(
    routes.prepareUserVersion,
    latest === undefined
      ? undefined
      : { displayName: latest.displayName, personas: [...latest.personas], state: latest.userState },
  );
  const kept = useKeptDraft(routes.prepareUserVersion, form, `setup.user-version.${user.id}`);
  const submission = useSubmission('prepareUserVersion', LIST_READS);
  const errors = form.formState.errors;
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const done = await submission.submit({
            params: { userId: user.id },
            body: values,
          });
          if (done !== undefined) kept.forget();
        })(event);
      }}
    >
      {kept.offered !== null && <KeptDraftBanner onRestore={kept.restore} onDiscard={kept.discard} />}
      <SubmissionBanner state={submission.state} />
      <FormField id="user-version-name" label="user.display-name" required error={errors.displayName}>
        <input
          id="user-version-name"
          className={inputClass}
          {...describedBy('user-version-name', { invalid: errors.displayName !== undefined, help: false })}
          {...form.register('displayName')}
        />
      </FormField>
      <PersonaChoices idPrefix="user-version-persona" register={() => form.register('personas')} />
      <FormField id="user-version-state" label="user.state" required error={errors.state} help="setup.users.state-help">
        <select
          id="user-version-state"
          className={inputClass}
          {...describedBy('user-version-state', { invalid: errors.state !== undefined, help: true })}
          {...form.register('state')}
        >
          {(['Active', 'Disabled', 'Ended'] as const).map((state) => (
            <option key={state} value={state}>
              {t(`user-state.${state}`)}
            </option>
          ))}
        </select>
      </FormField>
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

function UserDrawer({ user, onClose }: { user: UserRecord; onClose: () => void }) {
  const [changing, setChanging] = useState(false);
  const [panel, setPanel] = useState<string | null>(null);
  const latest = user.versions[0];
  return (
    <RecordDrawer
      reference={user.login}
      title={latest?.displayName ?? user.login}
      {...(latest === undefined ? {} : { state: latest.state })}
      onClose={onClose}
      history={<HistoryTab recordType="access.user" recordId={user.id} actorId={user.id} />}
      details={
        <>
          <Card title="setup.versions">
            <ol className="m-0 flex list-none flex-col gap-3 p-0">
              {user.versions.map((version) => (
                <li key={version.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{version.displayName}</span>
                    <StatusBadge state={stateIdOf(version.state)} />
                  </div>
                  <span className="text-body-sm text-text-2">
                    {t('setup.users.version-line', {
                      state: t(`user-state.${version.userState}`),
                      from: formatDate(version.validFrom),
                    })}
                  </span>
                  <span className="flex flex-wrap gap-1">
                    {version.personas.map((persona) => (
                      <PersonaChip key={persona} persona={persona} />
                    ))}
                  </span>
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
          <Card title="setup.users.change">
            {changing ? (
              <UserVersionForm user={user} />
            ) : (
              <GrantedButton
                label="setup.users.change"
                recordType="access.user"
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

/** Setup › Users. */
export function UsersScreen() {
  const query = useQuery(readQuery(api, 'listUsers', {}));
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="setup.users.new"
          recordType="access.user"
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
      <ListRead query={query} what="setup.users.what">
        {(list) => (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <AsOf asOf={list.asOf} />
            </div>
            {list.users.length === 0 ? (
              <EmptyState title="setup.users.empty.title" body="setup.users.empty.body" />
            ) : (
              <div className="overflow-x-auto rounded-card border border-border bg-surface">
                <table className="w-full border-collapse text-body">
                  <thead>
                    <tr>
                      <Th label="user.login" />
                      <Th label="user.display-name" />
                      <Th label="user.personas" />
                      <Th label="user.state" />
                      <Th label="setup.latest-version" />
                    </tr>
                  </thead>
                  <tbody>
                    {list.users.map((user) => {
                      const latest = user.versions[0];
                      const inForce = stateInForce(user);
                      return (
                        <tr key={user.id} className="h-10 border-t border-border hover:bg-hover">
                          <td className="px-3">
                            <button
                              type="button"
                              className="font-mono text-accent underline"
                              onClick={() => {
                                setOpen(user.id);
                              }}
                            >
                              {user.login}
                            </button>
                          </td>
                          <td className="px-3">{latest?.displayName}</td>
                          <td className="px-3">
                            <span className="flex flex-wrap gap-1">
                              {(latest?.personas ?? []).map((persona) => (
                                <PersonaChip key={persona} persona={persona} />
                              ))}
                            </span>
                          </td>
                          <td className="px-3">
                            {inForce === null ? (
                              <span className="text-text-2">{t('setup.users.not-in-force')}</span>
                            ) : (
                              <StatusBadge state={stateIdOf(inForce)} />
                            )}
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
            {list.users
              .filter((user) => user.id === open)
              .map((user) => (
                <UserDrawer
                  key={user.id}
                  user={user}
                  onClose={() => {
                    setOpen(null);
                  }}
                />
              ))}
          </div>
        )}
      </ListRead>
      {open === 'new' && (
        <RecordDrawer
          title={t('setup.users.new')}
          onClose={() => {
            setOpen(null);
          }}
          details={<NewUserForm />}
        />
      )}
    </div>
  );
}

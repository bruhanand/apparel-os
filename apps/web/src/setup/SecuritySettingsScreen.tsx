import { routes, type SecuritySettingKey, type SecuritySettings } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import type { Path } from 'react-hook-form';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { useRouteForm } from '../forms/use-route-form';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t, type MessageId } from '../messages/catalogue';
import { useTimeZone } from '../shell/session';
import { businessDayAfter, useBusinessToday } from './business-date';
import { formatDate } from './format';
import { Card, GrantedButton, HistoryTab, inputClass, ListRead, SubmissionBanner, Toolbar } from './parts';
import { RecordDrawer } from './RecordDrawer';
import { stateIdOf } from './states';

// Setup › Security settings (design-language 10.19; access-and-approvals 3.3, 9.11; POL-02.06, POL-02.07; DEC-118,
// RR-334; S1-F01-T25): the sign-in throttling, the password rules and the office session limits, each with its version
// in force and its origin, and a small form to prepare a new version, which a different authorised person decides from
// My work with the approval panel. Every value is the preparer's: the form starts from the version in force and gives
// no default for the origin or when the change takes effect. The general settings screen waits for S1-F04.

type SettingView = SecuritySettings['settings'][number];
type Version = SettingView['versions'][number];

const LIST_READS = ['listSecuritySettings', 'listMyWork'] as const;

/** The fields of each setting's value, in the order the form shows them (access-and-approvals 3.1, 3.2, 3.3). */
const FIELDS: Record<SecuritySettingKey, readonly string[]> = {
  'access.sign-in-throttling': ['failureLimit', 'windowSeconds'],
  'access.password-rules': ['minimumLength'],
  'access.office-session-limits': ['idleLockSeconds', 'absoluteSeconds'],
};

function fieldLabel(field: string): MessageId {
  return `security.field.${field}` as MessageId;
}

/** A version's values as label and number pairs. */
function Values({ setting, value }: { setting: SecuritySettingKey; value: Record<string, number> }) {
  return (
    <dl className="m-0 grid gap-2 sm:grid-cols-2">
      {FIELDS[setting].map((field) => (
        <div key={field} className="flex flex-col gap-1">
          <dt className="text-label font-semibold text-text-2">{t(fieldLabel(field))}</dt>
          <dd className="m-0 font-mono">{String(value[field] ?? '')}</dd>
        </div>
      ))}
    </dl>
  );
}

function stateOf(version: Version, inForceId: string | null, now: string): string {
  if (version.decision !== 'Approved') return version.decision;
  if (version.id === inForceId) return 'In force';
  return version.validFrom !== undefined && version.validFrom > now ? 'Scheduled' : 'Ended';
}

function whenText(version: Version, timeZone: string): string {
  if (version.validFrom !== undefined) return t('security.from', { from: formatDateTime(version.validFrom, timeZone) });
  return version.takesEffect.kind === 'at-decision'
    ? t('security.takes-effect.at-decision')
    : t('security.from', { from: formatDate(version.takesEffect.date) });
}

/** A new version of one setting: its values, its origin and when it takes effect. */
function ChangeForm({ view }: { view: SettingView }) {
  const today = useBusinessToday();
  const inForce = view.versions.find((version) => version.id === view.inForceVersionId);
  // The server refuses a setting that starts today or before (`access.starts-in-past`), so its earliest day is the next.
  const form = useRouteForm(
    routes.prepareSecuritySettingVersion,
    {
      setting: view.setting,
      ...(inForce === undefined ? {} : { value: inForce.value }),
    } as never,
    [
      {
        path: 'takesEffect.date',
        earliest: businessDayAfter(today),
        when: (values) => (values as { takesEffect?: { kind?: string } }).takesEffect?.kind === 'from-date',
      },
    ],
  );
  const submission = useSubmission('prepareSecuritySettingVersion', LIST_READS);
  const errors = form.formState.errors as Record<string, unknown>;
  const valueErrors = (errors.value ?? {}) as Record<string, { type?: string } | undefined>;
  const takesEffectErrors = (errors.takesEffect ?? {}) as Record<string, { type?: string } | undefined>;
  const kind = form.watch('takesEffect.kind' as Path<never>) as unknown as string | undefined;
  const id = (field: string) => `security-${view.setting.replace('access.', '')}-${field}`;
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          const done = await submission.submit({ body: values });
          if (done !== undefined) form.reset(values);
        })(event);
      }}
    >
      <SubmissionBanner state={submission.state} />
      {FIELDS[view.setting].map((field) => (
        <FormField key={field} id={id(field)} label={fieldLabel(field)} required error={valueErrors[field]}>
          <input
            id={id(field)}
            type="number"
            inputMode="numeric"
            className={`${inputClass} font-mono`}
            {...describedBy(id(field), { invalid: valueErrors[field] !== undefined, help: false })}
            {...form.register(`value.${field}` as Path<never>, { valueAsNumber: true })}
          />
        </FormField>
      ))}
      <FormField id={id('origin')} label="security.origin" required error={errors.origin as { type?: string }}>
        <select
          id={id('origin')}
          className={inputClass}
          {...describedBy(id('origin'), { invalid: errors.origin !== undefined, help: false })}
          {...form.register('origin' as Path<never>)}
        >
          <option value="">{t('security.choose')}</option>
          <option value="kdps">{t('security.origin.kdps')}</option>
          <option value="test-setup">{t('security.origin.test-setup')}</option>
          <option value="synthetic">{t('security.origin.synthetic')}</option>
        </select>
      </FormField>
      <FormField
        id={id('takes-effect')}
        label="security.takes-effect"
        required
        error={takesEffectErrors.kind}
        help="security.takes-effect-help"
      >
        <select
          id={id('takes-effect')}
          className={inputClass}
          {...describedBy(id('takes-effect'), { invalid: takesEffectErrors.kind !== undefined, help: true })}
          {...form.register('takesEffect.kind' as Path<never>)}
        >
          <option value="">{t('security.choose')}</option>
          <option value="at-decision">{t('security.takes-effect.at-decision')}</option>
          <option value="from-date">{t('security.takes-effect.from-date')}</option>
        </select>
      </FormField>
      {kind === 'from-date' && (
        <FormField id={id('date')} label="security.starts-on" required error={takesEffectErrors.date}>
          <input
            id={id('date')}
            type="date"
            min={businessDayAfter(today)}
            className={inputClass}
            {...describedBy(id('date'), { invalid: takesEffectErrors.date !== undefined, help: false })}
            // The date goes, with its error, when the setting no longer takes effect from a date: the route refuses a date beside "when approved".
            {...form.register('takesEffect.date' as Path<never>, { shouldUnregister: true })}
          />
        </FormField>
      )}
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

function SettingCard({
  view,
  now,
  timeZone,
  onChange,
}: {
  view: SettingView;
  now: string;
  timeZone: string;
  onChange: () => void;
}) {
  const inForce = view.versions.find((version) => version.id === view.inForceVersionId);
  const others = view.versions.filter((version) => version.id !== view.inForceVersionId);
  return (
    <section
      aria-labelledby={`security-${view.setting}`}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <h2 id={`security-${view.setting}`} className="text-h3 font-semibold">
        {t(`security.setting.${view.setting}`)}
      </h2>
      {inForce === undefined ? (
        <p className="m-0 text-body-sm text-text-2">{t('security.not-set')}</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge state="in-force" />
            <span className="text-body-sm text-text-2">{t(`security.origin.${inForce.origin}`)}</span>
            <span className="text-body-sm text-text-2">{whenText(inForce, timeZone)}</span>
          </div>
          <Values setting={view.setting} value={inForce.value} />
        </div>
      )}
      {others.length > 0 && (
        <details>
          <summary className="cursor-pointer text-body-sm font-semibold">{t('setup.versions')}</summary>
          <ol className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
            {others.map((version) => (
              <li key={version.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge state={stateIdOf(stateOf(version, view.inForceVersionId, now))} />
                  <span className="text-body-sm text-text-2">{t(`security.origin.${version.origin}`)}</span>
                  <span className="text-body-sm text-text-2">{whenText(version, timeZone)}</span>
                </div>
                <Values setting={view.setting} value={version.value} />
              </li>
            ))}
          </ol>
        </details>
      )}
      <div>
        <GrantedButton label="security.change" recordType="access.setting" action="edit" onClick={onChange} />
      </div>
    </section>
  );
}

/** Setup › Security settings. */
export function SecuritySettingsScreen() {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'listSecuritySettings', {}));
  const [changing, setChanging] = useState<SecuritySettingKey | null>(null);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <span className="flex-1" />
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <ListRead query={query} what="security.what">
        {(list) => {
          const shown = list.settings.find((view) => view.setting === changing);
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">
                <AsOf asOf={list.asOf} timeZone={timeZone} />
              </div>
              {list.settings.map((view) => (
                <SettingCard
                  key={view.setting}
                  view={view}
                  now={list.asOf}
                  timeZone={timeZone}
                  onChange={() => {
                    setChanging(view.setting);
                  }}
                />
              ))}
              {shown !== undefined && (
                <RecordDrawer
                  title={t(`security.setting.${shown.setting}`)}
                  onClose={() => {
                    setChanging(null);
                  }}
                  details={
                    <Card title="security.change">
                      <ChangeForm view={shown} />
                    </Card>
                  }
                  {...(shown.settingId === null
                    ? {}
                    : { history: <HistoryTab recordType="access.setting" recordId={shown.settingId} /> })}
                />
              )}
            </div>
          );
        }}
      </ListRead>
    </div>
  );
}

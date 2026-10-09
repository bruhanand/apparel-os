import type { ExceptionParty, RoutingList } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { AsOf } from '../history/AsOf';
import { t } from '../messages/catalogue';
import { useBusinessToday } from '../setup/business-date';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th, Toolbar, useGranted } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';

// Setup › Exception rules (access-and-approvals 12.2, 14; POL-02.16, POL-03.05, DEC-037; ui-blueprint Setup;
// S1-F08-T02): for each exception type and Site, the owner, the due time and the escalation, each version with its
// dates, its state and where its values came from. A new version is prepared here and approved by a different
// authorised person from My work. No field has a default: the owners, due times and escalation are KDPS's (V-03).
// The tab for the due times and escalation of approvals and tasks is S1-F05-T02's.

const READS = ['listExceptionRouting', 'listMyWork'] as const;

type Versions = RoutingList['routings'][number]['versions'];

function partyText(named: Versions[number]['owner']): string {
  if (named.name === null) return t('exception.not-shown');
  return named.party.kind === 'role' ? t('exception.role', { code: named.name }) : named.name;
}

function RoutingTable({ list }: { list: RoutingList }) {
  const rows = list.routings.flatMap((routing) => routing.versions.map((version) => ({ routing, version })));
  if (rows.length === 0) return <EmptyState title="rules.none.title" body="rules.none.body" />;
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full border-collapse text-body">
        <thead>
          <tr>
            <Th label="rules.type" />
            <Th label="rules.site" />
            <Th label="rules.owner" />
            <Th label="rules.due" />
            <Th label="rules.escalation" />
            <Th label="rules.valid-from" />
            <Th label="rules.origin" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ routing, version }) => (
            <tr key={version.id} className="border-t border-border">
              <td className="px-3 py-2 font-mono text-body-sm">{routing.typeCode}</td>
              <td className="px-3 py-2 font-mono text-body-sm">{routing.siteId ?? t('rules.no-site')}</td>
              <td className="px-3 py-2">{partyText(version.owner)}</td>
              <td className="px-3 py-2">{t('rules.due-minutes', { count: version.dueRule.minutes })}</td>
              <td className="px-3 py-2">{partyText(version.escalation)}</td>
              <td className="px-3 py-2">
                <div className="flex flex-col gap-1">
                  <StatusBadge state={stateIdOf(version.state)} />
                  <span className="text-body-sm">{t('rules.from', { from: formatDate(version.validFrom) })}</span>
                  {version.validUntil !== null && (
                    <span className="text-body-sm">{t('rules.until', { until: formatDate(version.validUntil) })}</span>
                  )}
                </div>
              </td>
              <td className="px-3 py-2 text-body-sm">{t(`rules.origin.${version.origin}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The person or role a rule names, chosen from the lists the reader may view. */
function PartyField({
  id,
  kindLabel,
  whoLabel,
  value,
  onChange,
}: {
  id: string;
  kindLabel: 'rules.owner-kind' | 'rules.escalation-kind';
  whoLabel: 'rules.owner-who' | 'rules.escalation-who';
  value: { kind: '' | 'user' | 'role'; id: string };
  onChange: (value: { kind: '' | 'user' | 'role'; id: string }) => void;
}) {
  const users = useQuery({ ...readQuery(api, 'listUsers', {}), enabled: useGranted('access.user', 'view') });
  const roles = useQuery({ ...readQuery(api, 'listRoles', {}), enabled: useGranted('access.role', 'view') });
  const options =
    value.kind === 'user'
      ? (users.data?.users ?? []).map((user) => ({ id: user.id, text: user.versions[0]?.displayName ?? user.login }))
      : value.kind === 'role'
        ? (roles.data?.roles ?? []).map((role) => ({ id: role.id, text: role.code }))
        : [];
  return (
    <>
      <FormField id={`${id}-kind`} label={kindLabel} required>
        <select
          id={`${id}-kind`}
          className={inputClass}
          value={value.kind}
          {...describedBy(`${id}-kind`, { invalid: false, help: false })}
          onChange={(event) => {
            onChange({ kind: event.target.value as '' | 'user' | 'role', id: '' });
          }}
        >
          <option value="">{t('rules.choose')}</option>
          <option value="user">{t('rules.party.user')}</option>
          <option value="role">{t('rules.party.role')}</option>
        </select>
      </FormField>
      {value.kind !== '' && (
        <FormField id={`${id}-who`} label={whoLabel} required>
          <select
            id={`${id}-who`}
            className={inputClass}
            value={value.id}
            {...describedBy(`${id}-who`, { invalid: false, help: false })}
            onChange={(event) => {
              onChange({ kind: value.kind, id: event.target.value });
            }}
          >
            <option value="">{t('rules.choose')}</option>
            {options.map((option) => (
              <option key={option.id} value={option.id}>
                {option.text}
              </option>
            ))}
          </select>
        </FormField>
      )}
    </>
  );
}

function partyOf(value: { kind: '' | 'user' | 'role'; id: string }): ExceptionParty | undefined {
  if (value.id === '') return undefined;
  if (value.kind === 'user') return { kind: 'user', userId: value.id };
  if (value.kind === 'role') return { kind: 'role', roleId: value.id };
  return undefined;
}

/** A new rule version: every value the preparer's, none defaulted (V-03). */
function RuleForm({ list }: { list: RoutingList }) {
  const today = useBusinessToday();
  const submission = useSubmission('prepareExceptionRouting', READS);
  const sites = useQuery(readQuery(api, 'readMasterLists', { query: { date: today } }));
  const [typeCode, setTypeCode] = useState('');
  const [siteId, setSiteId] = useState('');
  const [owner, setOwner] = useState<{ kind: '' | 'user' | 'role'; id: string }>({ kind: '', id: '' });
  const [escalation, setEscalation] = useState<{ kind: '' | 'user' | 'role'; id: string }>({ kind: '', id: '' });
  const [minutes, setMinutes] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [origin, setOrigin] = useState('');
  const ownerParty = partyOf(owner);
  const escalationParty = partyOf(escalation);
  const due = Number(minutes);
  const ready =
    typeCode !== '' &&
    siteId !== '' &&
    ownerParty !== undefined &&
    escalationParty !== undefined &&
    Number.isInteger(due) &&
    due > 0 &&
    validFrom !== '' &&
    origin !== '';
  return (
    <form
      id="exception-rule-form"
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        void submission.submit({
          body: {
            typeCode,
            siteId: siteId === 'none' ? null : siteId,
            owner: ownerParty,
            dueRule: { format: 'elapsed-minutes-v1', minutes: due },
            escalation: escalationParty,
            validFrom,
            origin: origin as 'kdps' | 'test-setup' | 'synthetic',
          },
        });
      }}
    >
      <SubmissionBanner state={submission.state} />
      <FormField id="rule-type" label="rules.type" required>
        <select
          id="rule-type"
          className={inputClass}
          value={typeCode}
          {...describedBy('rule-type', { invalid: false, help: false })}
          onChange={(event) => {
            setTypeCode(event.target.value);
          }}
        >
          <option value="">{t('rules.choose')}</option>
          {list.types.map((type) => (
            <option key={type.code} value={type.code}>
              {t(`exception.category.${type.category}`)} · {type.code}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="rule-site" label="rules.site" required>
        <select
          id="rule-site"
          className={inputClass}
          value={siteId}
          {...describedBy('rule-site', { invalid: false, help: false })}
          onChange={(event) => {
            setSiteId(event.target.value);
          }}
        >
          <option value="">{t('rules.choose')}</option>
          <option value="none">{t('rules.no-site')}</option>
          {(sites.data?.sites ?? []).map((site) => (
            <option key={site.id} value={site.id}>
              {site.code}
            </option>
          ))}
        </select>
      </FormField>
      <PartyField
        id="rule-owner"
        kindLabel="rules.owner-kind"
        whoLabel="rules.owner-who"
        value={owner}
        onChange={setOwner}
      />
      <FormField id="rule-minutes" label="rules.minutes" required>
        <input
          id="rule-minutes"
          type="number"
          inputMode="numeric"
          min={1}
          className={`${inputClass} font-mono`}
          value={minutes}
          {...describedBy('rule-minutes', { invalid: false, help: false })}
          onChange={(event) => {
            setMinutes(event.target.value);
          }}
        />
      </FormField>
      <PartyField
        id="rule-escalation"
        kindLabel="rules.escalation-kind"
        whoLabel="rules.escalation-who"
        value={escalation}
        onChange={setEscalation}
      />
      <FormField id="rule-from" label="rules.valid-from" required>
        <input
          id="rule-from"
          type="date"
          min={today}
          className={inputClass}
          value={validFrom}
          {...describedBy('rule-from', { invalid: false, help: false })}
          onChange={(event) => {
            setValidFrom(event.target.value);
          }}
        />
      </FormField>
      <FormField id="rule-origin" label="rules.origin" required>
        <select
          id="rule-origin"
          className={inputClass}
          value={origin}
          {...describedBy('rule-origin', { invalid: false, help: false })}
          onChange={(event) => {
            setOrigin(event.target.value);
          }}
        >
          <option value="">{t('rules.choose')}</option>
          <option value="kdps">{t('rules.origin.kdps')}</option>
          <option value="test-setup">{t('rules.origin.test-setup')}</option>
          <option value="synthetic">{t('rules.origin.synthetic')}</option>
        </select>
      </FormField>
      <FormActions form="exception-rule-form" pending={submission.state.kind === 'pending' || !ready} />
    </form>
  );
}

/** Setup › Exception rules. */
export function ExceptionRulesScreen() {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'listExceptionRouting', {}));
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="rules.add"
          variant="primary"
          recordType="exceptions.exception_routing"
          action="edit"
          onClick={() => {
            setAdding(true);
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
      <ListRead query={query} what="rules.what">
        {(list) => (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <AsOf asOf={list.asOf} timeZone={timeZone} />
            </div>
            <RoutingTable list={list} />
            {adding && (
              <RecordDrawer
                title={t('rules.add')}
                onClose={() => {
                  setAdding(false);
                }}
                details={
                  <Card>
                    <RuleForm list={list} />
                  </Card>
                }
              />
            )}
          </div>
        )}
      </ListRead>
    </div>
  );
}

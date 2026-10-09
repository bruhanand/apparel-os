import type { WorkItemRoutingList } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { actionTitle } from '../approvals/subject';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { AsOf } from '../history/AsOf';
import { t } from '../messages/catalogue';
import { useBusinessToday } from '../setup/business-date';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { PartyField, partyOf } from './ExceptionRulesScreen';

// Setup › Exception rules, the approvals and tasks tab (access-and-approvals 9.4, 11.3, 14; design-language 10.19;
// GC3-8, DEC-105; S1-F05-T02; product owner, 6 Oct 2026, DEC-116): for each action type and Site, the due time and the
// escalation recipient of its approvals and tasks, each version with its dates, state and where its values came from,
// built from the exception rules tab's own parts. A new version is prepared here and approved by a different
// authorised person from My work. No field has a default: the due times and recipients are KDPS's (question 52).

const READS = ['listWorkItemRouting', 'listMyWork'] as const;

function RoutingTable({ list }: { list: WorkItemRoutingList }) {
  const rows = list.routings.flatMap((routing) => routing.versions.map((version) => ({ routing, version })));
  if (rows.length === 0) return <EmptyState title="work-rules.none.title" body="work-rules.none.body" />;
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full border-collapse text-body">
        <thead>
          <tr>
            <Th label="work-rules.action" />
            <Th label="rules.site" />
            <Th label="rules.due" />
            <Th label="rules.escalation" />
            <Th label="rules.valid-from" />
            <Th label="rules.origin" />
          </tr>
        </thead>
        <tbody>
          {rows.map(({ routing, version }) => (
            <tr key={version.id} className="border-t border-border">
              <td className="px-3 py-2">{actionTitle(routing.actionType)}</td>
              <td className="px-3 py-2 font-mono text-body-sm">{routing.siteId ?? t('work-rules.no-site')}</td>
              <td className="px-3 py-2">{t('work-rules.due-minutes', { count: version.dueRule.minutes })}</td>
              <td className="px-3 py-2">
                {version.escalation.name === null
                  ? t('exception.not-shown')
                  : version.escalation.party.kind === 'role'
                    ? t('exception.role', { code: version.escalation.name })
                    : version.escalation.name}
              </td>
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

/** A new routing version: every value the preparer's, none defaulted (KDPS question 52). */
function WorkRuleForm({ list }: { list: WorkItemRoutingList }) {
  const today = useBusinessToday();
  const submission = useSubmission('prepareWorkItemRouting', READS);
  const sites = useQuery(readQuery(api, 'readMasterLists', { query: { date: today } }));
  const [actionType, setActionType] = useState('');
  const [siteId, setSiteId] = useState('');
  const [escalation, setEscalation] = useState<{ kind: '' | 'user' | 'role'; id: string }>({ kind: '', id: '' });
  const [minutes, setMinutes] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [origin, setOrigin] = useState('');
  const escalationParty = partyOf(escalation);
  const due = Number(minutes);
  const ready =
    actionType !== '' &&
    siteId !== '' &&
    escalationParty !== undefined &&
    Number.isInteger(due) &&
    due > 0 &&
    validFrom !== '' &&
    origin !== '';
  return (
    <form
      id="work-rule-form"
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready) return;
        void submission.submit({
          body: {
            actionType,
            siteId: siteId === 'none' ? null : siteId,
            dueRule: { format: 'elapsed-minutes-v1', minutes: due },
            escalation: escalationParty,
            validFrom,
            origin: origin as 'kdps' | 'test-setup' | 'synthetic',
          },
        });
      }}
    >
      <SubmissionBanner state={submission.state} />
      <FormField id="work-rule-action" label="work-rules.action" required>
        <select
          id="work-rule-action"
          className={inputClass}
          value={actionType}
          {...describedBy('work-rule-action', { invalid: false, help: false })}
          onChange={(event) => {
            setActionType(event.target.value);
          }}
        >
          <option value="">{t('rules.choose')}</option>
          {list.actionTypes.map((each) => (
            <option key={each.actionType} value={each.actionType}>
              {actionTitle(each.actionType)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="work-rule-site" label="rules.site" required>
        <select
          id="work-rule-site"
          className={inputClass}
          value={siteId}
          {...describedBy('work-rule-site', { invalid: false, help: false })}
          onChange={(event) => {
            setSiteId(event.target.value);
          }}
        >
          <option value="">{t('rules.choose')}</option>
          <option value="none">{t('work-rules.no-site')}</option>
          {(sites.data?.sites ?? []).map((site) => (
            <option key={site.id} value={site.id}>
              {site.code}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id="work-rule-minutes" label="work-rules.minutes" required>
        <input
          id="work-rule-minutes"
          type="number"
          inputMode="numeric"
          min={1}
          className={`${inputClass} font-mono`}
          value={minutes}
          {...describedBy('work-rule-minutes', { invalid: false, help: false })}
          onChange={(event) => {
            setMinutes(event.target.value);
          }}
        />
      </FormField>
      <PartyField
        id="work-rule-escalation"
        kindLabel="rules.escalation-kind"
        whoLabel="rules.escalation-who"
        value={escalation}
        onChange={setEscalation}
      />
      <FormField id="work-rule-from" label="rules.valid-from" required>
        <input
          id="work-rule-from"
          type="date"
          min={today}
          className={inputClass}
          value={validFrom}
          {...describedBy('work-rule-from', { invalid: false, help: false })}
          onChange={(event) => {
            setValidFrom(event.target.value);
          }}
        />
      </FormField>
      <FormField id="work-rule-origin" label="rules.origin" required>
        <select
          id="work-rule-origin"
          className={inputClass}
          value={origin}
          {...describedBy('work-rule-origin', { invalid: false, help: false })}
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
      <FormActions form="work-rule-form" pending={submission.state.kind === 'pending' || !ready} />
    </form>
  );
}

/** The approvals and tasks tab. */
export function WorkRoutingTab() {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'listWorkItemRouting', {}));
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="work-rules.add"
          variant="primary"
          recordType="inbox.work_item_routing"
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
      <ListRead query={query} what="work-rules.what">
        {(list) => (
          <div className="flex flex-col gap-3">
            <div className="flex justify-end">
              <AsOf asOf={list.asOf} timeZone={timeZone} />
            </div>
            <RoutingTable list={list} />
            {adding && (
              <RecordDrawer
                title={t('work-rules.add')}
                onClose={() => {
                  setAdding(false);
                }}
                details={
                  <Card>
                    <WorkRuleForm list={list} />
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

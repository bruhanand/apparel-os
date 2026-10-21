import { routes, type AttributeMark, type MarkedAttribute } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { useRouteForm } from '../forms/use-route-form';
import { formatDateTime } from '../history/format';
import { t, type MessageId } from '../messages/catalogue';
import { useAllRecords, type MasterRecord } from '../organisation/MasterTab';
import { Card, GrantedButton, inputClass, SubmissionBanner, Th, Toolbar, useGranted } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';

// The season attribute and the size attribute on Setup › Vocabularies, Attributes (structure-and-masters 4.2 "As
// built", 8; goods-in GI-2, GI-3; RR-550, RR-556): which list-type attribute is marked as each, what waits for approval,
// and every version. A change is prepared here and approved by a different person from My work or from the approval
// panel here (POL-02.07). Nothing is marked in the app: until the Organisation marks one, none is in force.

const LABEL: Readonly<Record<AttributeMark, MessageId>> = {
  season: 'marked.mark.season',
  size: 'marked.mark.size',
};

const CHANGE: Readonly<Record<AttributeMark, MessageId>> = {
  season: 'marked.change.season',
  size: 'marked.change.size',
};

const READS = ['listMarkedAttributes', 'listMyWork'] as const;

function nameOf(record: MasterRecord | undefined): string {
  if (record === undefined) return t('marked.unknown-attribute');
  const name = record.versions.find((version) => version.state === 'In force')?.name ?? record.versions[0]?.name;
  return t('budget.option', { code: record.code, name: typeof name === 'string' ? name : record.code });
}

/** A new version of one marking: a list-type attribute in force today, and where the choice came from. */
function ChangeForm({ marking, lists }: { marking: MarkedAttribute; lists: readonly MasterRecord[] }) {
  const route = routes.prepareMarkedAttributeVersion;
  const submission = useSubmission('prepareMarkedAttributeVersion', READS);
  const form = useRouteForm(route, {
    mark: marking.mark,
    attributeId: '',
    ...(marking.versionToken === undefined ? {} : { versionToken: marking.versionToken }),
  });
  const formId = `marked-${marking.mark}-form`;
  const errors = form.formState.errors;
  return (
    <form
      id={formId}
      aria-label={t(CHANGE[marking.mark])}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        void form.handleSubmit(async (values) => {
          await submission.submit({ body: values });
        })(event);
      }}
    >
      <SubmissionBanner state={submission.state} done="marked.sent" />
      <FormField
        id={`${formId}-attribute`}
        label="marked.attribute"
        required
        error={errors.attributeId}
        help="marked.attribute.help"
      >
        <select
          id={`${formId}-attribute`}
          className={inputClass}
          {...describedBy(`${formId}-attribute`, { invalid: errors.attributeId !== undefined, help: true })}
          {...form.register('attributeId')}
        >
          <option value="">{t('setup.choose')}</option>
          {lists.map((each) => (
            <option key={each.id} value={each.id}>
              {nameOf(each)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={`${formId}-origin`} label="rules.origin" required error={errors.origin}>
        <select
          id={`${formId}-origin`}
          className={inputClass}
          {...describedBy(`${formId}-origin`, { invalid: errors.origin !== undefined, help: false })}
          {...form.register('origin')}
        >
          <option value="">{t('setup.choose')}</option>
          <option value="kdps">{t('rules.origin.kdps')}</option>
          <option value="test-setup">{t('rules.origin.test-setup')}</option>
          <option value="synthetic">{t('rules.origin.synthetic')}</option>
        </select>
      </FormField>
      <FormActions form={formId} label="marked.send" pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** One marking: what is in force, its versions, and a change. */
function Marking({ marking, attributes }: { marking: MarkedAttribute; attributes: readonly MasterRecord[] }) {
  const timeZone = useTimeZone();
  const [changing, setChanging] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const byId = new Map(attributes.map((each) => [each.id, each]));
  const lists = attributes.filter(
    (each) => each.valueKind === 'list' && each.versions.some((version) => version.state === 'In force'),
  );
  const label = t(LABEL[marking.mark]);
  return (
    <div className="flex flex-col gap-2">
      <Toolbar>
        <h4 className="m-0 text-body font-semibold">{label}</h4>
        <span className="text-body">
          {marking.inForce.kind === 'set' ? nameOf(byId.get(marking.inForce.attributeId)) : t('marked.not-set')}
        </span>
        <span className="flex-1" />
        <GrantedButton
          label="marked.change"
          recordType="merchandise.marked_attribute"
          action="edit"
          onClick={() => {
            setChanging(true);
          }}
        />
      </Toolbar>
      {marking.versions.length > 0 && (
        <div className="overflow-x-auto rounded-card border border-border bg-surface">
          <table className="w-full border-collapse text-body" aria-label={t('marked.versions') + ' · ' + label}>
            <thead>
              <tr>
                <Th label="marked.attribute" />
                <Th label="marked.state" />
                <Th label="marked.prepared-on" />
                <Th label="marked.in-force-from" />
                <th className="px-3" />
              </tr>
            </thead>
            <tbody>
              {[...marking.versions].reverse().map((version) => (
                <tr key={version.id} className="h-10 border-t border-border">
                  <td className="px-3">{nameOf(byId.get(version.attributeId))}</td>
                  <td className="px-3">
                    <StatusBadge state={stateIdOf(version.state)} />
                  </td>
                  <td className="px-3">{formatDateTime(version.preparedAt, timeZone)}</td>
                  <td className="px-3">
                    {version.inForceFrom === undefined ? '' : formatDateTime(version.inForceFrom, timeZone)}
                  </td>
                  <td className="px-3">
                    {version.state === 'Awaiting approval' && version.request !== undefined && (
                      <Button
                        label="marked.decide"
                        onClick={() => {
                          setDeciding(version.request?.id ?? null);
                        }}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {changing && (
        <RecordDrawer
          title={t(CHANGE[marking.mark])}
          onClose={() => {
            setChanging(false);
          }}
          details={<ChangeForm marking={marking} lists={lists} />}
        />
      )}
      {deciding !== null && (
        <RecordDrawer
          title={label}
          onClose={() => {
            setDeciding(null);
          }}
          details={<ApprovalPanel requestId={deciding} />}
        />
      )}
    </div>
  );
}

/** Setup › Vocabularies, Attributes: the season and size attributes, for whoever may view the setting. */
export function MarkedAttributesCard() {
  const granted = useGranted('merchandise.marked_attribute', 'view');
  const query = useQuery({ ...readQuery(api, 'listMarkedAttributes', {}), enabled: granted });
  const attributes = useAllRecords('attribute', granted);
  if (!granted) return null;
  return (
    <Card title="marked.title">
      <p className="m-0 text-body-sm text-text-2">{t('marked.intro')}</p>
      {(query.data?.marks ?? []).map((marking) => (
        <Marking key={marking.mark} marking={marking} attributes={attributes} />
      ))}
    </Card>
  );
}

import { routes, type AttributeMark, type MarkedAttribute, type MarkedAttributeVersionList } from '@apparel-os/schemas';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { ApiFailure, readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { useRouteForm } from '../forms/use-route-form';
import { formatDateTime } from '../history/format';
import { t, type MessageId } from '../messages/catalogue';
import { ORIGIN_OPTIONS } from '../organisation/kinds';
import { useAllRecords, type MasterRecord } from '../organisation/MasterTab';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th, Toolbar, useGranted } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { useTimeZone } from '../shell/session';
import { AttributeName } from './AttributeName';
import { MARK_LABEL } from './marked';

// The season attribute and the size attribute on Setup › Vocabularies, Attributes (structure-and-masters 4.2 "As
// built", 8; goods-in GI-2, GI-3; RR-550, RR-556): which list-type attribute is marked as each, what waits for approval,
// and its versions, read a page at a time (code-house-rules 12.1). A change is prepared here and approved by a different
// person from My work or from the approval panel here (POL-02.07). Nothing is marked in the app: until the Organisation
// marks one, none is in force.

const CHANGE: Readonly<Record<AttributeMark, MessageId>> = {
  season: 'marked.change.season',
  size: 'marked.change.size',
};

const READS = ['listMarkedAttributes', 'listMarkedAttributeVersions', 'listMyWork'] as const;

/** An attribute offered in the list: its code and the name in force. */
function optionOf(record: MasterRecord): string {
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
              {optionOf(each)}
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
          {ORIGIN_OPTIONS.map((each) => (
            <option key={each.value} value={each.value}>
              {t(each.label)}
            </option>
          ))}
        </select>
      </FormField>
      <FormActions form={formId} label="marked.send" pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** One page of a marking's versions, after the cursor the server gave, or the refusal thrown as ApiFailure. */
async function readVersions(mark: AttributeMark, after: string | undefined): Promise<MarkedAttributeVersionList> {
  const result = await api.call('listMarkedAttributeVersions', {
    params: { mark },
    query: after === undefined ? {} : { after },
  });
  if (result.ok) return result.data;
  throw new ApiFailure(result.status, result.error);
}

/** A marking's versions, newest first, a page at a time; Load more reads the next (code-house-rules 12.1). */
function Versions({ mark, onDecide }: { mark: AttributeMark; onDecide: (requestId: string) => void }) {
  const timeZone = useTimeZone();
  const query = useInfiniteQuery({
    queryKey: ['listMarkedAttributeVersions', mark, 'pages'],
    queryFn: ({ pageParam }) => readVersions(mark, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: MarkedAttributeVersionList) => last.next ?? undefined,
  });
  return (
    <ListRead query={query} what="marked.versions.what">
      {({ pages }) => {
        const versions = pages.flatMap((page) => page.versions);
        if (versions.length === 0) return null;
        return (
          <div className="flex flex-col gap-2">
            <div className="overflow-x-auto rounded-card border border-border bg-surface">
              <table
                className="w-full border-collapse text-body"
                aria-label={t('marked.versions-of', { mark: t(MARK_LABEL[mark]) })}
              >
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
                  {versions.map((version) => (
                    <tr key={version.id} className="h-10 border-t border-border">
                      <td className="px-3">
                        <AttributeName attributeId={version.attributeId} />
                      </td>
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
                              if (version.request !== undefined) onDecide(version.request.id);
                            }}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {query.hasNextPage && (
              <div className="flex justify-center">
                <Button
                  label="organisation.load-more"
                  onClick={() => {
                    void query.fetchNextPage();
                  }}
                />
              </div>
            )}
          </div>
        );
      }}
    </ListRead>
  );
}

/** One marking: what is in force, its versions, and a change. */
function Marking({ marking, attributes }: { marking: MarkedAttribute; attributes: readonly MasterRecord[] }) {
  const [changing, setChanging] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const lists = attributes.filter(
    (each) => each.valueKind === 'list' && each.versions.some((version) => version.state === 'In force'),
  );
  const label = t(MARK_LABEL[marking.mark]);
  return (
    <div className="flex flex-col gap-2">
      <Toolbar>
        <h4 className="m-0 text-body font-semibold">{label}</h4>
        <span className="text-body">
          {marking.inForce.kind === 'set' ? (
            <AttributeName attributeId={marking.inForce.attributeId} />
          ) : (
            t('marked.not-set')
          )}
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
      <Versions mark={marking.mark} onDecide={setDeciding} />
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

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { describedBy, FormField } from '../forms/FormField';
import { isMessageId, t } from '../messages/catalogue';
import type { Grant } from '../shell/screens';
import { AccessHistory, ActorHistory, RecordHistory } from './HistoryReads';
import { auditLogTabs, type AuditLogTab } from './tabs';

// Setup › Audit log (ui-blueprint 16: Changes · Sign-ins · Sensitive access; numbering-and-audit 4.5, 5; module-map
// 4.3 "Stage 1 report: access history"). Each view shows only what the reader's role assignments cover
// (PRD-SEC-005); restricted values arrive masked from the server (PRD-ACS-008).

const lookupSchema = z.discriminatedUnion('by', [
  z.object({ by: z.literal('record'), recordType: z.string().min(1), recordId: z.uuid(), actorId: z.string() }),
  z.object({ by: z.literal('actor'), recordType: z.string(), recordId: z.string(), actorId: z.uuid() }),
]);
type Lookup = z.input<typeof lookupSchema>;

function recordTypeText(recordType: string): string {
  const id = `record-type.${recordType}`;
  return isMessageId(id) ? t(id) : recordType;
}

/** The Changes view: the history of a record, or of an actor, chosen by the reader. */
function ChangesView({ grants }: { grants: readonly Grant[] }) {
  const viewable = [...new Set(grants.filter((g) => g.action === 'view').map((g) => g.recordType))].sort();
  const [shown, setShown] = useState<Lookup | null>(null);
  const form = useForm<Lookup>({
    resolver: zodResolver(lookupSchema),
    mode: 'onBlur',
    defaultValues: { by: 'record', recordType: viewable[0] ?? '', recordId: '', actorId: '' },
  });
  const by = form.watch('by');
  const errors = form.formState.errors;
  return (
    <div className="flex flex-col gap-4">
      <form
        noValidate
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
        onSubmit={(event) => {
          void form.handleSubmit((values) => {
            setShown(values);
          })(event);
        }}
      >
        <fieldset className="flex flex-wrap gap-4">
          <legend className="text-body-sm font-semibold">{t('history.by')}</legend>
          <label className="flex items-center gap-2">
            <input type="radio" value="record" {...form.register('by')} />
            {t('history.by.record')}
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" value="actor" {...form.register('by')} />
            {t('history.by.actor')}
          </label>
        </fieldset>
        {by === 'record' ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <FormField id="history-record-type" label="history.record-type" required error={errors.recordType}>
              <select
                id="history-record-type"
                className="h-9 rounded-control border border-control bg-surface px-2"
                {...describedBy('history-record-type', { invalid: errors.recordType !== undefined, help: false })}
                {...form.register('recordType')}
              >
                {viewable.map((recordType) => (
                  <option key={recordType} value={recordType}>
                    {recordTypeText(recordType)}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField id="history-record-id" label="history.record-id" required error={errors.recordId}>
              <input
                id="history-record-id"
                className="h-9 rounded-control border border-control bg-surface px-2 font-mono"
                {...describedBy('history-record-id', { invalid: errors.recordId !== undefined, help: false })}
                {...form.register('recordId')}
              />
            </FormField>
          </div>
        ) : (
          <FormField id="history-actor-id" label="history.actor-id" required error={errors.actorId}>
            <input
              id="history-actor-id"
              className="h-9 rounded-control border border-control bg-surface px-2 font-mono"
              {...describedBy('history-actor-id', { invalid: errors.actorId !== undefined, help: false })}
              {...form.register('actorId')}
            />
          </FormField>
        )}
        <div>
          <Button type="submit" variant="primary" label="history.show" />
        </div>
      </form>
      {shown === null ? (
        <EmptyState title="history.choose.title" body="history.choose.body" />
      ) : shown.by === 'record' ? (
        <RecordHistory recordType={shown.recordType} recordId={shown.recordId} />
      ) : (
        <ActorHistory actorId={shown.actorId} />
      )}
    </div>
  );
}

/** Setup › Audit log: a tab for each view the reader's role assignments grant (ui-blueprint 16). */
export function AuditLogScreen({ grants }: { grants: readonly Grant[] }) {
  const tabs = auditLogTabs(grants);
  const [current, setCurrent] = useState<AuditLogTab | undefined>(tabs[0]);
  const open = current !== undefined && tabs.includes(current) ? current : tabs[0];
  return (
    <div className="flex flex-col gap-4">
      <div role="tablist" aria-label={t('history.tabs')} className="flex gap-2 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            id={`audit-log-tab-${tab}`}
            aria-selected={tab === open}
            aria-controls="audit-log-panel"
            className={
              tab === open
                ? 'h-9 border-b-2 border-accent px-3 font-semibold text-text'
                : 'h-9 px-3 text-text-2 hover:text-accent'
            }
            onClick={() => {
              setCurrent(tab);
            }}
          >
            {t(`history.tab.${tab}`)}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id="audit-log-panel"
        aria-labelledby={open === undefined ? undefined : `audit-log-tab-${open}`}
      >
        {open === 'changes' && <ChangesView grants={grants} />}
        {open === 'sign-ins' && <AccessHistory group="access" />}
        {open === 'sensitive-access' && <AccessHistory group="sensitive-access" />}
      </div>
    </div>
  );
}

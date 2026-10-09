import type { ExceptionView } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission, type SubmissionState } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { formatDateTime } from '../history/format';
import { t, type MessageId } from '../messages/catalogue';
import { formatPaise } from '../setup/format';
import { Card, inputClass, ListRead } from '../setup/parts';
import { RecordDrawer } from '../setup/RecordDrawer';
import { useTimeZone } from '../shell/session';
import { RefusalBanner } from '../sign-in/RefusalBanner';

// The exception record (access-and-approvals 12, 14; ui-blueprint Home › Exception: Details · History; design-language
// 10.15; S1-F08-T02): its code, type, state, owner, due time, exposure, Site and the records it is about, what
// happened to it, and the actions its reader may take: comment, take it for a role's holder, close and reopen. Closing
// runs the owning module's resolution check on the server; a refusal names what is still missing (PRD-UXP-003). Its
// evidence files arrive with S1-F08-T03.

/** The read of one exception, shared by the drawer and its actions. */
export function exceptionRead(exceptionId: string) {
  return readQuery(api, 'readException', { params: { exceptionId } });
}

const READS = ['readException', 'listMyWork'] as const;

function partyText(named: ExceptionView['owner']): string {
  if (named.name === null) return t('exception.not-shown');
  return named.party.kind === 'role' ? t('exception.role', { code: named.name }) : named.name;
}

function Outcome({ state, done }: { state: SubmissionState; done: MessageId }) {
  if (state.kind === 'done') return <Banner tone="success" role="status" message={done} />;
  if (state.kind === 'refused') return <RefusalBanner refusal={state.refusal} />;
  return null;
}

function Facts({ view, timeZone }: { view: ExceptionView; timeZone: string }) {
  const rows: [MessageId, string][] = [
    ['exception.code', view.code],
    ['exception.type', t(`exception.category.${view.type.category}`)],
    ['exception.owner', partyText(view.owner)],
    ['exception.due', formatDateTime(view.dueAt, timeZone)],
    [
      'exception.exposure',
      view.exposure.kind === 'known' ? formatPaise(view.exposure.amount) : t('exception.exposure.unknown'),
    ],
    ['exception.site', view.siteId ?? t('exception.no-site')],
  ];
  return (
    <dl className="m-0 grid gap-3 sm:grid-cols-2">
      {rows.map(([label, value]) => (
        <div key={label} className="flex flex-col gap-1">
          <dt className="text-label font-semibold text-text-2">{t(label)}</dt>
          <dd className="m-0 break-all">{value}</dd>
        </div>
      ))}
      <div className="flex flex-col gap-1 sm:col-span-2">
        <dt className="text-label font-semibold text-text-2">{t('exception.about')}</dt>
        {view.links.map((link) => (
          <dd key={link.recordId} className="m-0 break-all font-mono text-body-sm">
            {link.recordType} {link.recordId}
          </dd>
        ))}
        {view.earlierExceptionCode !== null && (
          <dd className="m-0 text-body-sm">{t('exception.repeats', { code: view.earlierExceptionCode })}</dd>
        )}
      </div>
    </dl>
  );
}

function Events({ view, timeZone }: { view: ExceptionView; timeZone: string }) {
  return (
    <ol className="m-0 flex list-none flex-col gap-3 p-0">
      {view.events.map((event) => (
        <li key={event.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-b-0">
          <span className="font-semibold">
            {t(`exception.event.${event.kind}`, { to: event.to === null ? '' : partyText(event.to) })}
          </span>
          {event.comment !== null && <span className="whitespace-pre-wrap">{event.comment}</span>}
          <span className="text-body-sm text-text-2">
            {event.byName === null
              ? t('exception.event.by-system', { time: formatDateTime(event.at, timeZone) })
              : t('exception.event.by', { name: event.byName, time: formatDateTime(event.at, timeZone) })}
          </span>
        </li>
      ))}
    </ol>
  );
}

/** A comment, or the reason of a reopening, with its button. */
function TextAction({
  id,
  label,
  button,
  done,
  onSubmit,
  state,
}: {
  id: string;
  label: MessageId;
  button: MessageId;
  done: MessageId;
  onSubmit: (text: string) => Promise<unknown>;
  state: SubmissionState;
}) {
  const [text, setText] = useState('');
  const empty = text.trim() === '';
  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (empty) return;
        void onSubmit(text.trim()).then((answer) => {
          if (answer !== undefined) setText('');
        });
      }}
    >
      <Outcome state={state} done={done} />
      <FormField id={id} label={label} required>
        <textarea
          id={id}
          rows={3}
          className={`${inputClass} h-auto py-2`}
          value={text}
          {...describedBy(id, { invalid: false, help: false })}
          onChange={(event) => {
            setText(event.target.value);
          }}
        />
      </FormField>
      <div>
        <Button type="submit" label={button} disabled={empty || state.kind === 'pending'} />
      </div>
    </form>
  );
}

function Actions({ view }: { view: ExceptionView }) {
  const params = { exceptionId: view.id };
  const comment = useSubmission('commentOnException', READS);
  const close = useSubmission('closeException', READS);
  const take = useSubmission('takeException', READS);
  const reopen = useSubmission('reopenException', READS);
  if (!view.mayAct && !view.mayTake) return <Banner tone="info" role="status" message="exception.view-only" />;
  if (view.state === 'Closed') {
    return (
      <Card title="exception.reopen">
        <TextAction
          id="exception-reopen"
          label="exception.reopen-reason"
          button="exception.reopen"
          done="exception.reopened"
          state={reopen.state}
          onSubmit={(text) => reopen.submit({ params, body: { comment: text } })}
        />
      </Card>
    );
  }
  return (
    <>
      {view.mayTake && (
        <Card>
          <Outcome state={take.state} done="exception.taken" />
          <div>
            <Button
              label="exception.take"
              disabled={take.state.kind === 'pending'}
              onClick={() => {
                void take.submit({ params, body: {} });
              }}
            />
          </div>
        </Card>
      )}
      {view.mayAct && (
        <>
          <Card title="exception.comment">
            <TextAction
              id="exception-comment"
              label="exception.comment"
              button="exception.add-comment"
              done="exception.comment-added"
              state={comment.state}
              onSubmit={(text) => comment.submit({ params, body: { comment: text } })}
            />
          </Card>
          <Card title="exception.close">
            <p className="m-0 text-body-sm text-text-2">{t('exception.close-help')}</p>
            <Outcome state={close.state} done="exception.closed" />
            <div>
              <Button
                label="exception.close"
                variant="primary"
                disabled={close.state.kind === 'pending'}
                onClick={() => {
                  void close.submit({ params, body: {} });
                }}
              />
            </div>
          </Card>
        </>
      )}
    </>
  );
}

/** The drawer of one exception, opened from My work. */
export function ExceptionDrawer({ exceptionId, onClose }: { exceptionId: string; onClose: () => void }) {
  const query = useQuery(exceptionRead(exceptionId));
  const timeZone = useTimeZone();
  const view = query.data;
  return (
    <RecordDrawer
      {...(view === undefined ? {} : { reference: view.code })}
      title={view === undefined ? t('my-work.kind.exception') : t(`exception.category.${view.type.category}`)}
      {...(view === undefined ? {} : { state: view.overdue ? 'Overdue' : view.state })}
      onClose={onClose}
      details={
        <ListRead query={query} what="exception.what">
          {(read) => (
            <div className="flex flex-col gap-4">
              {read.overdue && <StatusBadge state="overdue" />}
              <Card>
                <Facts view={read} timeZone={timeZone} />
              </Card>
              <Actions view={read} />
            </div>
          )}
        </ListRead>
      }
      history={
        <ListRead query={query} what="exception.what">
          {(read) => (
            <Card title="exception.history">
              <Events view={read} timeZone={timeZone} />
            </Card>
          )}
        </ListRead>
      }
    />
  );
}

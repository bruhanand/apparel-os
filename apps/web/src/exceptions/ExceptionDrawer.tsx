import { paiseSchema, type ExceptionView } from '@apparel-os/schemas';
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
import { formatPaise, paiseOfRupees } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead } from '../setup/parts';
import { RecordDrawer } from '../setup/RecordDrawer';
import { useTimeZone } from '../shell/session';
import { RefusalBanner } from '../sign-in/RefusalBanner';
import { EvidenceList, EvidencePicker, useChosenFile, useStoreEvidence } from '../files/Evidence';
import { PartyField, partyOf } from './ExceptionRulesScreen';

// The exception record (access-and-approvals 12, 14; ui-blueprint Home › Exception: Details · History; design-language
// 10.15; S1-F08-T02): its code, type, state, owner, due time, exposure, Site and the records it is about, what
// happened to it, and the actions its reader may take: comment, reassign, take it for a role's holder, raise it again
// on the same records, close and reopen. Resolve is shown unavailable, naming the owning module that records the
// correction (12.3). Closing runs the owning module's resolution check on the server; a refusal, and an action the
// reader's permissions do not reach, names what is still missing (PRD-UXP-003; S1-F08 review). Its
// evidence files are in the tab Evidence n: each opens through the app, and while it is open its reader who may act on
// it adds one, stored first and then linked (access-and-approvals 12.3; design-language 10.15; S1-F08-T03).

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
          <Reassign view={view} />
          <Card title="exception.resolve">
            <p className="m-0 text-body-sm text-text-2">{t('exception.resolve-help', { module: view.type.module })}</p>
            <div>
              <Button
                label="exception.resolve"
                disabled
                reason="exception.resolve-by-module"
                onClick={() => undefined}
              />
            </div>
          </Card>
          <RaiseAgain view={view} />
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

/** Reassign an open exception to a person or a role (12.3), chosen from the lists the reader may view. */
function Reassign({ view }: { view: ExceptionView }) {
  const reassign = useSubmission('reassignException', READS);
  const [to, setTo] = useState<{ kind: '' | 'user' | 'role'; id: string }>({ kind: '', id: '' });
  const party = partyOf(to);
  return (
    <Card title="exception.reassign">
      <Outcome state={reassign.state} done="exception.reassigned" />
      <PartyField
        id="exception-reassign"
        kindLabel="exception.reassign-kind"
        whoLabel="exception.reassign-who"
        value={to}
        onChange={setTo}
      />
      <div>
        <Button
          label="exception.reassign"
          disabled={party === undefined || reassign.state.kind === 'pending'}
          onClick={() => {
            if (party === undefined) return;
            void reassign.submit({ params: { exceptionId: view.id }, body: { to: party } }).then((answer) => {
              if (answer !== undefined) setTo({ kind: '', id: '' });
            });
          }}
        />
      </div>
    </Card>
  );
}

/**
 * Raise a new exception of this type on the same records and at the same place, as when the problem happens again
 * (12.1; PRD-EXC-004: it links to this one). For whoever may create exceptions; the exposure is a known amount or
 * Unknown, never a default (PRD-MOD-015).
 */
function RaiseAgain({ view }: { view: ExceptionView }) {
  const raise = useSubmission('raiseException', ['listMyWork', 'listOpenExceptions']);
  const [open, setOpen] = useState(false);
  const [exposure, setExposure] = useState<'' | 'known' | 'unknown'>('');
  const [amount, setAmount] = useState('');
  const [comment, setComment] = useState('');
  const paise = exposure === 'known' ? paiseOfRupees(amount) : undefined;
  const ready = exposure === 'unknown' || paise !== undefined;
  return (
    <Card title="exception.raise">
      <p className="m-0 text-body-sm text-text-2">{t('exception.raise-help')}</p>
      <Outcome state={raise.state} done="exception.raised-again" />
      {!open ? (
        <div>
          <GrantedButton
            label="exception.raise"
            recordType="exceptions.exception"
            action="create"
            onClick={() => {
              setOpen(true);
            }}
          />
        </div>
      ) : (
        <form
          noValidate
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!ready) return;
            void raise
              .submit({
                body: {
                  typeCode: view.type.code,
                  siteId: view.siteId,
                  storeId: view.storeId,
                  businessUnitId: view.businessUnitId,
                  brandId: view.brandId,
                  links: view.links,
                  exposure:
                    paise === undefined ? { kind: 'unknown' } : { kind: 'known', amount: paiseSchema.decode(paise) },
                  comment: comment.trim() === '' ? null : comment.trim(),
                },
              })
              .then((answer) => {
                if (answer === undefined) return;
                setOpen(false);
                setExposure('');
                setAmount('');
                setComment('');
              });
          }}
        >
          <FormField id="exception-raise-exposure" label="exception.raise-exposure" required>
            <select
              id="exception-raise-exposure"
              className={inputClass}
              value={exposure}
              {...describedBy('exception-raise-exposure', { invalid: false, help: false })}
              onChange={(event) => {
                setExposure(event.target.value as '' | 'known' | 'unknown');
              }}
            >
              <option value="">{t('rules.choose')}</option>
              <option value="known">{t('exception.raise-exposure.known')}</option>
              <option value="unknown">{t('exception.exposure.unknown')}</option>
            </select>
          </FormField>
          {exposure === 'known' && (
            <FormField id="exception-raise-amount" label="exception.raise-amount" required>
              <input
                id="exception-raise-amount"
                inputMode="decimal"
                className={inputClass}
                value={amount}
                {...describedBy('exception-raise-amount', { invalid: false, help: false })}
                onChange={(event) => {
                  setAmount(event.target.value);
                }}
              />
            </FormField>
          )}
          <FormField id="exception-raise-comment" label="exception.raise-comment">
            <textarea
              id="exception-raise-comment"
              rows={2}
              className={`${inputClass} h-auto py-2`}
              value={comment}
              {...describedBy('exception-raise-comment', { invalid: false, help: false })}
              onChange={(event) => {
                setComment(event.target.value);
              }}
            />
          </FormField>
          <div>
            <Button type="submit" label="exception.raise" disabled={!ready || raise.state.kind === 'pending'} />
          </div>
        </form>
      )}
    </Card>
  );
}

/** The evidence files of an exception, from its evidence events, in the order they were added. */
function evidenceOf(view: ExceptionView): string[] {
  return view.events.flatMap((event) => (event.attachmentId === null ? [] : [event.attachmentId]));
}

/** The evidence tab: the files, and, on an open exception its reader may act on, the picker that adds one. */
function Evidence({ view }: { view: ExceptionView }) {
  const chosen = useChosenFile();
  const storing = useStoreEvidence();
  const adding = useSubmission('addExceptionEvidence', READS);
  const pending = storing.state.kind === 'pending' || adding.state.kind === 'pending';
  return (
    <Card title="evidence.title">
      <EvidenceList attachmentIds={evidenceOf(view)} />
      {view.mayAct && view.state !== 'Closed' && (
        <form
          noValidate
          className="flex flex-col gap-2"
          aria-label={t('evidence.add')}
          onSubmit={(event) => {
            event.preventDefault();
            const file = chosen.file;
            if (file === null) return;
            void (async () => {
              const evidence = await storing.store(file);
              if (evidence === undefined) return;
              const added = await adding.submit({ params: { exceptionId: view.id }, body: { evidence: [evidence] } });
              if (added !== undefined) chosen.clear();
            })();
          }}
        >
          {storing.banner}
          <Outcome state={adding.state} done="evidence.added" />
          <EvidencePicker
            id="exception-evidence"
            label="evidence.picker"
            onChange={chosen.choose}
            resetKey={chosen.resetKey}
          />
          <div>
            <Button type="submit" label="evidence.add" disabled={chosen.file === null || pending} />
          </div>
        </form>
      )}
    </Card>
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
      {...(view === undefined
        ? {}
        : { evidence: { count: evidenceOf(view).length, content: <Evidence view={view} /> } })}
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

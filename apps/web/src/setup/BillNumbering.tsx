import type { FormatPartView, SettingOrigin } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { t } from '../messages/catalogue';
import { formatDate } from './format';
import { formatText } from './format-parts';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, useGranted } from './parts';
import { stateIdOf } from './states';

// The financial years and the bill-number format on Setup › Devices, tills and bill series (offline-counter 4.1, 4.3b;
// numbering-and-audit 3.3, 3.5; PRD-POS-020, PRD-ACS-006, PRD-UXP-003, POL-10.07; DEC-116, DEC-117; S1-F12-T03). Each
// shows what is in force and every change prepared with the state of its approval; a change is prepared here and
// decided by a different authorised person from My work with the approval panel, and its approval gives every Active
// device its missing bill series. Nothing is chosen on the person's behalf: the label, the dates, the format's code and
// parts and the origin are all stated (V-40, GC5-1; code-house-rules 12.14).

const YEAR_READS = ['listFinancialYears', 'listBillingDevices', 'listMyWork'] as const;
const FORMAT_READS = ['readBillFormat', 'listBillingDevices', 'listMyWork'] as const;

function OriginField({
  id,
  origin,
  onChange,
}: {
  id: string;
  origin: SettingOrigin | '';
  onChange: (origin: SettingOrigin | '') => void;
}) {
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-body-sm font-semibold">{t('numbering.origin')}</span>
      <select
        id={id}
        className={inputClass}
        value={origin}
        onChange={(event) => {
          onChange(event.target.value as SettingOrigin | '');
        }}
      >
        <option value="">{t('numbering.choose')}</option>
        <option value="kdps">{t('security.origin.kdps')}</option>
        <option value="test-setup">{t('security.origin.test-setup')}</option>
        <option value="synthetic">{t('security.origin.synthetic')}</option>
      </select>
    </label>
  );
}

/** Define a financial year: its label, first and last day and origin, each stated (numbering-and-audit 3.3). */
function YearForm() {
  const preparing = useSubmission('prepareFinancialYearChange', YEAR_READS);
  const [label, setLabel] = useState('');
  const [firstDay, setFirstDay] = useState('');
  const [lastDay, setLastDay] = useState('');
  const [origin, setOrigin] = useState<SettingOrigin | ''>('');
  const ready = label.trim() !== '' && firstDay !== '' && lastDay !== '' && origin !== '';
  return (
    <fieldset className="flex flex-col gap-2 rounded-control border border-border p-3">
      <legend className="text-body-sm font-semibold">{t('numbering.year.define')}</legend>
      <SubmissionBanner state={preparing.state} />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1" htmlFor="year-label">
          <span className="text-body-sm font-semibold">{t('numbering.year.label')}</span>
          <input
            id="year-label"
            className={inputClass}
            value={label}
            onChange={(event) => {
              setLabel(event.target.value);
            }}
          />
        </label>
        <OriginField id="year-origin" origin={origin} onChange={setOrigin} />
        <label className="flex flex-col gap-1" htmlFor="year-first">
          <span className="text-body-sm font-semibold">{t('numbering.year.first')}</span>
          <input
            id="year-first"
            type="date"
            className={inputClass}
            value={firstDay}
            onChange={(event) => {
              setFirstDay(event.target.value);
            }}
          />
        </label>
        <label className="flex flex-col gap-1" htmlFor="year-last">
          <span className="text-body-sm font-semibold">{t('numbering.year.last')}</span>
          <input
            id="year-last"
            type="date"
            className={inputClass}
            value={lastDay}
            onChange={(event) => {
              setLastDay(event.target.value);
            }}
          />
        </label>
      </div>
      <div>
        <Button
          label="numbering.request"
          variant="primary"
          disabled={!ready || preparing.state.kind === 'pending'}
          onClick={() => {
            if (origin === '') return;
            void preparing.submit({ body: { label: label.trim(), firstDay, lastDay, origin } });
          }}
        />
      </div>
    </fieldset>
  );
}

/** The financial years defined, every change with its state, and the form to define one (offline-counter 4.3b). */
function FinancialYears() {
  const query = useQuery(readQuery(api, 'listFinancialYears', {}));
  const [defining, setDefining] = useState(false);
  return (
    <Card title="numbering.years.title">
      <p className="m-0 text-body-sm text-text-2">{t('numbering.years.intro')}</p>
      <ListRead query={query} what="numbering.years.title">
        {(read) => (
          <div className="flex flex-col gap-3">
            {read.years.length === 0 ? (
              <p className="m-0 text-body-sm">{t('numbering.years.none')}</p>
            ) : (
              <ul className="m-0 flex list-none flex-col gap-1 p-0" aria-label={t('numbering.years.title')}>
                {read.years.map((year) => (
                  <li key={year.financialYearId} className="flex flex-wrap items-center gap-2 text-body-sm">
                    {t('numbering.year', {
                      label: year.label,
                      first: formatDate(year.firstDay),
                      last: formatDate(year.lastDay),
                    })}
                    <StatusBadge state="in-force" />
                    <span className="text-text-2">{t(`security.origin.${year.origin}`)}</span>
                  </li>
                ))}
              </ul>
            )}
            {read.changes.length > 0 && (
              <details>
                <summary className="cursor-pointer text-body-sm font-semibold">{t('numbering.changes')}</summary>
                <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                  {read.changes.map((change) => (
                    <li
                      key={change.changeId}
                      className="flex flex-wrap items-center gap-2 text-body-sm"
                      aria-label={change.label}
                    >
                      {t('numbering.year', {
                        label: change.label,
                        first: formatDate(change.firstDay),
                        last: formatDate(change.lastDay),
                      })}
                      <StatusBadge state={stateIdOf(change.state)} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </ListRead>
      {defining ? (
        <YearForm />
      ) : (
        <div>
          <GrantedButton
            label="numbering.year.define"
            recordType="pos.financial_year_change"
            action="create"
            onClick={() => {
              setDefining(true);
            }}
          />
        </div>
      )}
    </Card>
  );
}

interface DraftPart {
  kind: FormatPartView['kind'];
  text: string;
  width: string;
}

function partOf(draft: DraftPart): FormatPartView | undefined {
  switch (draft.kind) {
    case 'text':
      return draft.text === '' ? undefined : { kind: 'text', text: draft.text };
    case 'scope':
      return { kind: 'scope' };
    case 'year':
      return { kind: 'year' };
    case 'sequence': {
      const width = Number(draft.width);
      return draft.width === '' || !Number.isInteger(width) ? undefined : { kind: 'sequence', width };
    }
  }
}

/** Prepare a new bill-number format: its code, its parts in order and its origin, each stated (3.5; POL-10.07). */
function FormatForm() {
  const preparing = useSubmission('prepareBillFormatChange', FORMAT_READS);
  const [code, setCode] = useState('');
  const [origin, setOrigin] = useState<SettingOrigin | ''>('');
  const [parts, setParts] = useState<DraftPart[]>([]);
  // Only parts stated in full: a part whose text or digits are still blank is not sent.
  const built = parts.map(partOf).filter((part): part is FormatPartView => part !== undefined);
  const ready = code.trim() !== '' && origin !== '' && built.length > 0 && built.length === parts.length;
  const change = (index: number, next: Partial<DraftPart>) => {
    setParts(parts.map((part, at) => (at === index ? { ...part, ...next } : part)));
  };
  return (
    <fieldset className="flex flex-col gap-2 rounded-control border border-border p-3">
      <legend className="text-body-sm font-semibold">{t('numbering.format.change')}</legend>
      <SubmissionBanner state={preparing.state} />
      <div className="grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1" htmlFor="format-code">
          <span className="text-body-sm font-semibold">{t('numbering.format.code')}</span>
          <input
            id="format-code"
            className={inputClass}
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
            }}
          />
        </label>
        <OriginField id="format-origin" origin={origin} onChange={setOrigin} />
      </div>
      <fieldset className="flex flex-col gap-2 border-0 p-0">
        <legend className="text-body-sm font-semibold">{t('numbering.format.parts')}</legend>
        {parts.map((part, index) => {
          const n = String(index + 1);
          return (
            <div key={index} className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1" htmlFor={`format-part-${n}`}>
                <span className="text-body-sm">{t('numbering.format.part', { n })}</span>
                <select
                  id={`format-part-${n}`}
                  className={inputClass}
                  value={part.kind}
                  onChange={(event) => {
                    change(index, { kind: event.target.value as DraftPart['kind'] });
                  }}
                >
                  <option value="text">{t('numbering.format.part.text')}</option>
                  <option value="scope">{t('numbering.format.part.scope')}</option>
                  <option value="year">{t('numbering.format.part.year')}</option>
                  <option value="sequence">{t('numbering.format.part.sequence')}</option>
                </select>
              </label>
              {part.kind === 'text' && (
                <input
                  aria-label={t('numbering.format.part.value', { n })}
                  className={inputClass}
                  value={part.text}
                  onChange={(event) => {
                    change(index, { text: event.target.value });
                  }}
                />
              )}
              {part.kind === 'sequence' && (
                <input
                  aria-label={t('numbering.format.part.width', { n })}
                  type="number"
                  inputMode="numeric"
                  className={`${inputClass} w-24 font-mono`}
                  value={part.width}
                  onChange={(event) => {
                    change(index, { width: event.target.value });
                  }}
                />
              )}
              <Button
                label="numbering.format.remove"
                aria-label={t('numbering.format.remove-part', { n })}
                onClick={() => {
                  setParts(parts.filter((_, at) => at !== index));
                }}
              />
            </div>
          );
        })}
        <div>
          <Button
            label="numbering.format.add"
            onClick={() => {
              setParts([...parts, { kind: 'text', text: '', width: '' }]);
            }}
          />
        </div>
      </fieldset>
      {ready && <p className="m-0 font-mono text-body-sm">{formatText(built)}</p>}
      <div>
        <Button
          label="numbering.request"
          variant="primary"
          disabled={!ready || preparing.state.kind === 'pending'}
          onClick={() => {
            if (origin === '' || !ready) return;
            void preparing.submit({
              body: { formatCode: code.trim(), parts: built, origin },
            });
          }}
        />
      </div>
    </fieldset>
  );
}

/** The bill-number format in force, every change with its state, and the form to prepare one (4.3b). */
function BillFormat() {
  const query = useQuery(readQuery(api, 'readBillFormat', {}));
  const [changing, setChanging] = useState(false);
  return (
    <Card title="numbering.format.title">
      <p className="m-0 text-body-sm text-text-2">{t('numbering.format.intro')}</p>
      <ListRead query={query} what="numbering.format.title">
        {(read) => (
          <div className="flex flex-col gap-3">
            {read.format.kind === 'not-set' ? (
              <p className="m-0 text-body-sm">{t('numbering.format.not-set')}</p>
            ) : (
              <p className="m-0 flex flex-wrap items-center gap-2 text-body-sm">
                {t('numbering.format.in-force', { code: read.format.formatCode })}
                <span className="font-mono">{formatText(read.format.parts)}</span>
                <StatusBadge state="in-force" />
                <span className="text-text-2">{t(`security.origin.${read.format.origin}`)}</span>
              </p>
            )}
            {read.changes.length > 0 && (
              <details>
                <summary className="cursor-pointer text-body-sm font-semibold">{t('numbering.changes')}</summary>
                <ul className="m-0 mt-2 flex list-none flex-col gap-1 p-0">
                  {read.changes.map((change) => (
                    <li
                      key={change.changeId}
                      className="flex flex-wrap items-center gap-2 text-body-sm"
                      aria-label={change.formatCode}
                    >
                      <span>{change.formatCode}</span>
                      <span className="font-mono">{formatText(change.parts)}</span>
                      <StatusBadge state={stateIdOf(change.state)} />
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </ListRead>
      {changing ? (
        <FormatForm />
      ) : (
        <div>
          <GrantedButton
            label="numbering.format.change"
            recordType="pos.bill_format_change"
            action="create"
            onClick={() => {
              setChanging(true);
            }}
          />
        </div>
      )}
    </Card>
  );
}

/** The financial years and the bill-number format, each shown only to a person who may view it. */
export function BillNumbering() {
  const years = useGranted('pos.financial_year_change', 'view');
  const format = useGranted('pos.bill_format_change', 'view');
  if (!years && !format) return null;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {years && <FinancialYears />}
      {format && <BillFormat />}
    </div>
  );
}

import type { ErrorBody, ReportExport, ReportNames, ReportRate } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { LoadingState } from '../components/StandardStates';
import { FormField } from '../forms/FormField';
import { t, type MessageId } from '../messages/catalogue';
import { ArrivalView } from '../receiving/ArrivalView';
import { unknownText } from '../receiving/names';
import { formatRate } from '../setup/format';
import { inputClass } from '../setup/parts';
import { RefusalBanner } from '../sign-in/RefusalBanner';

// What the stage 2 report screens share (goods-in 9.1, 9.5, section 11; S2-F11-T02): names as the answer gives them,
// "CODE · Name", Unknown where it gives none (PRD-MOD-015); a rate as a percentage, Unknown where it has no measure; the
// export of a report as XLSX; and the drill-down from a figure to its GRN, the Arrival it was issued from. Every word
// from the message catalogue (code-house-rules 12.13).

export const cell = 'border-t border-border px-3 py-2 align-top';

/** A record a report names, as "CODE · Name", or Unknown. */
export function nameIn(
  list: readonly { readonly id: string; readonly code: string; readonly name: string }[],
  id: string,
) {
  const found = list.find((each) => each.id === id);
  return found === undefined ? unknownText() : t('receive.option', { code: found.code, name: found.name });
}

/** A person a report names, by name, or Unknown. */
export function personIn(names: ReportNames, userId: string): string {
  return names.people.find((each) => each.userId === userId)?.name ?? unknownText();
}

/** A rate as a percentage, Unknown when it has no measure (PRD-MOD-015). */
export function rateText(rate: ReportRate): string {
  return rate.kind === 'measured' ? formatRate(rate.numerator, rate.denominator) : unknownText();
}

/** A filter chosen from a list; Any filters nothing. */
export function FilterSelect({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: MessageId;
  value: string | undefined;
  options: readonly { readonly value: string; readonly text: string }[];
  onChange: (value: string | undefined) => void;
}) {
  return (
    <FormField id={id} label={label}>
      <select
        id={id}
        className={inputClass}
        value={value ?? ''}
        onChange={(event) => {
          onChange(event.target.value === '' ? undefined : event.target.value);
        }}
      >
        <option value="">{t('report.filter.any')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </FormField>
  );
}

type ExportAnswer =
  { readonly ok: true; readonly data: ReportExport } | { readonly ok: false; readonly error: ErrorBody };

/** Saves an exported file the browser holds as bytes. */
export function saveFile(file: ReportExport) {
  const bytes = Uint8Array.from(atob(file.contentBase64), (char) => char.charCodeAt(0));
  const url = URL.createObjectURL(
    new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = file.fileName;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * Export to XLSX, as the report is shown (goods-in 9.1): a read, for a report that carries no restricted field (goods-in
 * 9.5); a refusal is shown with its reason (PRD-UXP-003).
 */
export function ExportButton({ fetchFile }: { fetchFile: () => Promise<ExportAnswer | undefined> }) {
  const [state, setState] = useState<{ kind: 'ready' | 'pending' } | { kind: 'refused'; error: ErrorBody | null }>({
    kind: 'ready',
  });
  const pending = state.kind === 'pending';
  return (
    <span className="inline-flex flex-col gap-2">
      <Button
        label="report.export"
        disabled={pending}
        {...(pending ? { reason: 'report.export.pending' as const } : {})}
        onClick={() => {
          void (async () => {
            setState({ kind: 'pending' });
            const answer = await fetchFile();
            if (answer === undefined) {
              setState({ kind: 'ready' });
              return;
            }
            if (!answer.ok) {
              setState({ kind: 'refused', error: answer.error });
              return;
            }
            saveFile(answer.data);
            setState({ kind: 'ready' });
          })();
        }}
      />
      {state.kind === 'refused' && <RefusalBanner refusal={state.error} />}
    </span>
  );
}

/** A GRN a figure came from, by its number, which opens the Arrival it was issued from (goods-in 9.1). */
export function GrnLinks({
  names,
  grnIds,
  onOpen,
}: {
  names: ReportNames;
  grnIds: readonly string[];
  onOpen: (grn: ReportNames['grns'][number]) => void;
}) {
  if (grnIds.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-2">
      {grnIds.map((grnId) => {
        const grn = names.grns.find((each) => each.grnId === grnId);
        return grn === undefined ? (
          <span key={grnId}>{unknownText()}</span>
        ) : (
          <button
            key={grnId}
            type="button"
            className="text-accent underline"
            onClick={() => {
              onOpen(grn);
            }}
          >
            {grn.number}
          </button>
        );
      })}
    </span>
  );
}

/**
 * The Arrival a GRN was issued from, opened from a report (goods-in 9.1; PRD-EXC-011), with its Site's units, which it
 * names its unit and location by; read before the Arrival is shown, so nothing reads as Unknown while it loads.
 */
export function ArrivalDrill({ grn, onBack }: { grn: ReportNames['grns'][number]; onBack: () => void }) {
  const inbox = useQuery(
    readQuery(api, 'readReceivingInbox', { params: { siteId: grn.siteId }, query: { view: 'pending' } }),
  );
  if (inbox.isPending) return <LoadingState rows={4} />;
  return <ArrivalView arrivalId={grn.arrivalId} units={inbox.data?.units ?? []} onBack={onBack} />;
}

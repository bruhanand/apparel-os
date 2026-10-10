import type { PolicyReadiness, PolicyReadinessItem } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { policyTitle, UnavailableState } from '../components/UnavailableState';
import { base64Of, EvidenceList, EVIDENCE_ACCEPT } from '../files/Evidence';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { isMessageId, t, type MessageId } from '../messages/catalogue';
import { useTimeZone } from '../shell/session';
import { RefusalBanner } from '../sign-in/RefusalBanner';
import { formatDate } from './format';
import { Card, GrantedButton, inputClass, ListRead, Th, Toolbar, useGranted } from './parts';
import { RecordDrawer } from './RecordDrawer';

// Setup › Policy readiness (ui-blueprint: "19 policies · Signed · Configured · What is blocked"; module-map 4.4;
// domain-model 3.6, DM-6; design-language 7, 10.17; PRD "Required policy configuration", PRD-SEC-017, PRD-UXP-003;
// DEC-092, DEC-105, DEC-116; S1-F04-T01). Each policy with its status, its Signed record and evidence, its real values
// and their validation, and the operations it governs, each Available or shown with the "Live action unavailable"
// banner naming what is missing. An unsigned policy shows no badge (design-language 7); Signed shows the Signed state.
// Nothing is filled in for the person: the signatory, the date, the origin and the evidence are theirs to give.

type Operation = PolicyReadinessItem['operations'][number];

const READS = ['readPolicyReadiness', 'checkAvailability'] as const;

/** A name from the catalogue under a prefix, or the code itself where it has none, as for a synthetic one. */
function named(prefix: string, code: string): string {
  const id = `${prefix}.${code}`;
  return isMessageId(id) ? t(id) : code;
}

/** The policy the address names, as the banner's link gives it: `?policy=14`. */
function policyInAddress(): number | null {
  const value = Number(new URLSearchParams(window.location.search).get('policy'));
  return Number.isInteger(value) && value >= 1 && value <= 19 ? value : null;
}

/** One operation a policy governs: Available, or disabled with the banner naming what is missing (10.17). */
function OperationAvailability({ operation }: { operation: Operation }) {
  const name = named('operation', operation.operation);
  return (
    <li className="flex flex-col gap-2 border-b border-border pb-3 last:border-b-0" aria-label={name}>
      <span className="font-semibold">{name}</span>
      {operation.state === 'available' ? (
        <Banner tone="success" role="status" message="policy-readiness.operation.available" />
      ) : (
        <UnavailableState missing={operation.missing} />
      )}
    </li>
  );
}

/** Switches the operation's capability on or off for the Organisation (PRD-SEC-017). */
function CapabilitySwitch({ operation }: { operation: Operation }) {
  const switching = useSubmission('switchCapability', READS);
  const name = named('capability', operation.capability);
  return (
    <div className="flex flex-col gap-2">
      <span className="text-body-sm">
        {t(operation.capabilityOn ? 'policy-readiness.capability.on' : 'policy-readiness.capability.off', {
          capability: name,
        })}
      </span>
      {switching.state.kind === 'refused' && <RefusalBanner refusal={switching.state.refusal} />}
      <div>
        <GrantedButton
          label={
            operation.capabilityOn ? 'policy-readiness.capability.switch-off' : 'policy-readiness.capability.switch-on'
          }
          recordType="configuration.capability"
          action="edit"
          onClick={() => {
            void switching.submit({
              params: { capability: operation.capability },
              body: { on: !operation.capabilityOn },
            });
          }}
        />
      </div>
    </div>
  );
}

/** The origin a record is given: stated by the person, never a default (code-house-rules 12.14). */
function OriginChoice({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-body-sm font-semibold" htmlFor={id}>
        {t('policy-readiness.origin')}
      </label>
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">{t('policy-readiness.choose')}</option>
        <option value="kdps">{t('policy-readiness.origin.kdps')}</option>
        <option value="synthetic">{t('policy-readiness.origin.synthetic')}</option>
      </select>
    </div>
  );
}

function EvidenceChoice({ id, onChange }: { id: string; onChange: (file: File | null) => void }) {
  return (
    <label className="flex flex-col gap-1" htmlFor={id}>
      <span className="text-body-sm font-semibold">{t('policy-readiness.evidence')}</span>
      <input
        id={id}
        type="file"
        accept={EVIDENCE_ACCEPT}
        className={inputClass}
        onChange={(event) => {
          onChange(event.target.files?.[0] ?? null);
        }}
      />
    </label>
  );
}

/** Stores the evidence file first (Store a file), answering what the command hands to its record. */
function useEvidenceStore() {
  const storing = useSubmission('storeFile', []);
  return {
    storing,
    store: async (file: File) => {
      const stored = await storing.submit({
        body: { sourceSystem: 'manual-upload', originalName: file.name, contentBase64: await base64Of(file) },
      });
      return stored === undefined
        ? undefined
        : [{ storedFileId: stored.storedFileId, fileReceiptId: stored.receiptId }];
    },
  };
}

/** Records the policy as Signed: its "Signed by, date" line, the origin and the signed evidence (DEC-092). */
function SignatureForm({ policy }: { policy: number }) {
  const [signatory, setSignatory] = useState('');
  const [signedOn, setSignedOn] = useState('');
  const [origin, setOrigin] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const evidence = useEvidenceStore();
  const recording = useSubmission('recordPolicySignature', READS);
  const ready = signatory.trim() !== '' && signedOn !== '' && origin !== '' && file !== null;
  const pending = evidence.storing.state.kind === 'pending' || recording.state.kind === 'pending';
  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!ready) return;
    void (async () => {
      const files = await evidence.store(file);
      if (files === undefined) return;
      await recording.submit({
        params: { policyNumber: String(policy) },
        body: { signatory: signatory.trim(), signedOn, origin: origin as 'kdps' | 'synthetic', evidence: files },
      });
    })();
  };
  return (
    <form className="flex flex-col gap-3" aria-label={t('policy-readiness.sign')} onSubmit={submit}>
      {evidence.storing.state.kind === 'refused' && <RefusalBanner refusal={evidence.storing.state.refusal} />}
      {recording.state.kind === 'refused' && <RefusalBanner refusal={recording.state.refusal} />}
      <label className="flex flex-col gap-1" htmlFor="policy-signatory">
        <span className="text-body-sm font-semibold">{t('policy-readiness.signatory')}</span>
        <input
          id="policy-signatory"
          className={inputClass}
          value={signatory}
          onChange={(event) => {
            setSignatory(event.target.value);
          }}
        />
      </label>
      <label className="flex flex-col gap-1" htmlFor="policy-signed-on">
        <span className="text-body-sm font-semibold">{t('policy-readiness.signed-on')}</span>
        <input
          id="policy-signed-on"
          type="date"
          className={inputClass}
          value={signedOn}
          onChange={(event) => {
            setSignedOn(event.target.value);
          }}
        />
      </label>
      <OriginChoice id="policy-signature-origin" value={origin} onChange={setOrigin} />
      <EvidenceChoice id="policy-signature-evidence" onChange={setFile} />
      <div>
        <Button type="submit" variant="primary" label="policy-readiness.sign" disabled={!ready || pending} />
      </div>
    </form>
  );
}

/** Records the policy's real values as validated, with the evidence (DM-6): never by a person who entered them. */
function ValidationForm({ policy }: { policy: number }) {
  const [origin, setOrigin] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const evidence = useEvidenceStore();
  const recording = useSubmission('recordPolicyValidation', READS);
  const ready = origin !== '' && file !== null;
  const pending = evidence.storing.state.kind === 'pending' || recording.state.kind === 'pending';
  const submit = (event: { preventDefault: () => void }) => {
    event.preventDefault();
    if (!ready) return;
    void (async () => {
      const files = await evidence.store(file);
      if (files === undefined) return;
      await recording.submit({
        params: { policyNumber: String(policy) },
        body: { origin: origin as 'kdps' | 'synthetic', evidence: files },
      });
    })();
  };
  return (
    <form className="flex flex-col gap-3" aria-label={t('policy-readiness.validate')} onSubmit={submit}>
      {evidence.storing.state.kind === 'refused' && <RefusalBanner refusal={evidence.storing.state.refusal} />}
      {recording.state.kind === 'refused' && <RefusalBanner refusal={recording.state.refusal} />}
      <OriginChoice id="policy-validation-origin" value={origin} onChange={setOrigin} />
      <EvidenceChoice id="policy-validation-evidence" onChange={setFile} />
      <div>
        <Button type="submit" variant="primary" label="policy-readiness.validate" disabled={!ready || pending} />
      </div>
    </form>
  );
}

function Fact({ label, children }: { label: MessageId; children: string }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-label font-semibold text-text-2">{t(label)}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

/** A policy's Signed record, its values and their validation, and what it governs. */
function PolicyDetails({ row, timeZone }: { row: PolicyReadinessItem; timeZone: string }) {
  const maySign = useGranted('configuration.policy_status', 'create');
  const mayValidate = useGranted('configuration.policy_validation', 'create');
  const lacksSignature = row.missing.some((item) => item.kind === 'policy' && item.lacks === 'signature');
  const lacksValidation = row.missing.some((item) => item.kind === 'policy' && item.lacks === 'validation');
  return (
    <div className="flex flex-col gap-4">
      <Card title="policy-readiness.signature">
        {row.signature === null ? (
          <p className="m-0 text-body-sm">{t('policy-readiness.open')}</p>
        ) : (
          <dl className="m-0 grid gap-2">
            <Fact label="policy-readiness.signatory">{row.signature.signatory}</Fact>
            <Fact label="policy-readiness.signed-on">{formatDate(row.signature.signedOn)}</Fact>
            <Fact label="policy-readiness.origin">{t(`policy-readiness.origin.${row.signature.origin}`)}</Fact>
            <Fact label="policy-readiness.recorded-at">{formatDateTime(row.signature.recordedAt, timeZone)}</Fact>
          </dl>
        )}
        {row.signature !== null && <EvidenceList attachmentIds={row.signature.evidence} />}
        {lacksSignature &&
          (maySign ? (
            <SignatureForm policy={row.policy} />
          ) : (
            <GrantedButton
              label="policy-readiness.sign"
              recordType="configuration.policy_status"
              action="create"
              onClick={() => undefined}
            />
          ))}
      </Card>
      <Card title="policy-readiness.values">
        {row.values.length === 0 ? (
          <p className="m-0 text-body-sm text-text-2">{t('policy-readiness.values.none')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-body-sm">
            {row.values.map((value) => (
              <li key={`${value.check}:${value.key}`}>
                {t('policy-readiness.value', {
                  check: named('check', value.check),
                  origin: named('origin', value.origin),
                })}
                {value.enteredByYou && <span className="text-text-2"> · {t('policy-readiness.value.yours')}</span>}
              </li>
            ))}
          </ul>
        )}
        {row.validation !== null && (
          <dl className="m-0 grid gap-2">
            <Fact label="policy-readiness.validated-by">{row.validation.validatedBy}</Fact>
            <Fact label="policy-readiness.validated-at">{formatDateTime(row.validation.validatedAt, timeZone)}</Fact>
            <Fact label="policy-readiness.origin">{t(`policy-readiness.origin.${row.validation.origin}`)}</Fact>
          </dl>
        )}
        {row.validation !== null && <EvidenceList attachmentIds={row.validation.evidence} />}
        {row.validation !== null && !row.validation.current && (
          <p className="m-0 text-body-sm">{t('policy-readiness.validation.stale')}</p>
        )}
        {lacksValidation &&
          (mayValidate ? (
            <ValidationForm policy={row.policy} />
          ) : (
            <GrantedButton
              label="policy-readiness.validate"
              recordType="configuration.policy_validation"
              action="create"
              onClick={() => undefined}
            />
          ))}
      </Card>
      <Card title="policy-readiness.blocked">
        {row.operations.length === 0 ? (
          <p className="m-0 text-body-sm text-text-2">{t('policy-readiness.blocked.none')}</p>
        ) : (
          <ul className="m-0 flex list-none flex-col gap-3 p-0">
            {row.operations.map((operation) => (
              <li key={operation.operation} className="flex flex-col gap-2">
                <span className="font-semibold">{named('operation', operation.operation)}</span>
                <CapabilitySwitch operation={operation} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

/** The policy's status cell: Signed shows its state; an unsigned policy shows the word Open and no badge (7). */
function StatusCell({ row }: { row: PolicyReadinessItem }) {
  if (row.state === 'Signed') return <StatusBadge state="signed" />;
  return <span className="text-body-sm">{t('policy-readiness.state.open')}</span>;
}

function valuesText(row: PolicyReadinessItem): string {
  if (row.missing.some((item) => item.kind === 'policy' && item.lacks === 'validation')) {
    return t('policy-readiness.values.not-validated');
  }
  return t('policy-readiness.values.validated');
}

function blockedText(row: PolicyReadinessItem): string {
  const blocked = row.operations.filter((operation) => operation.state === 'unavailable').length;
  return blocked === 0
    ? t('policy-readiness.blocked.nothing')
    : t('policy-readiness.blocked.count', { count: blocked });
}

function PolicyTable({ read, onOpen }: { read: PolicyReadiness; onOpen: (policy: number) => void }) {
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-body-sm">
        <thead>
          <tr>
            <Th label="policy-readiness.column.policy" />
            <Th label="policy-readiness.column.status" />
            <Th label="policy-readiness.column.values" />
            <Th label="policy-readiness.column.blocked" />
            <Th label="policy-readiness.column.open" />
          </tr>
        </thead>
        <tbody>
          {read.policies.map((row) => (
            <tr key={row.policy} className="border-t border-border">
              <td className="px-3 py-2 font-semibold">{policyTitle(String(row.policy))}</td>
              <td className="px-3 py-2">
                <StatusCell row={row} />
              </td>
              <td className="px-3 py-2">{valuesText(row)}</td>
              <td className="px-3 py-2">{blockedText(row)}</td>
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="text-accent underline"
                  aria-label={t('policy-readiness.open-named', { policy: policyTitle(String(row.policy)) })}
                  onClick={() => {
                    onOpen(row.policy);
                  }}
                >
                  {t('policy-readiness.open-policy')}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Setup › Policy readiness. */
export function PolicyReadinessScreen() {
  const timeZone = useTimeZone();
  const query = useQuery(readQuery(api, 'readPolicyReadiness', {}));
  const [open, setOpen] = useState<number | null>(policyInAddress);
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
      <ListRead query={query} what="policy-readiness.what">
        {(read) => {
          const shown = read.policies.find((row) => row.policy === open);
          const operations = read.policies.flatMap((row) => row.operations);
          return (
            <div className="flex flex-col gap-4">
              <div className="flex justify-end">
                <AsOf asOf={read.asOf} timeZone={timeZone} />
              </div>
              <section aria-labelledby="policy-readiness-operations" className="flex flex-col gap-2">
                <h2 id="policy-readiness-operations" className="text-h3 font-semibold">
                  {t('policy-readiness.operations.title')}
                </h2>
                {operations.length === 0 ? (
                  <p className="m-0 text-body-sm text-text-2">{t('policy-readiness.operations.none')}</p>
                ) : (
                  <ul className="m-0 flex list-none flex-col gap-3 rounded-card border border-border bg-surface p-4">
                    {operations.map((operation) => (
                      <OperationAvailability key={operation.operation} operation={operation} />
                    ))}
                  </ul>
                )}
              </section>
              <PolicyTable read={read} onOpen={setOpen} />
              {shown !== undefined && (
                <RecordDrawer
                  title={policyTitle(String(shown.policy))}
                  {...(shown.state === 'Signed' ? { state: 'Signed' } : {})}
                  onClose={() => {
                    setOpen(null);
                  }}
                  details={<PolicyDetails row={shown} timeZone={timeZone} />}
                />
              )}
            </div>
          );
        }}
      </ListRead>
    </div>
  );
}

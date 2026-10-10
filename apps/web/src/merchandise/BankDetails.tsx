import type { BankDetailsShown, PartyRecord } from '@apparel-os/schemas';
import { useState } from 'react';
import { useSubmission } from '../api/command';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { t } from '../messages/catalogue';
import { useBusinessToday } from '../setup/business-date';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, inputClass, SubmissionBanner } from '../setup/parts';
import { stateIdOf } from '../setup/states';
import { RefusalBanner } from '../sign-in/RefusalBanner';

// A party's bank details on Setup › Suppliers and agreements (structure-and-masters 5.1, 5.5, 8; access-and-approvals
// 3.3, 6; S1-F03-T03). Every version shows masked, so a person knows it exists (PRD-ACS-008). Show unmasks one version
// after a fresh authenticator code, which the server records; the values live only in this view's state and go when it
// closes, never into a kept draft or a cache (PRD-SEC-006). A change's typed values are cleared once it is sent and when
// its form closes (S1-F03 review H3). A change is a new version, prepared with a fresh code and
// approved by a different authorised person from My work (POL-02.07; GC2-6, DEC-105).

const BANK_TYPE = 'merchandise.party_bank_details';
const PARTY_READS = ['listParties', 'readParty', 'listMyWork'] as const;

function CodeField({ id, value, onChange }: { id: string; value: string; onChange: (code: string) => void }) {
  return (
    <FormField id={id} label="approval.code" required help="approval.code.help">
      <input
        id={id}
        inputMode="numeric"
        autoComplete="one-time-code"
        className={`${inputClass} w-40 font-mono`}
        {...describedBy(id, { invalid: false, help: true })}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </FormField>
  );
}

/** Show one version unmasked: a protected action, each showing a new request with a fresh code (DEC-114). */
function ShowVersion({ partyId, versionId }: { partyId: string; versionId: string }) {
  const showing = useSubmission('showBankDetails', []);
  const [code, setCode] = useState('');
  const [shown, setShown] = useState<BankDetailsShown | null>(null);
  const id = `bank-show-${versionId}`;
  if (shown !== null) {
    return (
      <div className="flex flex-col gap-2">
        <dl className="grid gap-2 sm:grid-cols-2" aria-label={t('parties.bank.title')}>
          {(['accountHolder', 'accountNumber', 'ifsc', 'bankName'] as const).map((field) => (
            <div key={field} className="flex flex-col">
              <dt className="text-label font-semibold text-text-2">{t(`parties.bank.${field}`)}</dt>
              <dd className="m-0 font-mono">{shown[field]}</dd>
            </div>
          ))}
        </dl>
        <div>
          <Button
            label="parties.bank.hide"
            onClick={() => {
              setShown(null);
              showing.reset();
            }}
          />
        </div>
      </div>
    );
  }
  return (
    <form
      className="flex flex-col gap-2"
      aria-label={t('parties.bank.show')}
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const answer = await showing.submit({ params: { partyId, versionId }, body: { totpCode: code } });
          setCode('');
          if (answer !== undefined) setShown(answer);
        })();
      }}
    >
      {showing.state.kind === 'refused' && <RefusalBanner refusal={showing.state.refusal} />}
      <CodeField id={id} value={code} onChange={setCode} />
      <div>
        <Button type="submit" label="parties.bank.show" disabled={showing.state.kind === 'pending'} />
      </div>
    </form>
  );
}

const NO_BANK_VALUES = { accountHolder: '', accountNumber: '', ifsc: '', bankName: '' } as const;

/** Change bank details: a new version, prepared with a fresh code, approved by a different person. */
function ChangeForm({
  partyId,
  versionToken,
  onClose,
}: {
  partyId: string;
  versionToken: string | undefined;
  onClose: () => void;
}) {
  const today = useBusinessToday();
  const submission = useSubmission('prepareBankDetails', PARTY_READS);
  const [values, setValues] = useState<Record<keyof typeof NO_BANK_VALUES, string>>(NO_BANK_VALUES);
  const [validFrom, setValidFrom] = useState(today);
  const [code, setCode] = useState('');
  const formId = `bank-change-${partyId}`;
  return (
    <form
      id={formId}
      className="flex flex-col gap-3 rounded-card border border-border p-3"
      aria-label={t('parties.bank.change')}
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          const answer = await submission.submit({
            params: { partyId },
            body: {
              ...values,
              validFrom,
              ...(versionToken === undefined ? {} : { versionToken }),
              totpCode: code,
            },
          });
          setCode('');
          // PRD-SEC-006: once sent, the plain values leave this view's state; a refusal keeps them to correct.
          if (answer !== undefined) setValues(NO_BANK_VALUES);
        })();
      }}
    >
      <SubmissionBanner state={submission.state} />
      <p className="m-0 text-body-sm text-text-2">{t('parties.bank.change.help')}</p>
      {(['accountHolder', 'accountNumber', 'ifsc', 'bankName'] as const).map((field) => (
        <FormField key={field} id={`${formId}-${field}`} label={`parties.bank.${field}`} required>
          <input
            id={`${formId}-${field}`}
            className={`${inputClass} font-mono`}
            autoComplete="off"
            value={values[field]}
            onChange={(event) => {
              setValues({ ...values, [field]: event.target.value });
            }}
          />
        </FormField>
      ))}
      <FormField id={`${formId}-from`} label="setup.valid-from" required help="setup.valid-from-help">
        <input
          id={`${formId}-from`}
          type="date"
          className={inputClass}
          {...describedBy(`${formId}-from`, { invalid: false, help: true })}
          value={validFrom}
          onChange={(event) => {
            setValidFrom(event.target.value);
          }}
        />
      </FormField>
      <CodeField id={`${formId}-code`} value={code} onChange={setCode} />
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          label="setup.request-approval"
          disabled={submission.state.kind === 'pending'}
        />
        <Button
          label="parties.bank.close"
          onClick={() => {
            setValues(NO_BANK_VALUES);
            setCode('');
            onClose();
          }}
        />
      </div>
    </form>
  );
}

/** One version: its dates and state, masked, with Show or its approval panel. */
function Version({ partyId, version }: { partyId: string; version: PartyRecord['bankDetails']['versions'][number] }) {
  const [approval, setApproval] = useState(false);
  const approved = version.state === 'In force' || version.state === 'Scheduled' || version.state === 'Ended';
  return (
    <li className="flex flex-col gap-2 rounded-card border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge state={stateIdOf(version.state)} />
        <span className="text-body-sm">
          {version.validTo === undefined
            ? t('dates.from', { from: formatDate(version.validFrom) })
            : t('dates.between', { from: formatDate(version.validFrom), to: formatDate(version.validTo) })}
        </span>
        <span className="font-mono text-text-2">{t('parties.bank.masked')}</span>
      </div>
      {approved && <ShowVersion partyId={partyId} versionId={version.id} />}
      {version.request !== undefined &&
        (approval ? (
          <ApprovalPanel requestId={version.request.id} />
        ) : (
          <div>
            <Button
              label="parties.bank.open-approval"
              onClick={() => {
                setApproval(true);
              }}
            />
          </div>
        ))}
    </li>
  );
}

/** A party's bank details: every version masked, Show for an approved one, and Change. */
export function BankDetails({ party }: { party: PartyRecord }) {
  const [changing, setChanging] = useState(false);
  return (
    <Card title="parties.bank.title">
      <p className="m-0 text-body-sm text-text-2">{t('parties.bank.help')}</p>
      {party.bankDetails.versions.length === 0 ? (
        <p className="m-0 text-body-sm">{t('parties.bank.none')}</p>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {party.bankDetails.versions.map((version) => (
            <Version key={version.id} partyId={party.id} version={version} />
          ))}
        </ul>
      )}
      {changing ? (
        <ChangeForm
          partyId={party.id}
          versionToken={party.bankDetails.versionToken}
          onClose={() => {
            setChanging(false);
          }}
        />
      ) : (
        <div>
          <GrantedButton
            label="parties.bank.change"
            recordType={BANK_TYPE}
            action="edit"
            onClick={() => {
              setChanging(true);
            }}
          />
        </div>
      )}
    </Card>
  );
}

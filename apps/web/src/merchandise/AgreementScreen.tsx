import {
  commercialModelSchema,
  type AgreementRecord,
  type AgreementTerms,
  type CommercialModel,
  type EvidenceFile,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { EvidencePicker, useStoreEvidence } from '../files/Evidence';
import { FormField } from '../forms/FormField';
import { t, type MessageId } from '../messages/catalogue';
import { useBusinessToday } from '../setup/business-date';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Toolbar } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';

// Setup › Agreement (structure-and-masters 5.2, 5.5, 8; ui-blueprint Setup › Agreement; S1-F03-T03): an agreement with a
// brand or a supplier, its versions with their dated terms and the version in force on a chosen date. Every term is a
// value or Unknown, none filled in (POL-01.11); margins show only with their field class, masked otherwise
// (PRD-ACS-008); a version waits for a different authorised person (GC2-2, DEC-105). The costing profile belongs to
// merchandise · PT, from stage 2.

const READS = ['listAgreements', 'readAgreement', 'listMyWork'] as const;
const models = commercialModelSchema.options;
const EVENTS = ['supplier-dispatch', 'receipt-and-acceptance', 'sale-to-customer', 'other'] as const;
const STARTS = ['dispatch', 'receipt', 'acceptance'] as const;
const SETTLEMENTS = ['credit-note', 'replacement', 'refund'] as const;

const orNull = (text: string): string | null => (text.trim() === '' ? null : text.trim());
const numberOrNull = (text: string): number | null => (text.trim() === '' ? null : Number(text));
const yesNo = (value: string): boolean | null => (value === '' ? null : value === 'yes');

/** The form's fields, as text, each empty for Unknown. */
interface Draft {
  commercialModel: string;
  defaultModel: string;
  ownershipEvent: string;
  ownershipDescription: string;
  returnAllowed: string;
  returnDays: string;
  returnSeasonEnd: string;
  returnStartsAt: string;
  conditionTags: string;
  packagingLimits: string;
  quantityLimits: string;
  supplierApproval: string;
  freightAndDeductions: string;
  settlement: string;
  margins: string;
  commissions: string;
  paymentTerms: string;
  creditNoteTerms: string;
  promotionTerms: string;
  cashRate: string;
  cashDays: string;
  cashFrom: string;
  interestRate: string;
  interestDays: string;
  interestFrom: string;
}
const EMPTY: Draft = Object.fromEntries(
  [
    'commercialModel',
    'defaultModel',
    'ownershipEvent',
    'ownershipDescription',
    'returnAllowed',
    'returnDays',
    'returnSeasonEnd',
    'returnStartsAt',
    'conditionTags',
    'packagingLimits',
    'quantityLimits',
    'supplierApproval',
    'freightAndDeductions',
    'settlement',
    'margins',
    'commissions',
    'paymentTerms',
    'creditNoteTerms',
    'promotionTerms',
    'cashRate',
    'cashDays',
    'cashFrom',
    'interestRate',
    'interestDays',
    'interestFrom',
  ].map((field) => [field, '']),
) as unknown as Draft;

function termsOf(draft: Draft): AgreementTerms {
  const event = draft.ownershipEvent;
  const tags = draft.conditionTags
    .split(',')
    .map((line) => line.trim())
    .filter((line) => line !== '');
  return {
    commercialModel: draft.commercialModel === '' ? null : (draft.commercialModel as CommercialModel),
    defaultModel: draft.defaultModel === '' ? null : (draft.defaultModel as CommercialModel),
    ownershipEvent:
      event === ''
        ? null
        : event === 'other'
          ? { kind: 'other', description: draft.ownershipDescription }
          : { kind: event as Exclude<(typeof EVENTS)[number], 'other'> },
    returnRights: {
      allowed: yesNo(draft.returnAllowed),
      window:
        draft.returnDays.trim() !== ''
          ? { kind: 'days', days: Number(draft.returnDays) }
          : draft.returnSeasonEnd !== ''
            ? { kind: 'season-end', date: draft.returnSeasonEnd }
            : null,
      startsAt: draft.returnStartsAt === '' ? null : (draft.returnStartsAt as (typeof STARTS)[number]),
    },
    returnConditions: {
      conditionTags: tags.length === 0 ? null : tags,
      packagingLimits: orNull(draft.packagingLimits),
      quantityLimits: orNull(draft.quantityLimits),
      supplierApproval: yesNo(draft.supplierApproval),
      freightAndDeductions: orNull(draft.freightAndDeductions),
      settlement: draft.settlement === '' ? null : (draft.settlement as (typeof SETTLEMENTS)[number]),
    },
    commissions: orNull(draft.commissions),
    paymentTerms: orNull(draft.paymentTerms),
    creditNoteTerms: orNull(draft.creditNoteTerms),
    promotionTerms: orNull(draft.promotionTerms),
    cashDiscount: { rate: orNull(draft.cashRate), days: numberOrNull(draft.cashDays), from: orNull(draft.cashFrom) },
    interest: {
      rate: orNull(draft.interestRate),
      days: numberOrNull(draft.interestDays),
      from: orNull(draft.interestFrom),
    },
  };
}

function Choice({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: MessageId;
  value: string;
  options: readonly { readonly value: string; readonly label: MessageId }[];
  onChange: (value: string) => void;
}) {
  return (
    <FormField id={id} label={label}>
      <select
        id={id}
        className={inputClass}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      >
        <option value="">{t('agreement.option.unknown')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {t(option.label)}
          </option>
        ))}
      </select>
    </FormField>
  );
}

function Text({
  id,
  label,
  value,
  onChange,
  type = 'text',
}: {
  id: string;
  label: MessageId;
  value: string;
  onChange: (value: string) => void;
  type?: 'text' | 'number' | 'date';
}) {
  return (
    <FormField id={id} label={label}>
      <input
        id={id}
        type={type}
        className={inputClass}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
    </FormField>
  );
}

const YES_NO = [
  { value: 'yes', label: 'agreement.option.yes' },
  { value: 'no', label: 'agreement.option.no' },
] as const;

/** The terms of a new agreement or version, each empty for Unknown (POL-01.11). */
function TermsFields({ draft, set }: { draft: Draft; set: (field: keyof Draft, value: string) => void }) {
  const field = (name: keyof Draft) => ({
    id: `agreement-${name}`,
    value: draft[name],
    onChange: (value: string) => {
      set(name, value);
    },
  });
  return (
    <>
      <p className="m-0 text-body-sm text-text-2">{t('agreement.unknown.help')}</p>
      <Choice
        {...field('commercialModel')}
        label="agreement.field.commercialModel"
        options={models.map((model) => ({ value: model, label: `agreement.model.${model}` as const }))}
      />
      <Choice
        {...field('defaultModel')}
        label="agreement.field.defaultModel"
        options={models.map((model) => ({ value: model, label: `agreement.model.${model}` as const }))}
      />
      <Choice
        {...field('ownershipEvent')}
        label="agreement.field.ownershipEvent"
        options={EVENTS.map((event) => ({ value: event, label: `agreement.event.${event}` as const }))}
      />
      {draft.ownershipEvent === 'other' && (
        <Text {...field('ownershipDescription')} label="agreement.field.ownershipDescription" />
      )}
      <Choice {...field('returnAllowed')} label="agreement.field.returnAllowed" options={YES_NO} />
      <Text {...field('returnDays')} label="agreement.field.returnDays" type="number" />
      <Text {...field('returnSeasonEnd')} label="agreement.field.returnSeasonEnd" type="date" />
      <Choice
        {...field('returnStartsAt')}
        label="agreement.field.returnStartsAt"
        options={STARTS.map((each) => ({ value: each, label: `agreement.starts.${each}` as const }))}
      />
      <Text {...field('conditionTags')} label="agreement.field.conditionTags" />
      <Text {...field('packagingLimits')} label="agreement.field.packagingLimits" />
      <Text {...field('quantityLimits')} label="agreement.field.quantityLimits" />
      <Choice {...field('supplierApproval')} label="agreement.field.supplierApproval" options={YES_NO} />
      <Text {...field('freightAndDeductions')} label="agreement.field.freightAndDeductions" />
      <Choice
        {...field('settlement')}
        label="agreement.field.settlement"
        options={SETTLEMENTS.map((each) => ({ value: each, label: `agreement.settlement.${each}` as const }))}
      />
      <Text {...field('margins')} label="agreement.field.margins" />
      <Text {...field('commissions')} label="agreement.field.commissions" />
      <Text {...field('paymentTerms')} label="agreement.field.paymentTerms" />
      <Text {...field('creditNoteTerms')} label="agreement.field.creditNoteTerms" />
      <Text {...field('promotionTerms')} label="agreement.field.promotionTerms" />
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-sm font-semibold">{t('agreement.field.cashDiscount')}</legend>
        <Text {...field('cashRate')} label="agreement.field.rate" />
        <Text {...field('cashDays')} label="agreement.field.days" type="number" />
        <Text {...field('cashFrom')} label="agreement.field.from" />
      </fieldset>
      <fieldset className="flex flex-col gap-2">
        <legend className="text-body-sm font-semibold">{t('agreement.field.interest')}</legend>
        <Text {...field('interestRate')} label="agreement.field.rate" />
        <Text {...field('interestDays')} label="agreement.field.days" type="number" />
        <Text {...field('interestFrom')} label="agreement.field.from" />
      </fieldset>
    </>
  );
}

/** A new agreement, or a new version of one, with its signed agreement stored first (S1-F06-T05). */
function AgreementForm({ agreement }: { agreement?: AgreementRecord }) {
  const today = useBusinessToday();
  const brands = useQuery(readQuery(api, 'listBrands', { query: {} }));
  const parties = useQuery(readQuery(api, 'listParties', { query: {} }));
  const creating = useSubmission('prepareAgreement', READS);
  const versioning = useSubmission('prepareAgreementVersion', READS);
  const storing = useStoreEvidence();
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<'brand' | 'supplier'>('supplier');
  const [counterpartyId, setCounterpartyId] = useState('');
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [validFrom, setValidFrom] = useState(today);
  const [file, setFile] = useState<File | null>(null);
  const submission = agreement === undefined ? creating : versioning;
  const formId = 'agreement-form';
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void (async () => {
          let signedAgreement: EvidenceFile[] = [];
          if (file !== null) {
            const stored = await storing.store(file);
            if (stored === undefined) return;
            signedAgreement = [stored];
          }
          const common = { terms: termsOf(draft), margins: orNull(draft.margins), signedAgreement, validFrom };
          if (agreement === undefined) {
            await creating.submit({
              body: {
                code,
                counterparty:
                  kind === 'brand'
                    ? { kind: 'brand', brandId: counterpartyId }
                    : { kind: 'supplier', partyId: counterpartyId },
                ...common,
              },
            });
          } else {
            await versioning.submit({
              params: { agreementId: agreement.id },
              body: {
                ...common,
                ...(agreement.versionToken === undefined ? {} : { versionToken: agreement.versionToken }),
              },
            });
          }
        })();
      }}
    >
      {storing.banner}
      <SubmissionBanner state={submission.state} />
      {agreement === undefined && (
        <>
          <Text id="agreement-code" label="organisation.field.code" value={code} onChange={setCode} />
          <FormField id="agreement-kind" label="agreement.counterparty" required>
            <select
              id="agreement-kind"
              className={inputClass}
              value={kind}
              onChange={(event) => {
                setKind(event.target.value as 'brand' | 'supplier');
                setCounterpartyId('');
              }}
            >
              <option value="supplier">{t('agreement.counterparty.supplier')}</option>
              <option value="brand">{t('agreement.counterparty.brand')}</option>
            </select>
          </FormField>
          <FormField
            id="agreement-counterparty"
            label={kind === 'brand' ? 'links.field.brand' : 'links.field.supplier'}
            required
          >
            <select
              id="agreement-counterparty"
              className={inputClass}
              value={counterpartyId}
              onChange={(event) => {
                setCounterpartyId(event.target.value);
              }}
            >
              <option value="" />
              {kind === 'brand'
                ? (brands.data?.records ?? []).map((brand) => (
                    <option key={brand.id} value={brand.id}>
                      {`${brand.code} · ${brand.versions[0]?.name ?? ''}`}
                    </option>
                  ))
                : (parties.data?.records ?? []).map((party) => (
                    <option key={party.id} value={party.id}>
                      {`${party.code} · ${party.versions[0]?.legalName ?? ''}`}
                    </option>
                  ))}
            </select>
          </FormField>
        </>
      )}
      <TermsFields
        draft={draft}
        set={(name, value) => {
          setDraft({ ...draft, [name]: value });
        }}
      />
      <EvidencePicker id="agreement-signed" label="agreement.field.signedAgreement" onChange={setFile} />
      <Text id="agreement-from" label="setup.valid-from" value={validFrom} onChange={setValidFrom} type="date" />
      <FormActions form={formId} pending={submission.state.kind === 'pending' || storing.state.kind === 'pending'} />
    </form>
  );
}

function Term({ label, children }: { label: MessageId; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <dt className="text-label font-semibold text-text-2">{t(label)}</dt>
      <dd className="m-0">{children}</dd>
    </div>
  );
}

const unknown = () => t('agreement.option.unknown');
const text = (value: string | null) => value ?? unknown();
const flag = (value: boolean | null) =>
  value === null ? unknown() : t(value ? 'agreement.option.yes' : 'agreement.option.no');

/** One version's terms, Unknown shown as Unknown, never as a default (POL-01.11; PRD-MOD-015). */
function TermsView({ version }: { version: AgreementRecord['versions'][number] }) {
  const terms = version.terms;
  const event = terms.ownershipEvent;
  const window = terms.returnRights.window;
  return (
    <dl className="grid gap-2 sm:grid-cols-2" aria-label={t('agreement.terms')}>
      <Term label="agreement.field.commercialModel">
        {terms.commercialModel === null ? unknown() : t(`agreement.model.${terms.commercialModel}`)}
      </Term>
      <Term label="agreement.field.defaultModel">
        {terms.defaultModel === null ? unknown() : t(`agreement.model.${terms.defaultModel}`)}
      </Term>
      <Term label="agreement.field.ownershipEvent">
        {event === null ? unknown() : event.kind === 'other' ? event.description : t(`agreement.event.${event.kind}`)}
      </Term>
      <Term label="agreement.field.returnAllowed">{flag(terms.returnRights.allowed)}</Term>
      <Term label="agreement.field.returnDays">
        {window === null ? unknown() : window.kind === 'days' ? String(window.days) : formatDate(window.date)}
      </Term>
      <Term label="agreement.field.returnStartsAt">
        {terms.returnRights.startsAt === null ? unknown() : t(`agreement.starts.${terms.returnRights.startsAt}`)}
      </Term>
      <Term label="agreement.field.settlement">
        {terms.returnConditions.settlement === null
          ? unknown()
          : t(`agreement.settlement.${terms.returnConditions.settlement}`)}
      </Term>
      <Term label="agreement.field.supplierApproval">{flag(terms.returnConditions.supplierApproval)}</Term>
      <Term label="agreement.field.margins">
        {version.margins.kind === 'masked' ? t('agreement.margins.masked') : text(version.margins.value)}
      </Term>
      <Term label="agreement.field.commissions">{text(terms.commissions)}</Term>
      <Term label="agreement.field.paymentTerms">{text(terms.paymentTerms)}</Term>
      <Term label="agreement.field.creditNoteTerms">{text(terms.creditNoteTerms)}</Term>
      <Term label="agreement.field.promotionTerms">{text(terms.promotionTerms)}</Term>
      <Term label="agreement.field.cashDiscount">
        {[text(terms.cashDiscount.rate), terms.cashDiscount.days ?? unknown(), text(terms.cashDiscount.from)].join(
          ' · ',
        )}
      </Term>
      <Term label="agreement.field.interest">
        {[text(terms.interest.rate), terms.interest.days ?? unknown(), text(terms.interest.from)].join(' · ')}
      </Term>
      <Term label="agreement.field.signedAgreement">
        {t('agreement.signed.count', { count: version.signedAgreement.length })}
      </Term>
    </dl>
  );
}

/** One agreement: the version in force on a chosen date, and every version with its state. */
function AgreementView({ agreement }: { agreement: AgreementRecord }) {
  const today = useBusinessToday();
  const [on, setOn] = useState(today);
  const [versioning, setVersioning] = useState(false);
  const [approval, setApproval] = useState<string | null>(null);
  const inForce = agreement.versions.find(
    (version) =>
      ['In force', 'Scheduled', 'Ended'].includes(version.state) &&
      version.validFrom <= on &&
      (version.validTo === undefined || on < version.validTo),
  );
  return (
    <div className="flex flex-col gap-4">
      <Card title="agreement.terms">
        <FormField id="agreement-on" label="agreement.in-force-on">
          <input
            id="agreement-on"
            type="date"
            className={inputClass}
            value={on}
            onChange={(event) => {
              setOn(event.target.value);
            }}
          />
        </FormField>
        {inForce === undefined ? (
          <p className="m-0 text-body-sm">{t('agreement.none-in-force')}</p>
        ) : (
          <TermsView version={inForce} />
        )}
        <p className="m-0 text-caption text-text-2">{t('agreement.costing-profile')}</p>
      </Card>
      <Card title="parties.versions">
        <Toolbar>
          <GrantedButton
            label="agreement.new-version"
            recordType="merchandise.agreement"
            action="edit"
            onClick={() => {
              setVersioning(true);
            }}
          />
        </Toolbar>
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {agreement.versions.map((version) => (
            <li key={version.id} className="flex flex-col gap-2 rounded-card border border-border p-2">
              <span className="flex items-center gap-2">
                <StatusBadge state={stateIdOf(version.state)} />
                {version.validTo === undefined
                  ? t('dates.from', { from: formatDate(version.validFrom) })
                  : t('dates.between', { from: formatDate(version.validFrom), to: formatDate(version.validTo) })}
              </span>
              {version.request !== undefined &&
                (approval === version.id ? (
                  <ApprovalPanel requestId={version.request.id} />
                ) : (
                  <div>
                    <Button
                      label="parties.bank.open-approval"
                      onClick={() => {
                        setApproval(version.id);
                      }}
                    />
                  </div>
                ))}
            </li>
          ))}
        </ul>
      </Card>
      {versioning && (
        <RecordDrawer
          title={t('agreement.new-version')}
          reference={agreement.code}
          onClose={() => {
            setVersioning(false);
          }}
          details={<AgreementForm agreement={agreement} />}
        />
      )}
    </div>
  );
}

/** Setup › Agreement. */
export function AgreementScreen() {
  const query = useQuery(readQuery(api, 'listAgreements', { query: {} }));
  const [chosen, setChosen] = useState('');
  const [adding, setAdding] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="agreement.new"
          recordType="merchandise.agreement"
          action="create"
          variant="primary"
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
      <ListRead query={query} what="parties.what.agreements">
        {(page) => {
          const shown = page.records.find((each) => each.id === chosen);
          return page.records.length === 0 ? (
            <EmptyState title="agreement.empty.title" body="agreement.empty.body" />
          ) : (
            <div className="flex flex-col gap-4">
              <FormField id="agreement-choose" label="agreement.choose">
                <select
                  id="agreement-choose"
                  className={inputClass}
                  value={chosen}
                  onChange={(event) => {
                    setChosen(event.target.value);
                  }}
                >
                  <option value="">{t('agreement.choose.none')}</option>
                  {page.records.map((each) => (
                    <option key={each.id} value={each.id}>
                      {each.code}
                    </option>
                  ))}
                </select>
              </FormField>
              {shown !== undefined && <AgreementView key={shown.id} agreement={shown} />}
            </div>
          );
        }}
      </ListRead>
      {adding && (
        <RecordDrawer
          title={t('agreement.new')}
          onClose={() => {
            setAdding(false);
          }}
          details={<AgreementForm />}
        />
      )}
    </div>
  );
}

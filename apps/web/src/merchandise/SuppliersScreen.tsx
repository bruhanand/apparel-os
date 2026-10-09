import {
  msmeClassificationSchema,
  partyRoleSchema,
  type MsmeClassification,
  type PartyRecord,
  type PartyRole,
} from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { describedBy, FormField } from '../forms/FormField';
import { t } from '../messages/catalogue';
import { useBusinessToday } from '../setup/business-date';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { BankDetails } from './BankDetails';

// Setup › Suppliers and agreements (structure-and-masters 5.1, 8; ui-blueprint Setup › Suppliers and agreements;
// S1-F03-T03): the parties, each one legal person with its versioned fields, its roles each dated on its own and its
// bank details, masked; and the brand–supplier links, many-to-many and never exclusive (PRD-MER-001, PRD-MER-021). No
// party, role or link is set in the app. A party's versions, roles and links take effect from their start when saved;
// bank details wait for a different authorised person (POL-02.07; GC2-6, DEC-105).

const PARTY_READS = ['listParties', 'readParty'] as const;
const roles = partyRoleSchema.options;
const msmeOptions = msmeClassificationSchema.options;

const dates = (validFrom: string, validTo: string | undefined) =>
  validTo === undefined
    ? t('dates.from', { from: formatDate(validFrom) })
    : t('dates.between', { from: formatDate(validFrom), to: formatDate(validTo) });

/** The version of a party in force today, else its newest. */
function current(party: PartyRecord) {
  return party.versions.find((version) => version.state === 'In force') ?? party.versions[0];
}

/** The roles a party holds today. */
function rolesHeld(party: PartyRecord): PartyRole[] {
  return party.roles.flatMap((line) =>
    line.versions.some((version) => version.state === 'In force' && version.held) ? [line.role] : [],
  );
}

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

/** A new party with its first version and roles (5.1). */
function NewPartyForm() {
  const today = useBusinessToday();
  const submission = useSubmission('prepareParty', PARTY_READS);
  const [code, setCode] = useState('');
  const [legalName, setLegalName] = useState('');
  const [taxes, setTaxes] = useState('');
  const [msme, setMsme] = useState<MsmeClassification | ''>('');
  const [contacts, setContacts] = useState('');
  const [held, setHeld] = useState<PartyRole[]>([]);
  const [validFrom, setValidFrom] = useState(today);
  const formId = 'party-form';
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submission.submit({
          body: {
            code,
            legalName,
            taxIdentities: lines(taxes).map((line) => {
              const at = line.indexOf(':');
              return at < 0
                ? { kind: line, number: line }
                : { kind: line.slice(0, at).trim(), number: line.slice(at + 1).trim() };
            }),
            msmeClassification: msme === '' ? null : msme,
            contacts: lines(contacts),
            roles: held,
            validFrom,
          },
        });
      }}
    >
      <SubmissionBanner state={submission.state} done="merchandise.recorded" />
      <FormField id={`${formId}-code`} label="organisation.field.code" required>
        <input
          id={`${formId}-code`}
          className={`${inputClass} font-mono`}
          value={code}
          onChange={(event) => {
            setCode(event.target.value);
          }}
        />
      </FormField>
      <FormField id={`${formId}-legal-name`} label="parties.field.legalName" required>
        <input
          id={`${formId}-legal-name`}
          className={inputClass}
          value={legalName}
          onChange={(event) => {
            setLegalName(event.target.value);
          }}
        />
      </FormField>
      <FormField id={`${formId}-taxes`} label="parties.field.taxIdentities" help="parties.field.taxIdentities.help">
        <textarea
          id={`${formId}-taxes`}
          rows={2}
          className="rounded-control border border-control bg-surface p-2 font-mono"
          {...describedBy(`${formId}-taxes`, { invalid: false, help: true })}
          value={taxes}
          onChange={(event) => {
            setTaxes(event.target.value);
          }}
        />
      </FormField>
      <FormField id={`${formId}-msme`} label="parties.field.msme" help="parties.field.msme.help">
        <select
          id={`${formId}-msme`}
          className={inputClass}
          {...describedBy(`${formId}-msme`, { invalid: false, help: true })}
          value={msme}
          onChange={(event) => {
            setMsme(event.target.value as MsmeClassification | '');
          }}
        >
          <option value="">{t('parties.msme.unknown')}</option>
          {msmeOptions.map((option) => (
            <option key={option} value={option}>
              {t(`parties.msme.${option}`)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={`${formId}-contacts`} label="parties.field.contacts" help="parties.field.contacts.help">
        <textarea
          id={`${formId}-contacts`}
          rows={2}
          className="rounded-control border border-control bg-surface p-2"
          {...describedBy(`${formId}-contacts`, { invalid: false, help: true })}
          value={contacts}
          onChange={(event) => {
            setContacts(event.target.value);
          }}
        />
      </FormField>
      <fieldset className="flex flex-col gap-1">
        <legend className="text-body-sm font-semibold">{t('parties.field.roles')}</legend>
        {roles.map((role) => (
          <label key={role} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={held.includes(role)}
              onChange={(event) => {
                setHeld(event.target.checked ? [...held, role] : held.filter((each) => each !== role));
              }}
            />
            {t(`parties.role.${role}`)}
          </label>
        ))}
      </fieldset>
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
      <FormActions form={formId} label="merchandise.record" pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** Hold, or stop holding, one role from a date: its own dated record (5.1). */
function RoleForm({ party }: { party: PartyRecord }) {
  const today = useBusinessToday();
  const submission = useSubmission('preparePartyRoleVersion', PARTY_READS);
  const [role, setRole] = useState<PartyRole>('supplier');
  const [heldFlag, setHeldFlag] = useState(true);
  const [validFrom, setValidFrom] = useState(today);
  const id = `party-role-${party.id}`;
  const token = party.roles.find((line) => line.role === role)?.versionToken;
  return (
    <form
      className="flex flex-col gap-2"
      aria-label={t('parties.role.add')}
      onSubmit={(event) => {
        event.preventDefault();
        void submission.submit({
          params: { partyId: party.id },
          body: { role, held: heldFlag, validFrom, ...(token === undefined ? {} : { versionToken: token }) },
        });
      }}
    >
      <SubmissionBanner state={submission.state} done="parties.role.saved" />
      <FormField id={`${id}-role`} label="parties.field.roles" required>
        <select
          id={`${id}-role`}
          className={inputClass}
          value={role}
          onChange={(event) => {
            setRole(event.target.value as PartyRole);
          }}
        >
          {roles.map((each) => (
            <option key={each} value={each}>
              {t(`parties.role.${each}`)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={`${id}-held`} label="parties.field.state" required>
        <select
          id={`${id}-held`}
          className={inputClass}
          value={heldFlag ? 'held' : 'not-held'}
          onChange={(event) => {
            setHeldFlag(event.target.value === 'held');
          }}
        >
          <option value="held">{t('parties.role.held')}</option>
          <option value="not-held">{t('parties.role.not-held')}</option>
        </select>
      </FormField>
      <FormField id={`${id}-from`} label="setup.valid-from" required>
        <input
          id={`${id}-from`}
          type="date"
          className={inputClass}
          value={validFrom}
          onChange={(event) => {
            setValidFrom(event.target.value);
          }}
        />
      </FormField>
      <div>
        <Button type="submit" label="merchandise.record" disabled={submission.state.kind === 'pending'} />
      </div>
    </form>
  );
}

/** A party in the right drawer: its versions, roles and bank details (5.1, 5.5). */
function PartyDrawer({ partyId, onClose }: { partyId: string; onClose: () => void }) {
  const query = useQuery(readQuery(api, 'readParty', { params: { partyId } }));
  const party = query.data?.record;
  const shown = party === undefined ? undefined : current(party);
  return (
    <RecordDrawer
      reference={party?.code ?? ''}
      title={shown?.legalName ?? party?.code ?? ''}
      {...(shown === undefined ? {} : { state: shown.state })}
      onClose={onClose}
      details={
        party === undefined ? null : (
          <div className="flex flex-col gap-4">
            <Card title="parties.versions">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {party.versions.map((version) => (
                  <li key={version.id} className="flex flex-col gap-1 rounded-card border border-border p-2">
                    <span className="flex items-center gap-2">
                      <StatusBadge state={stateIdOf(version.state)} />
                      {t('parties.version.title', {
                        name: version.legalName,
                        dates: dates(version.validFrom, version.validTo),
                      })}
                    </span>
                    <span className="text-body-sm text-text-2">
                      {t('parties.field.msme')}
                      {': '}
                      {t(`parties.msme.${version.msmeClassification ?? 'unknown'}`)}
                    </span>
                    {version.taxIdentities.map((tax) => (
                      <span key={`${tax.kind}:${tax.number}`} className="font-mono text-body-sm">
                        {tax.kind}
                        {': '}
                        {tax.number}
                      </span>
                    ))}
                    {version.contacts.map((contact) => (
                      <span key={contact} className="text-body-sm">
                        {contact}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
            </Card>
            <Card title="parties.roles.title">
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {party.roles.map((line) => (
                  <li key={line.role} className="flex flex-col gap-1">
                    <span className="font-semibold">{t(`parties.role.${line.role}`)}</span>
                    {line.versions.map((version) => (
                      <span key={version.id} className="flex items-center gap-2 text-body-sm">
                        <StatusBadge state={stateIdOf(version.state)} />
                        {t(version.held ? 'parties.role.held' : 'parties.role.not-held')}
                        {', '}
                        {dates(version.validFrom, version.validTo)}
                      </span>
                    ))}
                  </li>
                ))}
              </ul>
              <RoleForm party={party} />
            </Card>
            <BankDetails party={party} />
          </div>
        )
      }
    />
  );
}

/** The parties, in code order, with the roles each holds today. */
function PartiesTab() {
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const query = useQuery(readQuery(api, 'listParties', { query: {} }));
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="parties.new"
          recordType="merchandise.party"
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
      <ListRead query={query} what="parties.what.parties">
        {(page) =>
          page.records.length === 0 ? (
            <EmptyState title="parties.empty.title" body="parties.empty.body" />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-surface">
              <table className="w-full border-collapse text-body" aria-label={t('parties.tab.parties')}>
                <thead>
                  <tr>
                    <Th label="organisation.field.code" />
                    <Th label="parties.field.legalName" />
                    <Th label="parties.field.roles" />
                    <Th label="parties.field.state" />
                  </tr>
                </thead>
                <tbody>
                  {page.records.map((party) => {
                    const version = current(party);
                    const held = rolesHeld(party);
                    return (
                      <tr key={party.id} className="h-10 border-t border-border hover:bg-hover">
                        <td className="px-3">
                          <button
                            type="button"
                            className="font-mono text-accent underline"
                            onClick={() => {
                              setOpen(party.id);
                            }}
                          >
                            {party.code}
                          </button>
                        </td>
                        <td className="px-3">{version?.legalName}</td>
                        <td className="px-3">
                          {held.length === 0
                            ? t('parties.roles.none')
                            : held.map((role) => t(`parties.role.${role}`)).join(', ')}
                        </td>
                        <td className="px-3">
                          {version !== undefined && <StatusBadge state={stateIdOf(version.state)} />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        }
      </ListRead>
      {open !== null && (
        <PartyDrawer
          partyId={open}
          onClose={() => {
            setOpen(null);
          }}
        />
      )}
      {adding && (
        <RecordDrawer
          title={t('parties.new')}
          onClose={() => {
            setAdding(false);
          }}
          details={<NewPartyForm />}
        />
      )}
    </div>
  );
}

/** Link, or unlink, a brand and a supplier from a date (PRD-MER-021). */
function LinkForm() {
  const today = useBusinessToday();
  const brands = useQuery(readQuery(api, 'listBrands', { query: {} }));
  const parties = useQuery(readQuery(api, 'listParties', { query: {} }));
  const links = useQuery(readQuery(api, 'listBrandSupplierLinks', { query: {} }));
  const submission = useSubmission('prepareBrandSupplierLink', ['listBrandSupplierLinks']);
  const [brandId, setBrandId] = useState('');
  const [partyId, setPartyId] = useState('');
  const [linked, setLinked] = useState(true);
  const [validFrom, setValidFrom] = useState(today);
  const formId = 'link-form';
  const token = links.data?.records.find((each) => each.brandId === brandId && each.partyId === partyId)?.versionToken;
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submission.submit({
          body: { brandId, partyId, linked, validFrom, ...(token === undefined ? {} : { versionToken: token }) },
        });
      }}
    >
      <SubmissionBanner state={submission.state} done="merchandise.recorded" />
      <FormField id={`${formId}-brand`} label="links.field.brand" required>
        <select
          id={`${formId}-brand`}
          className={inputClass}
          value={brandId}
          onChange={(event) => {
            setBrandId(event.target.value);
          }}
        >
          <option value="" />
          {(brands.data?.records ?? []).map((brand) => (
            <option key={brand.id} value={brand.id}>
              {`${brand.code} · ${brand.versions[0]?.name ?? ''}`}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={`${formId}-party`} label="links.field.supplier" required>
        <select
          id={`${formId}-party`}
          className={inputClass}
          value={partyId}
          onChange={(event) => {
            setPartyId(event.target.value);
          }}
        >
          <option value="" />
          {(parties.data?.records ?? []).map((party) => (
            <option key={party.id} value={party.id}>
              {`${party.code} · ${current(party)?.legalName ?? ''}`}
            </option>
          ))}
        </select>
      </FormField>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={linked}
          onChange={(event) => {
            setLinked(event.target.checked);
          }}
        />
        {t('links.field.linked')}
      </label>
      <FormField id={`${formId}-from`} label="setup.valid-from" required>
        <input
          id={`${formId}-from`}
          type="date"
          className={inputClass}
          value={validFrom}
          onChange={(event) => {
            setValidFrom(event.target.value);
          }}
        />
      </FormField>
      <FormActions form={formId} label="merchandise.record" pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** The brand–supplier links, each with its dated versions. */
function LinksTab() {
  const [adding, setAdding] = useState(false);
  const query = useQuery(readQuery(api, 'listBrandSupplierLinks', { query: {} }));
  const brands = useQuery(readQuery(api, 'listBrands', { query: {} }));
  const parties = useQuery(readQuery(api, 'listParties', { query: {} }));
  const brandCode = (id: string) => brands.data?.records.find((each) => each.id === id)?.code ?? id;
  const partyCode = (id: string) => parties.data?.records.find((each) => each.id === id)?.code ?? id;
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="links.new"
          recordType="merchandise.brand_supplier_link"
          action="edit"
          variant="primary"
          onClick={() => {
            setAdding(true);
          }}
        />
      </Toolbar>
      <ListRead query={query} what="parties.what.links">
        {(page) =>
          page.records.length === 0 ? (
            <EmptyState title="links.empty.title" body="links.empty.body" />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-surface">
              <table className="w-full border-collapse text-body" aria-label={t('parties.tab.links')}>
                <thead>
                  <tr>
                    <Th label="links.field.brand" />
                    <Th label="links.field.supplier" />
                    <Th label="dates.label" />
                    <Th label="parties.field.state" />
                  </tr>
                </thead>
                <tbody>
                  {page.records.flatMap((link) =>
                    link.versions.map((version) => (
                      <tr key={version.id} className="h-10 border-t border-border">
                        <td className="px-3 font-mono">{brandCode(link.brandId)}</td>
                        <td className="px-3 font-mono">{partyCode(link.partyId)}</td>
                        <td className="px-3">{dates(version.validFrom, version.validTo)}</td>
                        <td className="px-3">
                          <span className="flex items-center gap-2">
                            <StatusBadge state={stateIdOf(version.state)} />
                            {t(version.linked ? 'links.linked' : 'links.unlinked')}
                          </span>
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          )
        }
      </ListRead>
      {adding && (
        <RecordDrawer
          title={t('links.new')}
          onClose={() => {
            setAdding(false);
          }}
          details={<LinkForm />}
        />
      )}
    </div>
  );
}

/** Setup › Suppliers and agreements. */
export function SuppliersScreen() {
  const [tab, setTab] = useState<'parties' | 'links'>('parties');
  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={t('screen.setup.suppliers-and-agreements')}
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {(['parties', 'links'] as const).map((each) => (
          <button
            key={each}
            type="button"
            role="tab"
            id={`suppliers-tab-${each}`}
            aria-selected={tab === each}
            aria-controls="suppliers-tab-panel"
            className={
              tab === each
                ? 'h-9 border-b-2 border-accent px-3 font-semibold text-text'
                : 'h-9 px-3 text-text-2 hover:text-accent'
            }
            onClick={() => {
              setTab(each);
            }}
          >
            {t(`parties.tab.${each}`)}
          </button>
        ))}
      </div>
      <div id="suppliers-tab-panel" role="tabpanel" aria-labelledby={`suppliers-tab-${tab}`}>
        {tab === 'parties' ? <PartiesTab /> : <LinksTab />}
      </div>
    </div>
  );
}

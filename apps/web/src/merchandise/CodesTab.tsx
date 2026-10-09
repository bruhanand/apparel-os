import type { CodeMapping, CodeMappingDraft, ExternalCodeKind } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { FormField } from '../forms/FormField';
import { t } from '../messages/catalogue';
import { useAllRecords, useNames } from '../organisation/MasterTab';
import { useBusinessToday } from '../setup/business-date';
import { formatDate } from '../setup/format';
import { GrantedButton, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';

// Setup › Products › Barcodes and aliases (structure-and-masters 4.3, 8; PRD-MER-006 to PRD-MER-008; S1-F03-T02):
// each code exactly as supplied, leading zeros kept, mapped to a SKU and a unit in its scope over its dates, active or
// a historical alias; a mapping that would make a code ambiguous is refused with its reason (PRD-MER-007).

const KINDS: readonly ExternalCodeKind[] = ['supplier-barcode', 'supplier-style-code', 'other', 'internal'];

const dates = (from: string, to: string | undefined) =>
  to === undefined
    ? t('dates.from', { from: formatDate(from) })
    : t('dates.between', { from: formatDate(from), to: formatDate(to) });

/** Map a code (4.3): its scope's supplier or brand, the SKU and its unit, from a date. */
function MapCodeForm() {
  const today = useBusinessToday();
  const submission = useSubmission('mapCode', ['listCodeMappings']);
  const skus = useNames('sku');
  const brands = useNames('brand');
  const packs = useAllRecords('pack');
  const [code, setCode] = useState('');
  const [kind, setKind] = useState<ExternalCodeKind>('supplier-barcode');
  const [scopeKind, setScopeKind] = useState<'organisation' | 'supplier' | 'brand'>('organisation');
  const [partyId, setPartyId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [skuId, setSkuId] = useState('');
  const [packId, setPackId] = useState('');
  const [alias, setAlias] = useState(false);
  const [validFrom, setValidFrom] = useState(today);
  const suppliers = useQuery({
    ...readQuery(api, 'listParties', { query: {} }),
    enabled: scopeKind === 'supplier',
  });
  const formId = 'code-mapping-form';
  const scope: CodeMappingDraft['scope'] =
    scopeKind === 'supplier'
      ? { kind: 'supplier', partyId }
      : scopeKind === 'brand'
        ? { kind: 'brand', brandId }
        : { kind: 'organisation' };
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submission.submit({
          body: { code, kind, scope, skuId, ...(packId === '' ? {} : { packId }), alias, validFrom },
        });
      }}
    >
      <SubmissionBanner state={submission.state} done="merchandise.recorded" />
      <FormField id={`${formId}-code`} label="products.codes.code" required>
        <input
          id={`${formId}-code`}
          className={`${inputClass} font-mono`}
          value={code}
          onChange={(event) => {
            // Kept exactly as typed: leading zeros are part of the code (PRD-MER-007).
            setCode(event.target.value);
          }}
        />
      </FormField>
      <FormField id={`${formId}-kind`} label="products.codes.kind" required>
        <select
          id={`${formId}-kind`}
          className={inputClass}
          value={kind}
          onChange={(event) => {
            setKind(event.target.value as ExternalCodeKind);
          }}
        >
          {KINDS.map((each) => (
            <option key={each} value={each}>
              {t(`products.codes.kind.${each}`)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={`${formId}-scope`} label="products.codes.scope" required>
        <select
          id={`${formId}-scope`}
          className={inputClass}
          value={scopeKind}
          onChange={(event) => {
            setScopeKind(event.target.value as typeof scopeKind);
          }}
        >
          {(['organisation', 'supplier', 'brand'] as const).map((each) => (
            <option key={each} value={each}>
              {t(`products.codes.scope.${each}`)}
            </option>
          ))}
        </select>
      </FormField>
      {scopeKind === 'supplier' && (
        <FormField id={`${formId}-supplier`} label="products.codes.supplier" required>
          <select
            id={`${formId}-supplier`}
            className={inputClass}
            value={partyId}
            onChange={(event) => {
              setPartyId(event.target.value);
            }}
          >
            <option value="">{t('organisation.choose')}</option>
            {(suppliers.data?.records ?? []).map((party) => (
              <option key={party.id} value={party.id}>
                {party.code} · {party.versions[0]?.legalName}
              </option>
            ))}
          </select>
        </FormField>
      )}
      {scopeKind === 'brand' && (
        <FormField id={`${formId}-brand`} label="merchandise.field.brandId" required>
          <select
            id={`${formId}-brand`}
            className={inputClass}
            value={brandId}
            onChange={(event) => {
              setBrandId(event.target.value);
            }}
          >
            <option value="">{t('organisation.choose')}</option>
            {[...brands].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </FormField>
      )}
      <FormField id={`${formId}-sku`} label="merchandise.field.skuId" required>
        <select
          id={`${formId}-sku`}
          className={inputClass}
          value={skuId}
          onChange={(event) => {
            setSkuId(event.target.value);
            setPackId('');
          }}
        >
          <option value="">{t('organisation.choose')}</option>
          {[...skus].map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={`${formId}-pack`} label="products.codes.pack" required>
        <select
          id={`${formId}-pack`}
          className={inputClass}
          value={packId}
          onChange={(event) => {
            setPackId(event.target.value);
          }}
        >
          <option value="">{t('products.codes.stock-unit')}</option>
          {packs
            .filter((pack) => pack.skuId === skuId)
            .map((pack) => (
              <option key={pack.id} value={pack.id}>
                {pack.code}
              </option>
            ))}
        </select>
      </FormField>
      <label className="flex items-center gap-2 text-body-sm">
        <input
          type="checkbox"
          checked={alias}
          onChange={(event) => {
            setAlias(event.target.checked);
          }}
        />
        {t('products.codes.alias')}
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

/** End one mapping on a date, today or later (4.3; PRD-MER-007): the mapping is kept as it was before then. */
function EndMapping({ mapping }: { mapping: CodeMapping }) {
  const today = useBusinessToday();
  const submission = useSubmission('endCodeMapping', ['listCodeMappings']);
  const [validTo, setValidTo] = useState(today);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        aria-label={t('products.codes.ends')}
        type="date"
        className={inputClass}
        value={validTo}
        onChange={(event) => {
          setValidTo(event.target.value);
        }}
      />
      <Button
        size="small"
        label="products.codes.end"
        disabled={submission.state.kind === 'pending'}
        onClick={() => {
          void submission.submit({ params: { mappingId: mapping.id }, body: { validTo } });
        }}
      />
      <SubmissionBanner state={submission.state} done="merchandise.recorded" />
    </div>
  );
}

/** The barcodes and aliases of every SKU. */
export function CodesTab() {
  const [mapping, setMapping] = useState(false);
  const query = useQuery(readQuery(api, 'listCodeMappings', { query: {} }));
  const skus = useNames('sku');
  const brands = useNames('brand');
  const packs = useNames('pack');
  const scopeText = (each: CodeMapping) =>
    each.scope.kind === 'brand'
      ? `${t('products.codes.scope.brand')}: ${brands.get(each.scope.brandId) ?? each.scope.brandId}`
      : t(`products.codes.scope.${each.scope.kind}`);
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="products.codes.map"
          recordType="merchandise.external_code"
          action="create"
          variant="primary"
          onClick={() => {
            setMapping(true);
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
      <ListRead query={query} what="merchandise.what.external_code">
        {(page) =>
          page.records.length === 0 ? (
            <EmptyState title="products.codes.empty.title" body="products.codes.empty.body" />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-surface">
              <table className="w-full border-collapse text-body" aria-label={t('products.tab.codes')}>
                <thead>
                  <tr>
                    <Th label="products.codes.code" />
                    <Th label="products.codes.kind" />
                    <Th label="products.codes.scope" />
                    <Th label="merchandise.field.skuId" />
                    <Th label="products.codes.pack" />
                    <Th label="dates.label" />
                    <Th label="organisation.change" />
                  </tr>
                </thead>
                <tbody>
                  {page.records.map((each) => (
                    <tr key={each.id} className="border-t border-border align-top hover:bg-hover">
                      <td className="px-3 py-2 font-mono">{each.code}</td>
                      <td className="px-3 py-2">
                        {t(`products.codes.kind.${each.kind}`)}
                        {' · '}
                        {t(each.alias ? 'products.codes.alias' : 'products.codes.active')}
                      </td>
                      <td className="px-3 py-2">{scopeText(each)}</td>
                      <td className="px-3 py-2">{skus.get(each.skuId) ?? each.skuId}</td>
                      <td className="px-3 py-2">
                        {each.packId === undefined
                          ? t('products.codes.stock-unit')
                          : (packs.get(each.packId) ?? each.packId)}
                      </td>
                      <td className="px-3 py-2">{dates(each.validFrom, each.validTo)}</td>
                      <td className="px-3 py-2">
                        <EndMapping mapping={each} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }
      </ListRead>
      {mapping && (
        <RecordDrawer
          title={t('products.codes.map')}
          onClose={() => {
            setMapping(false);
          }}
          details={<MapCodeForm />}
        />
      )}
    </div>
  );
}

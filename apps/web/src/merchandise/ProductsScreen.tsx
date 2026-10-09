import type { ProductProposal, ProductProposalDraft, ProposedSku } from '@apparel-os/schemas';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { ApprovalPanel } from '../approvals/ApprovalPanel';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { StatusBadge } from '../components/StatusBadge';
import { FormField } from '../forms/FormField';
import { t, type MessageId } from '../messages/catalogue';
import { MasterTab, useAllRecords, useNames, versionOn } from '../organisation/MasterTab';
import { useBusinessToday } from '../setup/business-date';
import { formatDate } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Th, Toolbar } from '../setup/parts';
import { FormActions, RecordDrawer } from '../setup/RecordDrawer';
import { stateIdOf } from '../setup/states';
import { CodesTab } from './CodesTab';

// Setup › Products (structure-and-masters 4.1 to 4.3, 8; ui-blueprint Setup › Products; S1-F03-T02): styles, SKUs,
// barcodes and aliases, and product proposals. A new style or SKU enters the catalogue only when a different person
// from its proposer confirms its proposal from My work (4.2; DM-5, DEC-105); nothing is filled from a guess
// (PRD-IMP-009). Unknown shows as Unknown, never blank or zero. No product, size, code or unit is set in the app.

type TabId = 'style' | 'sku' | 'codes' | 'proposals';
const TABS: readonly { id: TabId; label: MessageId }[] = [
  { id: 'style', label: 'products.tab.style' },
  { id: 'sku', label: 'products.tab.sku' },
  { id: 'codes', label: 'products.tab.codes' },
  { id: 'proposals', label: 'products.tab.proposals' },
];

const STOCK_UNITS = ['piece', 'pair', 'pack'] as const;
const PURPOSES = ['merchandise', 'gift-with-purchase', 'promotional', 'packaging'] as const;

/** A SKU row of the form: an empty size or identity value is Unknown (PRD-MER-005). */
interface SkuRow {
  readonly code: string;
  readonly size: string;
  /** Each identity attribute's value: a vocabulary value of a list-type attribute, or text (4.2). */
  readonly identity: Readonly<Record<string, { readonly list: boolean; readonly value: string }>>;
  readonly stockUnit: ProposedSku['stockUnit'] | '';
  readonly purpose: ProposedSku['purpose'] | '';
}
const emptySku = (): SkuRow => ({ code: '', size: '', identity: {}, stockUnit: '', purpose: '' });

/** The category's size set and identity attributes in force today, to choose from (4.1). */
function useCategoryFacts(categoryId: string) {
  const today = useBusinessToday();
  const categories = useAllRecords('category');
  const sizeSets = useAllRecords('size_set');
  const attributes = useAllRecords('attribute');
  const values = useAllRecords('vocabulary_value');
  const category = categories.find((each) => each.id === categoryId);
  const version = category === undefined ? undefined : versionOn(category, today);
  const sizeSet = sizeSets.find((each) => each.id === version?.sizeSetId);
  const sizeVersion = sizeSet === undefined ? undefined : versionOn(sizeSet, today);
  const sizes = Array.isArray(sizeVersion?.sizes) ? (sizeVersion.sizes as string[]) : [];
  const identityIds = Array.isArray(version?.identityAttributeIds) ? (version.identityAttributeIds as string[]) : [];
  const identity = identityIds.flatMap((id) => {
    const attribute = attributes.find((each) => each.id === id);
    if (attribute === undefined) return [];
    const name = attribute.versions[0]?.name;
    return [
      {
        id,
        name: typeof name === 'string' ? name : attribute.code,
        list: attribute.valueKind === 'list',
        values: values
          .filter((each) => each.attributeId === id && versionOn(each, today) !== undefined)
          .map((each) => {
            const valueName = versionOn(each, today)?.name;
            return { id: each.id, name: typeof valueName === 'string' ? `${each.code} · ${valueName}` : each.code };
          }),
      },
    ];
  });
  return { sizes, identity };
}

/** One SKU of a proposal (4.1; PRD-MER-005, POL-04.03, PRD-MER-019). */
function SkuFields({
  index,
  row,
  categoryId,
  onChange,
  onRemove,
}: {
  index: number;
  row: SkuRow;
  categoryId: string;
  onChange: (row: SkuRow) => void;
  onRemove: (() => void) | undefined;
}) {
  const { sizes, identity } = useCategoryFacts(categoryId);
  const id = `product-sku-${String(index)}`;
  return (
    <fieldset
      className="flex flex-col gap-3 rounded-card border border-border p-3"
      aria-label={t('products.sku.number', { number: index + 1 })}
    >
      <legend className="px-1 text-body-sm font-semibold">{t('products.sku.number', { number: index + 1 })}</legend>
      <FormField id={`${id}-code`} label="organisation.field.code" required>
        <input
          id={`${id}-code`}
          className={`${inputClass} font-mono`}
          value={row.code}
          onChange={(event) => {
            onChange({ ...row, code: event.target.value });
          }}
        />
      </FormField>
      <FormField id={`${id}-size`} label="merchandise.field.size">
        <select
          id={`${id}-size`}
          className={inputClass}
          value={row.size}
          onChange={(event) => {
            onChange({ ...row, size: event.target.value });
          }}
        >
          <option value="">{t('organisation.unknown')}</option>
          {sizes.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </select>
      </FormField>
      {identity.map((attribute) => (
        <div key={attribute.id} className="flex flex-col gap-1">
          <label htmlFor={`${id}-${attribute.id}`} className="text-body-sm font-semibold text-text">
            {attribute.name}
          </label>
          {attribute.list ? (
            <select
              id={`${id}-${attribute.id}`}
              className={inputClass}
              value={row.identity[attribute.id]?.value ?? ''}
              onChange={(event) => {
                onChange({
                  ...row,
                  identity: { ...row.identity, [attribute.id]: { list: true, value: event.target.value } },
                });
              }}
            >
              <option value="">{t('organisation.unknown')}</option>
              {attribute.values.map((value) => (
                <option key={value.id} value={value.id}>
                  {value.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              id={`${id}-${attribute.id}`}
              className={inputClass}
              value={row.identity[attribute.id]?.value ?? ''}
              onChange={(event) => {
                onChange({
                  ...row,
                  identity: { ...row.identity, [attribute.id]: { list: false, value: event.target.value } },
                });
              }}
            />
          )}
        </div>
      ))}
      <FormField id={`${id}-unit`} label="merchandise.field.stockUnit" required>
        <select
          id={`${id}-unit`}
          className={inputClass}
          value={row.stockUnit}
          onChange={(event) => {
            onChange({ ...row, stockUnit: event.target.value as SkuRow['stockUnit'] });
          }}
        >
          <option value="">{t('organisation.choose')}</option>
          {STOCK_UNITS.map((unit) => (
            <option key={unit} value={unit}>
              {t(`merchandise.stock-unit.${unit}`)}
            </option>
          ))}
        </select>
      </FormField>
      <FormField id={`${id}-purpose`} label="merchandise.field.purpose" required>
        <select
          id={`${id}-purpose`}
          className={inputClass}
          value={row.purpose}
          onChange={(event) => {
            onChange({ ...row, purpose: event.target.value as SkuRow['purpose'] });
          }}
        >
          <option value="">{t('organisation.choose')}</option>
          {PURPOSES.map((purpose) => (
            <option key={purpose} value={purpose}>
              {t(`merchandise.purpose.${purpose}`)}
            </option>
          ))}
        </select>
      </FormField>
      {onRemove !== undefined && (
        <div>
          <Button size="small" variant="ghost" label="products.sku.remove" onClick={onRemove} />
        </div>
      )}
    </fieldset>
  );
}

/** The draft the form sends: only what was given; an empty optional value is Unknown, never a default (2.4). */
function draftOf(form: {
  mode: 'new' | 'existing';
  styleId: string;
  code: string;
  brandId: string;
  categoryId: string;
  brandArticleNumber: string;
  hsn: string;
  sourceWords: string;
  skus: readonly SkuRow[];
}): ProductProposalDraft {
  const given = (text: string) => (text.trim() === '' ? {} : { value: text.trim() });
  const skus = form.skus.map((row): ProposedSku => ({
    code: row.code.trim(),
    ...(row.size === '' ? {} : { size: row.size }),
    identity: Object.entries(row.identity)
      .filter(([, given]) => given.value.trim() !== '')
      .map(([attributeId, given]) =>
        given.list ? { attributeId, valueId: given.value } : { attributeId, text: given.value.trim() },
      ),
    stockUnit: row.stockUnit as ProposedSku['stockUnit'],
    purpose: row.purpose as ProposedSku['purpose'],
  }));
  const article = given(form.brandArticleNumber);
  const hsn = given(form.hsn);
  const words = given(form.sourceWords);
  return {
    ...(form.mode === 'new'
      ? {
          style: {
            code: form.code.trim(),
            brandId: form.brandId,
            categoryId: form.categoryId,
            ...('value' in article ? { brandArticleNumber: article.value } : {}),
            ...('value' in hsn ? { hsn: hsn.value } : {}),
            attributes: [],
          },
        }
      : { styleId: form.styleId }),
    skus,
    ...('value' in words ? { sourceWords: words.value } : {}),
  };
}

/** Propose a product (4.2; PRD-MER-013): a new style with its SKUs, or new SKUs of an existing style. */
function ProposeProductForm() {
  const submission = useSubmission('proposeProduct', ['listProductProposals', 'listMyWork']);
  const brands = useNames('brand');
  const categories = useNames('category');
  const styles = useAllRecords('style');
  const styleNames = useNames('style');
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [styleId, setStyleId] = useState('');
  const [code, setCode] = useState('');
  const [brandId, setBrandId] = useState('');
  const [chosenCategory, setCategoryId] = useState('');
  const [brandArticleNumber, setArticle] = useState('');
  const [hsn, setHsn] = useState('');
  const [sourceWords, setSourceWords] = useState('');
  const [skus, setSkus] = useState<SkuRow[]>([emptySku()]);
  const styleCategory = styles.find((each) => each.id === styleId)?.categoryId;
  const categoryId = mode === 'new' ? chosenCategory : typeof styleCategory === 'string' ? styleCategory : '';
  const formId = 'product-proposal-form';
  return (
    <form
      id={formId}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        void submission.submit({
          body: draftOf({
            mode,
            styleId,
            code,
            brandId,
            categoryId,
            brandArticleNumber,
            hsn,
            sourceWords,
            skus,
          }),
        });
      }}
    >
      <SubmissionBanner state={submission.state} />
      <p className="m-0 text-body-sm text-text-2">{t('products.propose.help')}</p>
      <FormField id={`${formId}-mode`} label="products.style">
        <select
          id={`${formId}-mode`}
          className={inputClass}
          value={mode}
          onChange={(event) => {
            setMode(event.target.value === 'existing' ? 'existing' : 'new');
          }}
        >
          <option value="new">{t('products.style.new')}</option>
          <option value="existing">{t('products.style.existing')}</option>
        </select>
      </FormField>
      {mode === 'existing' ? (
        <FormField id={`${formId}-style`} label="merchandise.field.styleId" required>
          <select
            id={`${formId}-style`}
            className={inputClass}
            value={styleId}
            onChange={(event) => {
              setStyleId(event.target.value);
            }}
          >
            <option value="">{t('organisation.choose')}</option>
            {[...styleNames].map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </FormField>
      ) : (
        <>
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
          <FormField id={`${formId}-category`} label="merchandise.field.categoryId" required>
            <select
              id={`${formId}-category`}
              className={inputClass}
              value={chosenCategory}
              onChange={(event) => {
                setCategoryId(event.target.value);
              }}
            >
              <option value="">{t('organisation.choose')}</option>
              {[...categories].map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField id={`${formId}-article`} label="merchandise.field.brandArticleNumber">
            <input
              id={`${formId}-article`}
              className={inputClass}
              value={brandArticleNumber}
              onChange={(event) => {
                setArticle(event.target.value);
              }}
            />
          </FormField>
          <FormField id={`${formId}-hsn`} label="merchandise.field.hsn">
            <input
              id={`${formId}-hsn`}
              className={`${inputClass} font-mono`}
              value={hsn}
              onChange={(event) => {
                setHsn(event.target.value);
              }}
            />
          </FormField>
        </>
      )}
      <h3 className="m-0 text-h3">{t('products.skus')}</h3>
      {skus.map((row, index) => (
        <SkuFields
          key={index}
          index={index}
          row={row}
          categoryId={categoryId}
          onChange={(changed) => {
            setSkus(skus.map((each, at) => (at === index ? changed : each)));
          }}
          onRemove={
            skus.length > 1
              ? () => {
                  setSkus(skus.filter((_, at) => at !== index));
                }
              : undefined
          }
        />
      ))}
      <div>
        <Button
          size="small"
          label="products.sku.add"
          onClick={() => {
            setSkus([...skus, emptySku()]);
          }}
        />
      </div>
      <FormField id={`${formId}-words`} label="products.source-words">
        <textarea
          id={`${formId}-words`}
          rows={3}
          className="rounded-control border border-control bg-surface p-2"
          value={sourceWords}
          onChange={(event) => {
            setSourceWords(event.target.value);
          }}
        />
      </FormField>
      <FormActions form={formId} pending={submission.state.kind === 'pending'} />
    </form>
  );
}

/** The style code a proposal names: its new style's, or the existing style's. */
function proposalTitle(proposal: ProductProposal, styleNames: ReadonlyMap<string, string>): string {
  if (proposal.style !== undefined) return proposal.style.code;
  return styleNames.get(proposal.styleId ?? '') ?? proposal.styleId ?? '';
}

/** The product proposals, each opening its approval panel, where a different person confirms it (4.2). */
function ProposalsTab() {
  const [proposing, setProposing] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const query = useQuery(readQuery(api, 'listProductProposals', { query: {} }));
  const styleNames = useNames('style');
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <GrantedButton
          label="products.propose"
          recordType="merchandise.product_proposal"
          action="create"
          variant="primary"
          onClick={() => {
            setProposing(true);
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
      <ListRead query={query} what="merchandise.what.product_proposal">
        {(page) => {
          const shown = page.records.find((each) => each.id === open);
          return page.records.length === 0 ? (
            <EmptyState title="products.proposals.empty.title" body="products.proposals.empty.body" />
          ) : (
            <div className="overflow-x-auto rounded-card border border-border bg-surface">
              <table className="w-full border-collapse text-body" aria-label={t('products.tab.proposals')}>
                <thead>
                  <tr>
                    <Th label="products.style" />
                    <Th label="products.proposal.skus" />
                    <Th label="merchandise.proposal.proposed-on" />
                    <Th label="merchandise.proposal.state" />
                  </tr>
                </thead>
                <tbody>
                  {page.records.map((proposal) => (
                    <tr key={proposal.id} className="h-10 border-t border-border hover:bg-hover">
                      <td className="px-3">
                        <button
                          type="button"
                          className="font-mono text-accent underline"
                          onClick={() => {
                            setOpen(proposal.id);
                          }}
                        >
                          {proposalTitle(proposal, styleNames)}
                        </button>
                      </td>
                      <td className="px-3 font-mono">{proposal.skus.map((sku) => sku.code).join(', ')}</td>
                      <td className="px-3">{formatDate(proposal.proposedAt.slice(0, 10))}</td>
                      <td className="px-3">
                        <StatusBadge state={stateIdOf(proposal.state)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {shown !== undefined && (
                <RecordDrawer
                  reference={proposalTitle(shown, styleNames)}
                  title={t('record-type.merchandise.product_proposal')}
                  state={shown.state}
                  onClose={() => {
                    setOpen(null);
                  }}
                  details={
                    shown.request === undefined ? (
                      <p className="m-0 text-body-sm text-text-2">{t('merchandise.proposal.no-request')}</p>
                    ) : (
                      <ApprovalPanel requestId={shown.request.id} />
                    )
                  }
                />
              )}
            </div>
          );
        }}
      </ListRead>
      {proposing && (
        <RecordDrawer
          title={t('products.propose')}
          onClose={() => {
            setProposing(false);
          }}
          details={<ProposeProductForm />}
        />
      )}
    </div>
  );
}

/** Setup › Products. */
export function ProductsScreen() {
  const [current, setCurrent] = useState<TabId>('style');
  return (
    <div className="flex flex-col gap-4">
      <div
        role="tablist"
        aria-label={t('screen.setup.products')}
        className="flex flex-wrap gap-2 border-b border-border"
      >
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`products-tab-${tab.id}`}
            aria-selected={current === tab.id}
            aria-controls="products-tab-panel"
            className={
              current === tab.id
                ? 'h-9 border-b-2 border-accent px-3 font-semibold text-text'
                : 'h-9 px-3 text-text-2 hover:text-accent'
            }
            onClick={() => {
              setCurrent(tab.id);
            }}
          >
            {t(tab.label)}
          </button>
        ))}
      </div>
      <div id="products-tab-panel" role="tabpanel" aria-labelledby={`products-tab-${current}`}>
        {current === 'style' && <MasterTab kind="style" />}
        {current === 'sku' && <MasterTab kind="sku" />}
        {current === 'codes' && (
          <Card>
            <CodesTab />
          </Card>
        )}
        {current === 'proposals' && <ProposalsTab />}
      </div>
    </div>
  );
}

import {
  DAMAGE_REPORT_TYPE,
  STOCK_SEARCH_TEXT_CAP,
  stockConditionSchema,
  type StockCost,
  type StockElsewhere,
  type StockPosition,
  type StockProduct,
  type StockSearch,
  type StockSearchFilters,
  type StockSearchNames,
} from '@apparel-os/schemas';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Fragment, useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { ApiFailure, readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { EmptyState } from '../components/StandardStates';
import { FormField } from '../forms/FormField';
import { AsOf } from '../history/AsOf';
import { t, type MessageId } from '../messages/catalogue';
import { inForce, optionText, unknownText } from '../receiving/names';
import { formatList, formatPaise, formatQuantity } from '../setup/format';
import { inputClass, ListRead, SubmissionBanner, Th, Toolbar, useGranted } from '../setup/parts';
import { useTimeZone } from '../shell/session';
import { ReportDamage } from './DamageReport';

// Stock › Stock search (goods-in 9.1, 9.2, 9.4, section 11; ui-blueprint Stock "Stock explorer"; PRD-STK-001,
// PRD-STK-006, PRD-DMG-004, PRD-ACS-008; S2-F11-T01): search stock by style code or product, brand, size, barcode,
// place and condition; each result a product at a place with its quantities apart, physical, available to sell at a
// Store or to move at a warehouse, waiting and held by kind; the same product at the other Stores and warehouses the
// person may see; goods before PT approval by their counted style code, colour and size; cost only for whoever may see
// it, hidden otherwise; the time it was read; Load more; export as XLSX as shown; and, from a product's result, damage
// reported on it at its location (goods-in 8.1, 8.5). Every word comes from the message catalogue (code-house-rules
// 12.13); numbers through Intl (design-language 8); a name the person cannot read is Unknown (PRD-MOD-015).

type Filters = StockSearchFilters;

/** One page of the search, after the cursor the server gave, or the refusal thrown as ApiFailure. */
async function readPage(filters: Filters, after: string | undefined): Promise<StockSearch> {
  const result = await api.call('searchStock', { query: { ...filters, ...(after === undefined ? {} : { after }) } });
  if (result.ok) return result.data;
  throw new ApiFailure(result.status, result.error);
}

/** A record the answer names, as "CODE · Name", or Unknown. */
function nameIn(list: readonly { readonly id: string; readonly code: string; readonly name: string }[], id: string) {
  const found = list.find((each) => each.id === id);
  return found === undefined ? unknownText() : t('receive.option', { code: found.code, name: found.name });
}

/** The goods of a result (goods-in 9.2): a product by its codes, goods as counted before their PT, or unidentified. */
export function productText(product: StockProduct | undefined): string {
  if (product === undefined) return unknownText();
  if (product.kind === 'unidentified') return t('stock-search.goods.unidentified');
  if (product.kind === 'counted') {
    return t('stock-search.goods.counted', {
      style: product.styleCode,
      colour: product.colour ?? unknownText(),
      size: product.size ?? unknownText(),
    });
  }
  return t('scan.product', {
    code: product.code ?? unknownText(),
    style: product.styleCode ?? unknownText(),
    size: product.size ?? unknownText(),
  });
}

/** A product's identity, such as its colour, and its brand's article number, as one line, or nothing. */
export function productDetail(product: StockProduct): string | null {
  if (product.kind !== 'product') return null;
  const identity = product.identity.map((value) => {
    if (value.kind === 'value') return value.name ?? value.code;
    if (value.kind === 'text') return value.text;
    return unknownText();
  });
  const parts = [
    ...(identity.length === 0 ? [] : [formatList(identity)]),
    ...(product.articleNumber === null ? [] : [t('stock-search.article', { number: product.articleNumber })]),
  ];
  return parts.length === 0 ? null : formatList(parts);
}

function costText(cost: StockCost): string {
  if (cost.kind === 'known') return formatPaise(cost.value);
  if (cost.kind === 'unknown') return unknownText();
  return t('stock-search.cost.masked');
}

/** The place of a result: its Site, business unit and location (goods-in 9.2). */
function placeText(names: StockSearchNames, position: StockPosition): string {
  return t('stock-search.place', {
    site: nameIn(names.sites, position.siteId),
    unit: nameIn(names.businessUnits, position.businessUnitId),
    location: nameIn(names.locations, position.locationId),
  });
}

/** Available, with what it is available for: to sell at a Store, to move at a warehouse (goods-in 9.2). */
function Available({ row }: { row: StockPosition | StockElsewhere }) {
  return (
    <span className="flex flex-col">
      <span className="tabular-nums">{formatQuantity(row.available)}</span>
      <span className="text-caption text-text-2">{t(`stock-search.available.${row.availableAs}`)}</span>
    </span>
  );
}

function Held({ position }: { position: StockPosition }) {
  return (
    <span className="flex flex-col">
      <span className="tabular-nums">{formatQuantity(position.held)}</span>
      {position.heldByKind.map((each) => (
        <span key={each.kind} className="text-caption text-text-2">
          {t('stock-search.held.kind', { kind: t(`hold-kind.${each.kind}`), count: formatQuantity(each.quantity) })}
        </span>
      ))}
    </span>
  );
}

const cell = 'border-t border-border px-3 py-2 align-top';

/** The results of the pages read, a product at a place each, and damage reported from one (goods-in 8.1, 9.2). */
function Results({ pages }: { pages: readonly StockSearch[] }) {
  const mayReport = useGranted(DAMAGE_REPORT_TYPE, 'create');
  const [reporting, setReporting] = useState<string | null>(null);
  const positions = pages.flatMap((page) => page.positions.map((position) => ({ position, names: page.names })));
  const keyOf = (position: StockPosition) => `${position.productKey}|${position.locationId}`;
  return (
    <div className="overflow-x-auto rounded-card border border-border bg-surface">
      <table className="w-full border-collapse text-body" aria-label={t('stock-search.results')}>
        <thead>
          <tr>
            <Th label="stock-search.column.goods" />
            <Th label="stock-search.column.brand" />
            <Th label="stock-search.column.place" />
            <Th label="stock-search.column.physical" />
            <Th label="stock-search.column.available" />
            <Th label="stock-search.column.waiting" />
            <Th label="stock-search.column.held" />
            <Th label="stock-search.column.cost" />
            <Th label="stock-search.column.actions" />
          </tr>
        </thead>
        <tbody>
          {positions.map(({ position, names }) => {
            const key = keyOf(position);
            const detail = productDetail(position.product);
            const { product } = position;
            return (
              <Fragment key={key}>
                <tr>
                  <td className={cell}>
                    <span className="flex flex-col">
                      <span className="font-semibold">{productText(product)}</span>
                      {detail !== null && <span className="text-caption text-text-2">{detail}</span>}
                      {position.frozen && <span className="text-caption text-text-2">{t('stock-search.frozen')}</span>}
                    </span>
                  </td>
                  <td className={cell}>{nameIn(names.brands, position.brandId)}</td>
                  <td className={cell}>{placeText(names, position)}</td>
                  <td className={`${cell} tabular-nums`}>{formatQuantity(position.physical)}</td>
                  <td className={cell}>
                    <Available row={position} />
                  </td>
                  <td className={`${cell} tabular-nums`}>{formatQuantity(position.waiting)}</td>
                  <td className={cell}>
                    <Held position={position} />
                  </td>
                  <td className={`${cell} tabular-nums`}>{costText(position.cost)}</td>
                  <td className={cell}>
                    {product.kind === 'product' && mayReport && (
                      <Button
                        size="small"
                        label={reporting === key ? 'stock-search.damage.close' : 'stock-search.damage.report'}
                        onClick={() => {
                          setReporting(reporting === key ? null : key);
                        }}
                      />
                    )}
                  </td>
                </tr>
                {reporting === key && product.kind === 'product' && (
                  <tr>
                    <td className={cell} colSpan={9}>
                      <p className="m-0 mb-2 text-body-sm text-text-2">
                        {t('stock-search.damage.intro', {
                          product: productText(product),
                          place: placeText(names, position),
                        })}
                      </p>
                      <ReportDamage
                        goods={{ kind: 'product', skuId: product.skuId }}
                        locationId={position.locationId}
                      />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The same products at the other Stores and warehouses the person may see (goods-in 9.2; PRD-STK-006). */
function Elsewhere({ pages }: { pages: readonly StockSearch[] }) {
  const rows = pages.flatMap((page) => page.elsewhere.map((each) => ({ each, page })));
  if (rows.length === 0) return null;
  const productOf = (key: string) =>
    pages.flatMap((page) => page.positions).find((position) => position.productKey === key)?.product;
  return (
    <section className="flex flex-col gap-2" aria-label={t('stock-search.elsewhere')}>
      <h3 className="text-h3 font-semibold">{t('stock-search.elsewhere')}</h3>
      <div className="overflow-x-auto rounded-card border border-border bg-surface">
        <table className="w-full border-collapse text-body" aria-label={t('stock-search.elsewhere')}>
          <thead>
            <tr>
              <Th label="stock-search.column.goods" />
              <Th label="stock-search.column.place" />
              <Th label="stock-search.column.physical" />
              <Th label="stock-search.column.available" />
              <Th label="stock-search.column.waiting" />
              <Th label="stock-search.column.held" />
            </tr>
          </thead>
          <tbody>
            {rows.map(({ each, page }) => (
              <tr key={`${each.productKey}|${each.businessUnitId}`}>
                <td className={cell}>{productText(productOf(each.productKey))}</td>
                <td className={cell}>
                  {t('stock-search.unit', {
                    site: nameIn(page.names.sites, each.siteId),
                    unit: nameIn(page.names.businessUnits, each.businessUnitId),
                  })}
                </td>
                <td className={`${cell} tabular-nums`}>{formatQuantity(each.physical)}</td>
                <td className={cell}>
                  <Available row={each} />
                </td>
                <td className={`${cell} tabular-nums`}>{formatQuantity(each.waiting)}</td>
                <td className={`${cell} tabular-nums`}>{formatQuantity(each.held)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** The lists the place and brand filters choose from, as far as the person may read them. */
export function useFilterLists() {
  const brands = useQuery({
    ...readQuery(api, 'listBrands', { query: {} }),
    enabled: useGranted('merchandise.brand', 'view'),
  });
  const sites = useQuery({
    ...readQuery(api, 'listSites', { query: {} }),
    enabled: useGranted('organisation.site', 'view'),
  });
  const units = useQuery({
    ...readQuery(api, 'listBusinessUnits', { query: {} }),
    enabled: useGranted('organisation.business_unit', 'view'),
  });
  const locations = useQuery({
    ...readQuery(api, 'listLocations', { query: {} }),
    enabled: useGranted('organisation.location', 'view'),
  });
  return {
    brands: inForce(brands.data?.records),
    sites: inForce(sites.data?.records),
    units: inForce(units.data?.records),
    locations: inForce(locations.data?.records),
  };
}

function Select({
  id,
  label,
  value,
  options,
  onChange,
}: {
  id: string;
  label: MessageId;
  value: string;
  options: readonly { readonly value: string; readonly text: string }[];
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
        <option value="">{t('stock-search.filter.any')}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.text}
          </option>
        ))}
      </select>
    </FormField>
  );
}

/** The fields typed, and the fields chosen from a list. */
type TextField = 'text' | 'size' | 'barcode';
type ChoiceField = 'brandId' | 'siteId' | 'businessUnitId' | 'locationId' | 'condition';
type Draft = Readonly<Record<TextField | ChoiceField, string>>;
const EMPTY: Draft = {
  text: '',
  size: '',
  barcode: '',
  brandId: '',
  siteId: '',
  businessUnitId: '',
  locationId: '',
  condition: '',
};

/** The filters of what the person typed and chose: a blank field filters nothing. */
function filtersOf(draft: Draft): Filters {
  const text = (field: TextField) => {
    const value = draft[field].trim();
    return value === '' ? {} : { [field]: value };
  };
  const choice = (field: Exclude<ChoiceField, 'condition'>) => (draft[field] === '' ? {} : { [field]: draft[field] });
  const condition = stockConditionSchema.safeParse(draft.condition);
  return {
    ...text('text'),
    ...text('size'),
    ...text('barcode'),
    ...choice('brandId'),
    ...choice('siteId'),
    ...choice('businessUnitId'),
    ...choice('locationId'),
    ...(condition.success ? { condition: condition.data } : {}),
  };
}

/** The search form: what the person looks for (goods-in 9.2). The search runs when sent. */
function SearchForm({ onSearch }: { onSearch: (filters: Filters) => void }) {
  const lists = useFilterLists();
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const set = (field: keyof Draft) => (value: string) => {
    setDraft({
      ...draft,
      [field]: value,
      // A narrower place belongs to the wider one chosen.
      ...(field === 'siteId' ? { businessUnitId: '', locationId: '' } : {}),
      ...(field === 'businessUnitId' ? { locationId: '' } : {}),
    });
  };
  const options = (records: readonly Parameters<typeof optionText>[0][]) =>
    records.map((record) => ({ value: record.id, text: optionText(record) }));
  const text = (field: TextField, label: MessageId) => (
    <FormField id={`stock-search-${field}`} label={label}>
      <input
        id={`stock-search-${field}`}
        className={inputClass}
        maxLength={STOCK_SEARCH_TEXT_CAP}
        autoComplete="off"
        value={draft[field]}
        onChange={(event) => {
          set(field)(event.target.value);
        }}
      />
    </FormField>
  );
  return (
    <form
      role="search"
      aria-label={t('stock-search.form')}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        onSearch(filtersOf(draft));
      }}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        {text('text', 'stock-search.filter.text')}
        {text('size', 'stock-search.filter.size')}
        {text('barcode', 'stock-search.filter.barcode')}
        <Select
          id="stock-search-brand"
          label="stock-search.filter.brand"
          value={draft.brandId}
          options={options(lists.brands)}
          onChange={set('brandId')}
        />
        <Select
          id="stock-search-site"
          label="stock-search.filter.site"
          value={draft.siteId}
          options={options(lists.sites)}
          onChange={set('siteId')}
        />
        <Select
          id="stock-search-unit"
          label="stock-search.filter.unit"
          value={draft.businessUnitId}
          options={options(lists.units.filter((unit) => draft.siteId === '' || unit.siteId === draft.siteId))}
          onChange={set('businessUnitId')}
        />
        <Select
          id="stock-search-location"
          label="stock-search.filter.location"
          value={draft.locationId}
          options={options(
            lists.locations.filter(
              (location) =>
                (draft.siteId === '' || location.siteId === draft.siteId) &&
                (draft.businessUnitId === '' || location.businessUnitId === draft.businessUnitId),
            ),
          )}
          onChange={set('locationId')}
        />
        <Select
          id="stock-search-condition"
          label="stock-search.filter.condition"
          value={draft.condition}
          options={stockConditionSchema.options.map((condition) => ({
            value: condition,
            text: t(`condition.${condition}`),
          }))}
          onChange={set('condition')}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" variant="primary" label="stock-search.search" />
        <Button
          label="stock-search.clear"
          onClick={() => {
            setDraft(EMPTY);
            onSearch({});
          }}
        />
      </div>
    </form>
  );
}

/** The search's results as an XLSX file, as shown (goods-in 9.1); with cost, the export is recorded (9.4). */
function ExportButton({ filters }: { filters: Filters }) {
  const submission = useSubmission('exportStockSearch', []);
  const pending = submission.state.kind === 'pending';
  return (
    <span className="inline-flex flex-col gap-2">
      <Button
        label="stock-search.export"
        disabled={pending}
        {...(pending ? { reason: 'stock-search.export.pending' as const } : {})}
        onClick={() => {
          void (async () => {
            const file = await submission.submit({ body: filters });
            if (file === undefined) return;
            const bytes = Uint8Array.from(atob(file.contentBase64), (char) => char.charCodeAt(0));
            const url = URL.createObjectURL(
              new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = file.fileName;
            link.click();
            URL.revokeObjectURL(url);
            // A new key for the next export: an export's answer is never kept (code-house-rules 12.4).
            submission.reset();
          })();
        }}
      />
      {submission.state.kind === 'refused' && <SubmissionBanner state={submission.state} />}
    </span>
  );
}

/** Stock › Stock search. Results are read a page at a time; Load more reads the next (code-house-rules 12.1). */
export function StockSearchScreen() {
  const timeZone = useTimeZone();
  const [filters, setFilters] = useState<Filters>({});
  const query = useInfiniteQuery({
    queryKey: ['searchStock', 'pages', filters],
    queryFn: ({ pageParam }) => readPage(filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: StockSearch) => last.next ?? undefined,
  });
  return (
    <div className="flex flex-col gap-4">
      <Toolbar>
        <span className="flex-1" />
        <ExportButton filters={filters} />
        <Button
          label="setup.refresh"
          onClick={() => {
            void query.refetch();
          }}
        />
      </Toolbar>
      <p className="m-0 text-body-sm text-text-2">{t('stock-search.intro')}</p>
      <SearchForm onSearch={setFilters} />
      <ListRead query={query} what="stock-search.what">
        {({ pages }) => {
          const asOf = pages[0]?.asOf;
          const any = pages.some((page) => page.positions.length > 0);
          return (
            <div className="flex flex-col gap-3">
              <div className="flex justify-end">{asOf !== undefined && <AsOf asOf={asOf} timeZone={timeZone} />}</div>
              {pages.some((page) => page.productsCapped) && (
                <Banner tone="warning" role="status" message="stock-search.capped" />
              )}
              {any ? (
                <Results pages={pages} />
              ) : (
                <EmptyState title="stock-search.empty.title" body="stock-search.empty.body" />
              )}
              {query.hasNextPage && (
                <div>
                  <Button
                    label="stock-search.more"
                    disabled={query.isFetchingNextPage}
                    onClick={() => {
                      void query.fetchNextPage();
                    }}
                  />
                </div>
              )}
              <Elsewhere pages={pages} />
            </div>
          );
        }}
      </ListRead>
    </div>
  );
}

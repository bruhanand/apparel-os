import type { MaskablePaise, PtRevisionRead } from '@apparel-os/schemas';
import { fieldName } from '../files/import-text';
import { t, type MessageId } from '../messages/catalogue';
import { formatDecimal, formatList, formatPaise, formatQuantity } from '../setup/format';
import { Th } from '../setup/parts';
import { unknownText } from './names';

// What a PT holds, as the preview of an uploaded file shows it before it is submitted and the PT review shows it to its
// approver (goods-in 5.6 step 3, 6.2, section 11; DEC-140; S2-F04-T02, S2-F06-T01): its totals with BASIC beside P RATE,
// the new products it proposes, each with the SKU code its approval generated once approved (RR-585), the barcodes
// repeated across products, the differences from existing products, and its rows a page at a time. An amount of cost or
// margin the reader may not see is masked (access-and-approvals 6). Every word comes from the message catalogue
// (code-house-rules 12.13).

/** What a PT holds, of a draft's preview or of a revision's review. */
export type PtContentData = Pick<
  PtRevisionRead,
  'totals' | 'newProducts' | 'repeatedBarcodes' | 'differences' | 'rows' | 'next'
>;

/** An amount as the reader is shown it: the rupees, or that it is masked (access-and-approvals 6). */
export function amountText(amount: MaskablePaise): string {
  return amount.kind === 'amount' ? formatPaise(amount.paise) : t('pt.masked');
}

function Fact({ label, value }: { label: MessageId; value: string }) {
  return (
    <>
      <dt className="text-text-2">{t(label)}</dt>
      <dd className="m-0">{value}</dd>
    </>
  );
}

export function PtContent({
  content,
  title,
  onPage,
}: {
  content: PtContentData;
  title: MessageId;
  onPage: (after: number | undefined) => void;
}) {
  const rows = (numbers: readonly number[]) => formatList(numbers.map((row) => formatQuantity(row)));
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-h3 font-semibold">{t(title)}</h3>
      <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-body-sm">
        <Fact label="pt.totals.rows" value={formatQuantity(content.totals.rows)} />
        <Fact label="pt.totals.pieces" value={formatQuantity(content.totals.pieces)} />
        <Fact label="pt.totals.mrp" value={formatPaise(content.totals.mrpPaise)} />
        <Fact label="pt.totals.basic" value={amountText(content.totals.basicPaise)} />
        <Fact label="pt.totals.cost" value={amountText(content.totals.costPaise)} />
      </dl>
      <section aria-label={t('pt.preview.new-products')} className="flex flex-col gap-1">
        <h4 className="text-body font-semibold">{t('pt.preview.new-products')}</h4>
        {content.newProducts.length === 0 ? (
          <p className="m-0 text-body-sm text-text-2">{t('pt.preview.none')}</p>
        ) : (
          <ul className="m-0 list-none p-0 text-body-sm">
            {content.newProducts.map((product) => (
              <li key={`${product.styleCode}|${product.colour}|${product.size}`}>
                {t(product.newStyle ? 'pt.preview.new-style' : 'pt.preview.new-sku', {
                  style: product.styleCode,
                  colour: product.colour,
                  size: product.size,
                  rows: rows(product.rowNumbers),
                })}
                {product.skuCode !== undefined && (
                  <span className="block text-caption text-text-2">
                    {t('pt.review.sku-code', { code: product.skuCode })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label={t('pt.preview.repeated')} className="flex flex-col gap-1">
        <h4 className="text-body font-semibold">{t('pt.preview.repeated')}</h4>
        {content.repeatedBarcodes.length === 0 ? (
          <p className="m-0 text-body-sm text-text-2">{t('pt.preview.none')}</p>
        ) : (
          <ul className="m-0 list-none p-0 text-body-sm">
            {content.repeatedBarcodes.map((each) => (
              <li key={each.barcode}>
                {t('pt.preview.repeated-barcode', { barcode: each.barcode, rows: rows(each.rowNumbers) })}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label={t('pt.preview.differences')} className="flex flex-col gap-1">
        <h4 className="text-body font-semibold">{t('pt.preview.differences')}</h4>
        {content.differences.length === 0 ? (
          <p className="m-0 text-body-sm text-text-2">{t('pt.preview.none')}</p>
        ) : (
          <ul className="m-0 list-none p-0 text-body-sm">
            {content.differences.map((each) => (
              <li key={`${String(each.rowNumber)}|${each.field}`}>
                {t('pt.preview.difference', {
                  row: formatQuantity(each.rowNumber),
                  field: fieldName(each.field),
                  file: each.file,
                  product: each.product ?? unknownText(),
                })}
              </li>
            ))}
          </ul>
        )}
      </section>
      <table className="w-full border-collapse text-body-sm" aria-label={t('pt.preview.rows')}>
        <thead>
          <tr>
            <Th label="pt.report.row" />
            <Th label="pt.row.design" />
            <Th label="pt.row.size" />
            <Th label="pt.row.colour" />
            <Th label="pt.row.barcode" />
            <Th label="pt.row.quantity" />
            <Th label="pt.row.mrp" />
            <Th label="pt.row.basic" />
            <Th label="pt.row.p-rate" />
            <Th label="pt.row.margin" />
            <Th label="pt.row.product" />
          </tr>
        </thead>
        <tbody>
          {content.rows.map((row) => (
            <tr key={row.rowNumber} className="border-t border-border">
              <td className="px-3 py-1">{formatQuantity(row.rowNumber)}</td>
              <td className="px-3 py-1">{row.styleCode}</td>
              <td className="px-3 py-1">{row.size}</td>
              <td className="px-3 py-1">{row.colour}</td>
              <td className="px-3 py-1 font-mono">
                {row.barcode}
                {row.repeated && <span className="block text-caption">{t('pt.row.repeated')}</span>}
              </td>
              <td className="px-3 py-1 text-right">{formatQuantity(row.quantity)}</td>
              <td className="px-3 py-1 text-right">{formatPaise(row.mrpPaise)}</td>
              <td className="px-3 py-1 text-right">{amountText(row.basicPaise)}</td>
              <td className="px-3 py-1 text-right">{amountText(row.pRatePaise)}</td>
              <td className="px-3 py-1 text-right">
                {row.margin.kind === 'margin' ? formatDecimal(row.margin.value) : t('pt.masked')}
              </td>
              <td className="px-3 py-1">{t(`pt.row.product.${row.product}`)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {content.next !== null && (
        <div>
          <button
            type="button"
            className="text-accent underline"
            onClick={() => {
              onPage(content.next ?? undefined);
            }}
          >
            {t('pt.preview.more')}
          </button>
        </div>
      )}
    </div>
  );
}

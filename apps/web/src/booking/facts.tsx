import { bookingTotals } from '@apparel-os/calculations/booking';
import type { Booking, BookingLineDraft, OpenToBuyRemaining } from '@apparel-os/schemas';
import { AgreementTermsList } from '../merchandise/AgreementScreen';
import { t } from '../messages/catalogue';
import { formatDate, formatPaise, formatQuantity } from '../setup/format';
import { Th } from '../setup/parts';

// What the booking screens and the approval panel show of a booking (goods-in 3.1 to 3.4; S2-F01-T03): its reference,
// its totals, the brand's Agreement terms read-only and the remaining open-to-buy of its brand and season.

/** A booking's reference: its number once approved, otherwise a draft's internal reference, from its identifier. */
export function referenceOf(booking: { readonly id: string; readonly number?: string | undefined }): string {
  return booking.number ?? t('booking.reference.draft', { id: booking.id.slice(-8).toUpperCase() });
}

/**
 * Approved, reserved and remaining open-to-buy, or Not approved yet, never zero (PRD-MOD-015). Given a booking not yet
 * approved, its value at cost beside what is left and, when it is more, by how much it is short: an approval refused
 * for open-to-buy names only the brand and season, and the amounts are these reads' (goods-in 3.3, 3.9).
 */
export function OpenToBuyFacts({ remaining, valueAtCost }: { remaining: OpenToBuyRemaining; valueAtCost?: number }) {
  if (remaining.kind === 'not-approved') {
    return <p className="m-0 text-body-sm">{t('booking.open-to-buy.not-approved')}</p>;
  }
  return (
    <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-4 gap-y-2 text-body-sm">
      <dt className="text-text-2">{t('budget.approved')}</dt>
      <dd className="m-0 tabular-nums">{formatPaise(remaining.approved)}</dd>
      <dt className="text-text-2">{t('budget.reserved')}</dt>
      <dd className="m-0 tabular-nums">{formatPaise(remaining.reserved)}</dd>
      <dt className="text-text-2">{t('budget.remaining')}</dt>
      <dd className="m-0 tabular-nums">{formatPaise(remaining.remaining)}</dd>
      {valueAtCost !== undefined && (
        <>
          <dt className="text-text-2">{t('booking.open-to-buy.value')}</dt>
          <dd className="m-0 tabular-nums">{formatPaise(valueAtCost)}</dd>
        </>
      )}
      {valueAtCost !== undefined && valueAtCost > remaining.remaining && (
        <>
          <dt className="text-text-2">{t('booking.open-to-buy.short')}</dt>
          <dd className="m-0 tabular-nums">{formatPaise(valueAtCost - remaining.remaining)}</dd>
        </>
      )}
    </dl>
  );
}

/** A booking's value at cost while it is not approved, which its approval checks the open-to-buy against (DM-8). */
export function valueAtCostOf(booking: Booking): { readonly valueAtCost?: number } {
  return booking.state === 'Approved' ? {} : { valueAtCost: booking.version.totals.cost };
}

/** The brand's Agreement terms, read-only (goods-in 3.2; DEC-129, DEC-132). */
export function TermsFacts({ terms }: { terms: Booking['terms'] }) {
  if (terms.kind === 'none') return <p className="m-0 text-body-sm">{t('booking.terms.none')}</p>;
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-body-sm text-text-2">
        {t(terms.kind === 'fixed' ? 'booking.terms.fixed' : 'booking.terms.in-force', {
          code: terms.code,
          from: formatDate(terms.validFrom),
        })}
      </p>
      <AgreementTermsList terms={terms.terms} />
    </div>
  );
}

/** The totals of the booking and of each style, of the lines given (goods-in 3.1; PRD-BKG-003). */
export function TotalsView({ lines }: { lines: readonly BookingLineDraft[] }) {
  const totals = bookingTotals(lines);
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full border-collapse text-body-sm" aria-label={t('booking.totals')}>
        <thead>
          <tr>
            <Th label="booking.line.style" />
            <Th label="booking.totals.pieces" />
            <Th label="booking.totals.cost" />
            <Th label="booking.totals.mrp" />
          </tr>
        </thead>
        <tbody>
          {totals.styles.map((style) => (
            <tr key={style.styleCode} className="border-t border-border">
              <td className="px-3">{style.styleCode}</td>
              <td className="px-3 tabular-nums">{formatQuantity(style.pieces)}</td>
              <td className="px-3 tabular-nums">{formatPaise(style.cost)}</td>
              <td className="px-3 tabular-nums">{formatPaise(style.mrp)}</td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold">
            <td className="px-3">{t('booking.totals.booking')}</td>
            <td className="px-3 tabular-nums">{formatQuantity(totals.booking.pieces)}</td>
            <td className="px-3 tabular-nums">{formatPaise(totals.booking.cost)}</td>
            <td className="px-3 tabular-nums">{formatPaise(totals.booking.mrp)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

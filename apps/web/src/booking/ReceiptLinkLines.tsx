import type { BookingReceiptLinkProposal, BookingStatus } from '@apparel-os/schemas';
import { t } from '../messages/catalogue';
import { formatDate, formatQuantity } from '../setup/format';
import { Th } from '../setup/parts';
import { given } from './StatusView';

// The lines of a proposal to link late or excess goods into a booking, as the booking's screen and the approval panel
// both show them (goods-in 3.7, 4.10, section 11; POL-05.08; S2-F02-T04): each GRN line by its GRN's number, the goods
// it counted and the pieces it delivers, the day they arrived, why it needs approval, late or excess as when proposed,
// and the booking line it links to, with what is outstanding of it now. A line of an earlier version has no number now,
// so it is named as such.

export function ReceiptLinkLines({
  proposal,
  status,
}: {
  proposal: BookingReceiptLinkProposal;
  status: BookingStatus | undefined;
}) {
  const lineOf = (lineKey: string) => status?.lines.find((line) => line.lineKey === lineKey);
  return (
    <div className="overflow-x-auto rounded-card border border-border">
      <table className="w-full border-collapse text-body-sm" aria-label={t('booking.receipt-link.lines')}>
        <thead>
          <tr>
            <Th label="booking.receipt-link.grn" />
            <Th label="booking.line.style" />
            <Th label="booking.line.colour" />
            <Th label="booking.line.size" />
            <Th label="booking.receipt-link.pieces" />
            <Th label="booking.receipt-link.arrived" />
            <Th label="booking.receipt-link.why" />
            <Th label="booking.receipt-link.line" />
          </tr>
        </thead>
        <tbody>
          {proposal.lines.map((line) => {
            const bookingLine = lineOf(line.lineKey);
            return (
              <tr key={line.grnLineId} className="h-10 border-t border-border">
                <td className="px-3">{line.grnNumber}</td>
                <td className="px-3">{line.styleCode}</td>
                <td className="px-3">{given(line.colour)}</td>
                <td className="px-3">{given(line.size)}</td>
                <td className="px-3 tabular-nums">{formatQuantity(line.quantity)}</td>
                <td className="px-3">{formatDate(line.arrivalDate)}</td>
                <td className="px-3">
                  <span className="flex flex-wrap gap-2">
                    {line.late && (
                      <span className="rounded-full border border-border px-2 text-caption">
                        {t('booking.receipt-link.late')}
                      </span>
                    )}
                    {line.excess && (
                      <span className="rounded-full border border-border px-2 text-caption">
                        {t('booking.receipt-link.excess')}
                      </span>
                    )}
                  </span>
                </td>
                <td className="px-3">
                  {bookingLine === undefined
                    ? t('booking.amendment.line-unknown')
                    : t('booking.receipt-link.line-outstanding', {
                        number: formatQuantity(bookingLine.lineNumber),
                        outstanding: formatQuantity(bookingLine.outstanding),
                      })}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

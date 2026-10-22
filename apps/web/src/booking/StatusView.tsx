import type { BookingStatus } from '@apparel-os/schemas';
import { StatusBadge } from '../components/StatusBadge';
import { t } from '../messages/catalogue';
import { formatDate, formatQuantity } from '../setup/format';
import { Th } from '../setup/parts';

// The booking status of the version in force, as the booking screen and the approval panel show it (goods-in 3.6, 3.8;
// PRD-BKG-005, PRD-BKG-006; S2-F01-T04): each line's ordered, delivered, cancelled, outstanding and over-delivered
// pieces, its due date, and whether it is overdue.

/** Text as the booking writes it, or Not given where it gives none (PRD-MER-005). */
export const given = (text: string | null) => text ?? t('booking.line.not-given');

/** The version in force with each line's quantities (goods-in 3.6; PRD-BKG-005, PRD-BKG-006). */
export function StatusView({ status }: { status: BookingStatus }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="overflow-x-auto rounded-card border border-border">
        <table className="w-full border-collapse text-body-sm" aria-label={t('booking.in-force')}>
          <thead>
            <tr>
              <Th label="booking.line.number" />
              <Th label="booking.line.style" />
              <Th label="booking.line.colour" />
              <Th label="booking.line.size" />
              <Th label="booking.status.ordered" />
              <Th label="booking.status.delivered" />
              <Th label="booking.status.cancelled" />
              <Th label="booking.status.outstanding" />
              <Th label="booking.status.over-delivered" />
              <Th label="booking.status.due" />
            </tr>
          </thead>
          <tbody>
            {status.lines.map((line) => (
              <tr key={line.lineKey} className="border-t border-border">
                <td className="px-3 tabular-nums">{formatQuantity(line.lineNumber)}</td>
                <td className="px-3">{line.styleCode}</td>
                <td className="px-3">{given(line.colour)}</td>
                <td className="px-3">{given(line.size)}</td>
                <td className="px-3 tabular-nums">{formatQuantity(line.ordered)}</td>
                <td className="px-3 tabular-nums">{formatQuantity(line.delivered)}</td>
                <td className="px-3 tabular-nums">{formatQuantity(line.cancelled)}</td>
                <td className="px-3 tabular-nums">{formatQuantity(line.outstanding)}</td>
                <td className="px-3 tabular-nums">{formatQuantity(line.overDelivered)}</td>
                <td className="px-3">
                  <span className="inline-flex flex-wrap items-center gap-2">
                    {formatDate(line.dueDate)}
                    {line.overdue && <StatusBadge state="overdue" />}
                  </span>
                </td>
              </tr>
            ))}
            <tr className="border-t border-border font-semibold">
              <td className="px-3" colSpan={4}>
                {t('booking.totals.booking')}
              </td>
              <td className="px-3 tabular-nums">{formatQuantity(status.totals.ordered)}</td>
              <td className="px-3 tabular-nums">{formatQuantity(status.totals.delivered)}</td>
              <td className="px-3 tabular-nums">{formatQuantity(status.totals.cancelled)}</td>
              <td className="px-3 tabular-nums">{formatQuantity(status.totals.outstanding)}</td>
              <td className="px-3 tabular-nums">{formatQuantity(status.totals.overDelivered)}</td>
              <td className="px-3" />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="m-0 text-caption text-text-2">{t('booking.status.note')}</p>
    </div>
  );
}

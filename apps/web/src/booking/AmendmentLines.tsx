import type { BookingAmendment, BookingStatus } from '@apparel-os/schemas';
import { t } from '../messages/catalogue';
import { formatDate, formatQuantity } from '../setup/format';

// The lines of a cancellation or an extension, as the booking's screen and the approval panel both show them (goods-in
// 3.5, 3.10, section 11; S2-F01-T04): each line by its number in the version in force, with the pieces a cancellation
// cancels or the date an extension gives. A line of an earlier version has no number now, so it is named as such.

export function AmendmentLines({
  amendment,
  status,
}: {
  amendment: BookingAmendment;
  status: BookingStatus | undefined;
}) {
  const numberOf = (lineKey: string) => status?.lines.find((line) => line.lineKey === lineKey)?.lineNumber;
  return (
    <ul className="m-0 list-disc pl-5">
      {amendment.lines.map((line) => {
        const number = numberOf(line.lineKey);
        if (number === undefined) return <li key={line.lineKey}>{t('booking.amendment.line-unknown')}</li>;
        return (
          <li key={line.lineKey}>
            {line.quantity !== undefined &&
              t('booking.amendment.line-quantity', { number, quantity: formatQuantity(line.quantity) })}
            {line.deliveryDate !== undefined &&
              t('booking.amendment.line-date', { number, date: formatDate(line.deliveryDate) })}
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The window's new end an extension gives, which every extension names (goods-in 3.10; migration 0098's constraint);
 * an extension without one is a defect, never shown as a blank (PRD-MOD-015).
 */
export function extensionEnd(amendment: BookingAmendment): string {
  if (amendment.windowTo === undefined) throw new Error(`An extension names no window end: ${amendment.id}`);
  return amendment.windowTo;
}

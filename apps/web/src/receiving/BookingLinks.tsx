import { BOOKING_TYPE, type Arrival, type Booking, type Grn, type GrnLine } from '@apparel-os/schemas';
import { useQueries, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Button } from '../components/Button';
import { describedBy, FormField } from '../forms/FormField';
import { t } from '../messages/catalogue';
import { formatDate, formatQuantity } from '../setup/format';
import { Card, inputClass, SubmissionBanner, Th, useGranted } from '../setup/parts';
import { goodsOf, linkableLines, matchingLines, standingOf, type CountedGoods } from './booking-links';
import { unknownText } from './names';

// Receiving against a booking on the Arrival's screen (goods-in 3.7, 4.1, 4.10, section 11; PRD-REC-002,
// PRD-BKG-007, PRD-BKG-008; POL-05.08; S2-F02-T04): the booking an Arrival names, with its open lines as the expected
// goods; each GRN line's place against bookings, linked, sent for review with why, waiting for approval or received
// without a booking; and Booking's later link of the GRN's lines to the lines of a booking, which links lines within the
// window and the outstanding at once and sends late or excess ones to a different person for approval. A booking the
// person may not read is Unknown, never its identifier (PRD-MOD-015).

/** The reads a later link makes stale. */
const LINK_READS = ['readArrival', 'readReceivingInbox', 'readBooking'] as const;

/** Whether the screen waits while the Arrival is read again (ArrivalView's Reading). */
interface Reading {
  readonly shown: boolean;
  readonly now: () => boolean;
}

/** The bookings an Arrival and its GRN name, read as the person may (goods-in 3.7, 4.10). */
export interface Bookings {
  /** The booking once read; undefined while it is read, or when the person may not read it. */
  get(bookingId: string): Booking | undefined;
  /** Whether it is still being read, so a field stays blank rather than Unknown (PRD-MOD-015). */
  reading(bookingId: string): boolean;
}

export function useBookings(bookingIds: readonly string[]): Bookings {
  const viewable = useGranted(BOOKING_TYPE, 'view');
  const ids = [...new Set(bookingIds)];
  const reads = useQueries({
    queries: ids.map((bookingId) => ({
      ...readQuery(api, 'readBooking', { params: { bookingId } }),
      enabled: viewable,
      retry: false,
    })),
  });
  const at = (bookingId: string) => reads[ids.indexOf(bookingId)];
  return {
    get: (bookingId) => at(bookingId)?.data?.booking,
    reading: (bookingId) => viewable && at(bookingId)?.isPending === true,
  };
}

/** A booking as a field names it: its number, blank while it is read, Unknown when the person may not read it. */
export function bookingField(bookings: Bookings, bookingId: string): string {
  return bookingText(bookings.get(bookingId)) ?? (bookings.reading(bookingId) ? '' : unknownText());
}

/** A booking's number, or Draft while it has none; undefined when the person cannot read it (PRD-MOD-015). */
export function bookingText(booking: Booking | undefined): string | undefined {
  if (booking === undefined) return undefined;
  return booking.number ?? t('booking.reference.draft', { id: booking.id.slice(-8).toUpperCase() });
}

/** The booking's open lines, the goods expected against it (goods-in 4.1; PRD-REC-002). */
export function ExpectedGoods({ booking, reading }: { booking: Booking | undefined; reading: boolean }) {
  if (reading) return null;
  if (booking === undefined) {
    return (
      <Card title="receive.expected">
        <p className="m-0 text-body-sm">{t('receive.expected.unknown')}</p>
      </Card>
    );
  }
  const open = (booking.status?.lines ?? []).filter((line) => line.outstanding > 0);
  return (
    <Card title="receive.expected">
      <p className="m-0 text-body-sm text-text-2">
        {booking.status === undefined
          ? t('receive.expected.not-approved')
          : t('receive.expected.intro', {
              from: formatDate(booking.status.deliveryWindow.from),
              to: formatDate(booking.status.deliveryWindow.to),
            })}
      </p>
      {open.length === 0 ? (
        <p className="m-0 text-body-sm">{t('receive.expected.none')}</p>
      ) : (
        <div className="overflow-x-auto rounded-card border border-border">
          <table className="w-full border-collapse text-body-sm" aria-label={t('receive.expected')}>
            <thead>
              <tr>
                <Th label="booking.line.number" />
                <Th label="booking.line.style" />
                <Th label="booking.line.colour" />
                <Th label="booking.line.size" />
                <Th label="booking.status.ordered" />
                <Th label="booking.status.delivered" />
                <Th label="booking.status.outstanding" />
              </tr>
            </thead>
            <tbody>
              {open.map((line) => (
                <tr key={line.lineKey} className="h-10 border-t border-border">
                  <td className="px-3 tabular-nums">{formatQuantity(line.lineNumber)}</td>
                  <td className="px-3">{line.styleCode}</td>
                  <td className="px-3">{line.colour ?? t('booking.line.not-given')}</td>
                  <td className="px-3">{line.size ?? t('booking.line.not-given')}</td>
                  <td className="px-3 tabular-nums">{formatQuantity(line.ordered)}</td>
                  <td className="px-3 tabular-nums">{formatQuantity(line.delivered)}</td>
                  <td className="px-3 tabular-nums">{formatQuantity(line.outstanding)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/** The number of a booking line by its key, or undefined when the booking is unread or the line not in force. */
function lineNumberOf(booking: Booking | undefined, lineKey: string): number | undefined {
  return booking?.status?.lines.find((line) => line.lineKey === lineKey)?.lineNumber;
}

/** A GRN line's place against bookings, as the GRN's Booking column says it (goods-in 3.7, 4.10). */
export function BookingStanding({
  line,
  grn,
  bookings,
}: {
  line: GrnLine;
  grn: Grn;
  bookings: Bookings;
}) {
  const standing = standingOf(
    line,
    grn.bookingLinks.find((each) => each.grnLineId === line.id),
  );
  const named = (bookingId: string) => bookingField(bookings, bookingId);
  switch (standing.kind) {
    case 'linked': {
      const number = lineNumberOf(bookings.get(standing.bookingId), standing.lineKey);
      const booking = named(standing.bookingId);
      return (
        <span className="text-body-sm">
          {number === undefined
            ? t('receive.booking.linked', { booking })
            : t('receive.booking.linked-line', { booking, line: formatQuantity(number) })}
          {standing.approved && <span className="block text-caption text-text-2">{t('receive.booking.approved')}</span>}
        </span>
      );
    }
    case 'linked-unseen':
      return <span className="text-body-sm">{t('receive.booking.linked', { booking: named(standing.bookingId) })}</span>;
    case 'proposed':
      return (
        <span className="text-body-sm">{t('receive.booking.proposed', { booking: named(standing.bookingId) })}</span>
      );
    case 'review':
      return (
        <span className="text-body-sm">
          {t('receive.booking.review', {
            booking: named(standing.bookingId),
            reason: t(`receive.booking.reason.${standing.reason}`),
          })}
        </span>
      );
    case 'unbooked':
      return <span className="text-body-sm">{t('receive.booking.unbooked')}</span>;
    case 'nothing-received':
      return <span className="text-body-sm">{t('receive.none')}</span>;
  }
}

/** A booking line as an option: its number, its goods and what is outstanding of it. */
function lineOption(line: NonNullable<Booking['status']>['lines'][number]): string {
  return t('receive.link.option', {
    number: formatQuantity(line.lineNumber),
    style: line.styleCode,
    colour: line.colour ?? t('booking.line.not-given'),
    size: line.size ?? t('booking.line.not-given'),
    outstanding: formatQuantity(line.outstanding),
  });
}

/** The goods a GRN line counted, as one text. */
function goodsText(goods: CountedGoods | null): string {
  if (goods === null) return unknownText();
  return t('receive.link.goods', {
    style: goods.styleCode,
    colour: goods.colour ?? t('receive.none'),
    size: goods.size ?? t('receive.none'),
  });
}

/**
 * Booking's later link of the GRN's lines to the lines of one booking (goods-in 3.7, 4.10; PRD-BKG-008; POL-05.08): a
 * booking of the Arrival's supplier and brand that goods may be received against, the one it names first; then, for each
 * line received without a booking or sent for review, the booking line its goods are, or none. Lines within the window
 * and the outstanding link at once; late or excess ones go to a different person for approval, as the answer says.
 * Shown to whoever holds edit on bookings; the server checks it again.
 */
export function LinkToBooking({ arrival, grn, reading }: { arrival: Arrival; grn: Grn; reading: Reading }) {
  const mayLink = useGranted(BOOKING_TYPE, 'edit');
  const viewable = useGranted(BOOKING_TYPE, 'view');
  const lines = linkableLines(grn);
  const [chosen, setChosen] = useState<string>(arrival.bookingId ?? '');
  const [picked, setPicked] = useState<Record<string, string>>({});
  const [answer, setAnswer] = useState<{ linked: number; proposed: number } | null>(null);
  const list = useQuery({
    ...readQuery(api, 'listBookings', {
      query: { receivable: 'true', brandId: arrival.brandId, supplierPartyId: arrival.supplierPartyId },
    }),
    enabled: mayLink && viewable && lines.length > 0,
  });
  const booking = useQuery({
    ...readQuery(api, 'readBooking', { params: { bookingId: chosen } }),
    enabled: mayLink && viewable && chosen !== '',
    retry: false,
  }).data?.booking;
  const submission = useSubmission('linkGrnToBooking', LINK_READS);
  if (!mayLink || lines.length === 0) return null;
  const status = booking?.id === chosen ? booking.status : undefined;
  /** The booking line a GRN line links to: the one picked, else the one it matched at issue, else its only match. */
  const lineKeyOf = (line: GrnLine): string => {
    const set = picked[line.id];
    if (set !== undefined) return set;
    if (status === undefined) return '';
    const atIssue = grn.bookingLinks.find((each) => each.grnLineId === line.id)?.atIssue;
    if (atIssue?.outcome === 'review' && atIssue.bookingId === chosen && atIssue.lineKey !== null) {
      return atIssue.lineKey;
    }
    const goods = goodsOf(line);
    const matches = goods === null ? [] : matchingLines(status.lines, goods);
    return matches.length === 1 ? (matches[0]?.lineKey ?? '') : '';
  };
  const named = lines.flatMap((line) => {
    const lineKey = lineKeyOf(line);
    return lineKey === '' ? [] : [{ grnLineId: line.id, lineKey }];
  });
  const bookings = (list.data?.bookings ?? []).filter((each) => each.id !== arrival.bookingId);
  return (
    <Card title="receive.link">
      <p className="m-0 text-body-sm text-text-2">{t('receive.link.intro')}</p>
      <SubmissionBanner state={submission.state} done="receive.link.sent" />
      {answer !== null && submission.state.kind === 'done' && (
        <p role="status" className="m-0 text-body-sm">
          {t('receive.link.done', { linked: answer.linked, proposed: answer.proposed })}
        </p>
      )}
      <FormField id="link-booking" label="receive.link.booking" required>
        <select
          id="link-booking"
          className={`${inputClass} max-w-md`}
          value={chosen}
          {...describedBy('link-booking', { invalid: false, help: false })}
          onChange={(event) => {
            setChosen(event.target.value);
            setPicked({});
          }}
        >
          <option value="">{t('setup.choose')}</option>
          {arrival.bookingId !== null && (
            <option value={arrival.bookingId}>{bookingText(booking?.id === arrival.bookingId ? booking : undefined) ?? unknownText()}</option>
          )}
          {bookings.map((each) => (
            <option key={each.id} value={each.id}>
              {each.number ?? unknownText()}
            </option>
          ))}
        </select>
      </FormField>
      {status !== undefined && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-body-sm" aria-label={t('receive.link.lines')}>
            <thead>
              <tr>
                <Th label="receive.line-number" />
                <Th label="receive.link.counted" />
                <Th label="receive.received" />
                <Th label="receive.link.booking-line" />
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const goods = goodsOf(line);
                const offered = goods === null ? [] : matchingLines(status.lines, goods);
                const id = `link-line-${line.id}`;
                return (
                  <tr key={line.id} className="h-10 border-t border-border">
                    <td className="px-3 tabular-nums">{formatQuantity(line.lineNumber)}</td>
                    <td className="px-3">{goodsText(goods)}</td>
                    <td className="px-3 tabular-nums">{formatQuantity(line.findings.received)}</td>
                    <td className="px-3">
                      <label htmlFor={id} className="sr-only">
                        {t('receive.link.booking-line.of', { number: formatQuantity(line.lineNumber) })}
                      </label>
                      <select
                        id={id}
                        className={inputClass}
                        value={lineKeyOf(line)}
                        disabled={goods === null}
                        onChange={(event) => {
                          setPicked({ ...picked, [line.id]: event.target.value });
                        }}
                      >
                        <option value="">{t('receive.link.none')}</option>
                        {offered.map((each) => (
                          <option key={each.lineKey} value={each.lineKey}>
                            {lineOption(each)}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <Button
          variant="primary"
          label="receive.link.send"
          disabled={named.length === 0 || submission.state.kind === 'pending' || reading.shown}
          {...(reading.shown ? { reason: 'receive.reading-again' } : {})}
          onClick={() => {
            if (reading.now()) return;
            void (async () => {
              const done = await submission.submit({
                params: { grnId: grn.id },
                body: { bookingId: chosen, lines: named },
              });
              if (done !== undefined) {
                setAnswer({ linked: done.linked.length, proposed: done.proposal?.grnLineIds.length ?? 0 });
                setPicked({});
              }
            })();
          }}
        />
      </div>
    </Card>
  );
}

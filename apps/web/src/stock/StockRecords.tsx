import type { StockRecordGrn, StockRecords as Records, StockRecordsQuery } from '@apparel-os/schemas';
import { useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../api';
import { ApiFailure } from '../api/query';
import { Button } from '../components/Button';
import { numberCell } from '../components/cells';
import { AsOf } from '../history/AsOf';
import { t } from '../messages/catalogue';
import { unknownText } from '../receiving/names';
import { formatDate, formatList, formatQuantity } from '../setup/format';
import { ListRead, Th } from '../setup/parts';
import { useTimeZone } from '../shell/session';

// The records behind a figure of stock search or the stock report (goods-in 9.1 "Every figure drills down to its
// records: the booking, the GRN, the PT, the movements", 9.2, 9.5; PRD-EXC-011; code reviews 8 and 9 of stage 2): the
// GRNs its pieces were counted on, each opening its Arrival, where its PT file, scan-in and recounts are; the PTs that
// cover them; and their movements at the location, newest first, Load more reading on. As the reader may see them:
// what they may not see is not named. Every word from the message catalogue (code-house-rules 12.13).

type Of = Pick<StockRecordsQuery, 'of' | 'key'>;

async function readPage(of: Of, after: string | undefined): Promise<Records> {
  const result = await api.call('readStockRecords', { query: { ...of, ...(after === undefined ? {} : { after }) } });
  if (result.ok) return result.data;
  throw new ApiFailure(result.status, result.error);
}

const cell = 'border-t border-border px-3 py-2 align-top';

/** A GRN by its number, which opens its Arrival (goods-in 9.1). */
function GrnButton({ grn, onOpen }: { grn: StockRecordGrn; onOpen: (grn: StockRecordGrn) => void }) {
  return (
    <button
      type="button"
      className="text-accent underline"
      onClick={() => {
        onOpen(grn);
      }}
    >
      {grn.number}
    </button>
  );
}

export function StockRecords({
  of,
  onGrn,
}: {
  of: Of;
  /** Opens the Arrival a GRN was issued from, with the names of the places of the figure's GRNs. */
  onGrn: (grn: StockRecordGrn, places: Records['places']) => void;
}) {
  const timeZone = useTimeZone();
  const query = useInfiniteQuery({
    queryKey: ['readStockRecords', 'pages', of],
    queryFn: ({ pageParam }) => readPage(of, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last: Records) => last.next ?? undefined,
  });
  return (
    <section aria-label={t('stock-records.title')} className="flex flex-col gap-3">
      <ListRead query={query} what="stock-records.what">
        {({ pages }) => {
          const [first] = pages;
          if (first === undefined) return null;
          const grnOf = (grnId: string | null) =>
            grnId === null ? undefined : first.grns.find((each) => each.grnId === grnId);
          const open = (grn: StockRecordGrn) => {
            onGrn(grn, first.places);
          };
          const movements = pages.flatMap((page) => page.movements);
          return (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <h4 className="text-body font-semibold">{t('stock-records.title')}</h4>
                <span className="flex-1" />
                <AsOf asOf={first.asOf} timeZone={timeZone} />
              </div>
              <p className="m-0 text-body-sm">
                {first.grns.length === 0 ? (
                  t('stock-records.grns.none')
                ) : (
                  <span className="flex flex-wrap gap-2">
                    {t('stock-records.grns')}
                    {first.grns.map((grn) => (
                      <GrnButton key={grn.grnId} grn={grn} onOpen={open} />
                    ))}
                  </span>
                )}
              </p>
              <p className="m-0 text-body-sm">
                {first.pts.length === 0
                  ? t('stock-records.pts.none')
                  : t('stock-records.pts', {
                      grns: formatList(first.pts.map((pt) => grnOf(pt.grnId)?.number ?? unknownText())),
                    })}
              </p>
              {movements.length === 0 ? (
                <p className="m-0 text-body-sm text-text-2">{t('stock-records.movements.none')}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-body-sm" aria-label={t('stock-records.movements')}>
                    <thead>
                      <tr>
                        <Th label="stock-records.column.date" />
                        <Th label="stock-records.column.movement" />
                        <Th label="stock-records.column.quantity" />
                        <Th label="stock-records.column.condition" />
                        <Th label="stock-records.column.record" />
                      </tr>
                    </thead>
                    <tbody>
                      {movements.map((movement) => {
                        const grn = grnOf(movement.grnId);
                        return (
                          <tr key={movement.id}>
                            <td className={cell}>{formatDate(movement.businessDate)}</td>
                            <td className={cell}>
                              {t('stock-records.movement', {
                                kind: t(`stock-movement.${movement.kind}`),
                                direction: t(`stock-records.direction.${movement.direction}`),
                              })}
                            </td>
                            <td className={`${cell} ${numberCell}`}>{formatQuantity(movement.quantity)}</td>
                            <td className={cell}>{t(`condition.${movement.condition}`)}</td>
                            <td className={cell}>
                              <span className="flex flex-wrap gap-2">
                                {t(`stock-records.source.${movement.source}`)}
                                {grn !== undefined && <GrnButton grn={grn} onOpen={open} />}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
              {query.hasNextPage && (
                <div>
                  <Button
                    label="stock-records.more"
                    disabled={query.isFetchingNextPage}
                    onClick={() => {
                      void query.fetchNextPage();
                    }}
                  />
                </div>
              )}
            </div>
          );
        }}
      </ListRead>
    </section>
  );
}

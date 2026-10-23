import {
  DAMAGE_REPORT_TYPE,
  RECEIVING_CAPS,
  SCAN_TYPE,
  type ScanAnswered,
  type ScanInProduct,
  type ScanInRead,
} from '@apparel-os/schemas';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { api } from '../api';
import { useSubmission } from '../api/command';
import { readQuery } from '../api/query';
import { Banner } from '../components/Banner';
import { Button } from '../components/Button';
import { UnavailableState } from '../components/UnavailableState';
import { AsOf } from '../history/AsOf';
import { formatDateTime } from '../history/format';
import { t } from '../messages/catalogue';
import { formatQuantity } from '../setup/format';
import { Card, GrantedButton, inputClass, ListRead, SubmissionBanner, Toolbar, useGranted } from '../setup/parts';
import { useTimeZone } from '../shell/session';
import { ReportDamage } from '../stock/DamageReport';
import { unknownText } from './names';

// Receive Goods › a GRN › Scan-in (goods-in 7, 7.5, section 11; PRD-REC-021, PRD-REC-022, PRD-STK-003, PRD-MER-007,
// PRD-PRO-009; DEC-135; S2-F07-T01), on a phone or a counter PC with a keyboard-input scanner: choose where the pieces
// go, the floor or the backstore at a Store, a bin at a warehouse, and change it between scans; scan or type each
// piece's barcode, one piece a scan, the scanner's Enter sending it; a barcode on more than one of the PT's products
// asks which, never chosen for the person; a refused scan is shown and kept; the progress of each product; damage found
// while scanning reported where the piece waits; stop with pieces left and resume later. One column at phone width.
// Every word comes from the message catalogue (code-house-rules 12.13); times read in the Organisation's timezone
// (design-language 8); a product or person the reader cannot name is Unknown (PRD-MOD-015).

/** The reads a scan makes stale. */
const SCAN_READS = ['readScanIn', 'readReceivingInbox', 'readArrival'] as const;

/** A product as the scan-in names it: its SKU code, style code and size, Unknown while unread (PRD-MOD-015). */
function productText(product: ScanInProduct | undefined): string {
  if (product === undefined || product.name.kind === 'unknown') return unknownText();
  const { name } = product;
  return t('scan.product', {
    code: name.code,
    style: name.styleCode,
    size: name.size.kind === 'known' ? name.size.value : unknownText(),
  });
}

/** The answer of a scan, as a status beside the field: accepted, or refused with why (goods-in 7.2). */
function ScanResult({ answer, barcode, read }: { answer: ScanAnswered; barcode: string; read: ScanInRead }) {
  const product = productText(read.products.find((each) => each.skuId === answer.skuId));
  if (answer.outcome === 'accepted') {
    return (
      <Banner tone="success" role="status" message="scan.accepted">
        <span>{t('scan.accepted.of', { product, barcode })}</span>
      </Banner>
    );
  }
  const nothingLeft = answer.reason === 'nothing-left';
  return (
    <Banner tone="danger" role="alert" message={nothingLeft ? 'scan.nothing-left' : 'scan.not-covered'}>
      <span>
        {nothingLeft ? t('scan.nothing-left.of', { product, barcode }) : t('scan.not-covered.of', { barcode })}
      </span>
    </Banner>
  );
}

/** The scan field, where the pieces go and the choice of a repeated barcode's product (goods-in 7.2). */
function ScanForm({ read }: { read: ScanInRead }) {
  const mayScan = useGranted(SCAN_TYPE, 'create');
  const [destination, setDestination] = useState('');
  const [barcode, setBarcode] = useState('');
  // The barcode last sent, and what its scan answered once it did.
  const [sent, setSent] = useState<string | null>(null);
  const [answer, setAnswer] = useState<ScanAnswered | null>(null);
  const field = useRef<HTMLInputElement>(null);
  const submission = useSubmission('scanPiece', SCAN_READS);
  const only = read.destinations.length === 1 ? read.destinations[0]?.id : undefined;
  const destinationId = destination === '' ? (only ?? '') : destination;
  const pending = submission.state.kind === 'pending';
  const send = async (code: string, skuId?: string) => {
    setSent(code);
    setAnswer(null);
    const answered = await submission.submit({
      params: { grnId: read.grnId },
      body: { barcode: code, destinationLocationId: destinationId, ...(skuId === undefined ? {} : { skuId }) },
    });
    if (answered !== undefined) {
      setAnswer(answered);
      setBarcode('');
    }
    field.current?.focus();
  };
  const refusal = submission.state.kind === 'refused' ? submission.state.refusal : null;
  // A barcode on more than one of the PT's products: each product it names, for the person to choose from.
  const choices = refusal?.code === 'receiving.barcode-repeated' && sent !== null ? (refusal.missing ?? []) : [];
  if (!mayScan) return <p className="m-0 text-body-sm text-text-2">{t('setup.needs-permission')}</p>;
  if (read.destinations.length === 0) return <Banner tone="warning" role="status" message="scan.no-destination" />;
  return (
    <form
      aria-label={t('scan.form')}
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault();
        const code = barcode.trim();
        if (code !== '' && destinationId !== '' && !pending) void send(code);
      }}
    >
      <label htmlFor="scan-destination" className="flex flex-col gap-1 text-body-sm font-semibold">
        {t('scan.destination')}
        <select
          id="scan-destination"
          className={`${inputClass} h-12 w-full font-normal`}
          value={destinationId}
          onChange={(event) => {
            setDestination(event.target.value);
          }}
        >
          {only === undefined && <option value="">{t('scan.destination.choose')}</option>}
          {read.destinations.map((each) => (
            <option key={each.id} value={each.id}>
              {t('scan.destination.option', {
                kind: t(`location-kind.${each.kind}`),
                place: t('receive.option', { code: each.code, name: each.name }),
              })}
            </option>
          ))}
        </select>
      </label>
      <label htmlFor="scan-barcode" className="flex flex-col gap-1 text-body-sm font-semibold">
        {t('scan.barcode')}
        <input
          id="scan-barcode"
          ref={field}
          // A keyboard-input scanner types the code and presses Enter; a code typed from the tag is sent the same way.
          autoFocus
          autoComplete="off"
          inputMode="numeric"
          maxLength={RECEIVING_CAPS.codeText}
          className={`${inputClass} h-12 w-full text-h3 font-normal`}
          value={barcode}
          onChange={(event) => {
            setBarcode(event.target.value);
          }}
        />
      </label>
      <Button
        type="submit"
        variant="primary"
        size="touch"
        label="scan.send"
        disabled={pending || destinationId === '' || barcode.trim() === ''}
        {...(destinationId === '' ? { reason: 'scan.destination.choose' as const } : {})}
      />
      {choices.length > 0 && sent !== null ? (
        <fieldset className="flex flex-col gap-2 rounded-card border border-border bg-raised p-3">
          <legend className="text-body-sm font-semibold">{t('scan.choose', { barcode: sent })}</legend>
          {choices.map((item) => (
            <Button
              key={item.recordId}
              size="touch"
              label="scan.choose.this"
              labelParams={{ product: productText(read.products.find((each) => each.skuId === item.recordId)) }}
              disabled={pending}
              onClick={() => {
                if (item.recordId !== undefined) void send(sent, item.recordId);
              }}
            />
          ))}
        </fieldset>
      ) : (
        refusal !== null && <SubmissionBanner state={submission.state} />
      )}
      {answer !== null && sent !== null && <ScanResult answer={answer} barcode={sent} read={read} />}
    </form>
  );
}

/** Each product of the PT with its pieces: accepted of covered, waiting, and held (goods-in 7.3). */
function Progress({ read }: { read: ScanInRead }) {
  const left = read.products.reduce((sum, each) => sum + each.waiting, 0);
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-body font-semibold" role="status">
        {read.state === 'complete' ? t('scan.complete') : t('scan.left', { count: left })}
      </p>
      <ul aria-label={t('scan.products')} className="m-0 flex list-none flex-col gap-2 p-0">
        {read.products.map((product) => (
          <li key={product.skuId} className="flex flex-col gap-1 border-t border-border pt-2 text-body-sm">
            <span className="font-semibold">{productText(product)}</span>
            <span className="tabular-nums">
              {t('scan.product.counts', {
                accepted: formatQuantity(product.accepted),
                covered: formatQuantity(product.covered),
                waiting: formatQuantity(product.waiting),
                damaged: formatQuantity(product.damaged),
                held: formatQuantity(product.held),
              })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Damage found while scanning, reported on a product where its pieces wait (goods-in 7.2, 8.1). */
function DamageWhileScanning({ read }: { read: ScanInRead }) {
  const mayReport = useGranted(DAMAGE_REPORT_TYPE, 'create');
  const [skuId, setSkuId] = useState('');
  const waiting = read.products.filter((each) => each.waiting > 0);
  if (!mayReport || waiting.length === 0) return null;
  return (
    <Card title="scan.damage">
      <label htmlFor="scan-damage-product" className="flex flex-col gap-1 text-body-sm font-semibold">
        {t('scan.damage.product')}
        <select
          id="scan-damage-product"
          className={`${inputClass} h-12 w-full font-normal`}
          value={skuId}
          onChange={(event) => {
            setSkuId(event.target.value);
          }}
        >
          <option value="">{t('scan.damage.choose')}</option>
          {waiting.map((each) => (
            <option key={each.skuId} value={each.skuId}>
              {productText(each)}
            </option>
          ))}
        </select>
      </label>
      {skuId !== '' && (
        <ReportDamage key={skuId} goods={{ kind: 'product', skuId }} locationId={read.receivingLocationId} />
      )}
    </Card>
  );
}

/** The scans, newest first, the latest page (goods-in 7.5). */
function Scans({ read }: { read: ScanInRead }) {
  const timeZone = useTimeZone();
  if (read.scans.length === 0) return <p className="m-0 text-body-sm text-text-2">{t('scan.none-yet')}</p>;
  const person = (userId: string) => read.people.find((each) => each.userId === userId)?.name ?? unknownText();
  const place = (id: string) => {
    const found = read.destinations.find((each) => each.id === id);
    return found === undefined ? unknownText() : t('receive.option', { code: found.code, name: found.name });
  };
  return (
    <ul aria-label={t('scan.scans')} className="m-0 flex list-none flex-col gap-2 p-0">
      {read.scans.map((scan) => (
        <li key={scan.id} className="flex flex-col gap-1 border-t border-border pt-2 text-body-sm">
          <span className="font-semibold">
            {scan.outcome === 'accepted'
              ? t('scan.line.accepted', {
                  product: productText(read.products.find((each) => each.skuId === scan.skuId)),
                  place: place(scan.destinationLocationId),
                })
              : t(scan.reason === 'nothing-left' ? 'scan.line.nothing-left' : 'scan.line.not-covered', {
                  barcode: scan.barcode,
                })}
          </span>
          <span className="text-caption text-text-2">
            {t('scan.line.by', { name: person(scan.scannedBy), at: formatDateTime(scan.scannedAt, timeZone) })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The scan-in of a GRN, on its own screen: back to its Arrival stops scanning, pieces left staying unaccepted at the
 * receiving location, and the scan-in is resumed later from the same place (goods-in 7.3).
 */
export function ScanIn({ grnId, onBack }: { grnId: string; onBack: () => void }) {
  const timeZone = useTimeZone();
  const queryClient = useQueryClient();
  const read = readQuery(api, 'readScanIn', { params: { grnId }, query: {} });
  const query = useQuery(read);
  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4">
      <Toolbar>
        <Button label="scan.stop" onClick={onBack} />
        <span className="flex-1" />
        <Button
          label="setup.refresh"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ['readScanIn'] });
          }}
        />
      </Toolbar>
      <ListRead query={query} what="scan.what">
        {(scanIn) => (
          <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-h2 font-semibold">{t('scan.title', { number: scanIn.grnNumber })}</h2>
              <span className="flex-1" />
              <AsOf asOf={scanIn.asOf} timeZone={timeZone} />
            </div>
            {scanIn.state === 'waiting-for-pt' ? (
              <Banner tone="info" role="status" message="scan.waiting-for-pt" />
            ) : scanIn.blocking.length > 0 ? (
              <UnavailableState missing={scanIn.blocking} />
            ) : (
              <>
                {scanIn.state === 'scanning' && (
                  <Card title="scan.scan">
                    <ScanForm read={scanIn} />
                  </Card>
                )}
                <Card title="scan.progress">
                  <Progress read={scanIn} />
                  {scanIn.state === 'scanning' && (
                    <p className="m-0 text-caption text-text-2">{t('scan.stop.intro')}</p>
                  )}
                </Card>
                <DamageWhileScanning read={scanIn} />
              </>
            )}
            <Card title="scan.scans">
              <Scans read={scanIn} />
            </Card>
          </div>
        )}
      </ListRead>
    </div>
  );
}

/**
 * The scan-in on the GRN in its Arrival (goods-in 7.1, section 11): where it stands, the pieces left, and the way to the
 * scan-in's own screen for whoever may scan.
 */
export function ScanInSummary({ grnId, onOpen }: { grnId: string; onOpen: (grnId: string) => void }) {
  const query = useQuery(readQuery(api, 'readScanIn', { params: { grnId }, query: {} }));
  return (
    <section
      aria-label={t('receive.scan-in')}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      <h3 className="text-h3 font-semibold">{t('receive.scan-in')}</h3>
      <p className="m-0 text-body-sm text-text-2">{t('receive.scan-in.intro')}</p>
      <ListRead query={query} what="scan.what">
        {(scanIn) =>
          scanIn.state === 'waiting-for-pt' ? (
            <p className="m-0 text-body-sm">{t('scan.waiting-for-pt')}</p>
          ) : (
            <div className="flex flex-col gap-3">
              <Progress read={scanIn} />
              {scanIn.state === 'scanning' && (
                <div>
                  <GrantedButton
                    label="receive.scan-in.open"
                    recordType={SCAN_TYPE}
                    action="create"
                    variant="primary"
                    onClick={() => {
                      onOpen(grnId);
                    }}
                  />
                </div>
              )}
            </div>
          )
        }
      </ListRead>
    </section>
  );
}

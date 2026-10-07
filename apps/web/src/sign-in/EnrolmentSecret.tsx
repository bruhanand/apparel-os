import type { Secret } from '@apparel-os/schemas';
import { QRCodeSVG } from 'qrcode.react';
import { Banner } from '../components/Banner';
import { t } from '../messages/catalogue';

/** A setup key in groups of four, as authenticator apps print it, so it is easy to type. */
export function groupedKey(key: string): string {
  return (key.match(/.{1,4}/g) ?? []).join(' ');
}

/**
 * The authenticator secret, shown once at enrolment and never again (access-and-approvals 3.2; code-house-rules
 * 12.6). It stays a `Secret` until this one place reveals it on the screen; nothing keeps it after the step.
 * The setup link is drawn beside the key as a QR code to scan, by the QR code library of the PRD Stack's
 * Authentication row (qrcode.react), inside the page as inline SVG: nothing is fetched from another origin, and the
 * drawing is not stored, cached or logged (DEC-118; RR-280; PRD-SEC-001, PRD-SEC-014; design-language 10.20). The key
 * in groups of four stays as the manual fallback, and the link opens the app on the phone that shows this page.
 */
export function EnrolmentSecret({ secret, otpauthUri }: { secret: Secret; otpauthUri: Secret }) {
  const link = otpauthUri.reveal();
  return (
    <div className="flex flex-col gap-3">
      <Banner tone="warning" message="enrolment.key-once" />
      <div className="flex flex-wrap items-start gap-4">
        {/* A QR code needs dark modules on a light ground in either theme, so its colours are the library's own. */}
        <div className="rounded-control border border-border bg-white p-2">
          <QRCodeSVG
            value={link}
            size={168}
            level="M"
            marginSize={4}
            role="img"
            aria-label={t('enrolment.qr-alt')}
            data-testid="enrolment-qr"
          />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-body-sm font-semibold">{t('enrolment.key')}</span>
          <code
            data-testid="enrolment-key"
            className="rounded-control bg-sunken px-3 py-2 font-mono text-h3 tracking-wider break-all select-all"
          >
            {groupedKey(secret.reveal())}
          </code>
        </div>
      </div>
      <a href={link} className="text-body text-accent underline">
        {t('enrolment.link')}
      </a>
    </div>
  );
}

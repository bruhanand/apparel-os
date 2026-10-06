import type { Secret } from '@apparel-os/schemas';
import { Banner } from '../components/Banner';
import { t } from '../messages/catalogue';

/** A setup key in groups of four, as authenticator apps print it, so it is easy to type. */
export function groupedKey(key: string): string {
  return (key.match(/.{1,4}/g) ?? []).join(' ');
}

/**
 * The authenticator secret, shown once at enrolment and never again (access-and-approvals 3.2; code-house-rules
 * 12.6). It stays a `Secret` until this one place reveals it on the screen; nothing keeps it after the step.
 * The setup link opens the authenticator app on the phone that shows this page. A QR code to scan is not drawn yet:
 * no QR library is in the PRD Stack (RR-280).
 */
export function EnrolmentSecret({ secret, otpauthUri }: { secret: Secret; otpauthUri: Secret }) {
  return (
    <div className="flex flex-col gap-3">
      <Banner tone="warning" message="enrolment.key-once" />
      <div className="flex flex-col gap-1">
        <span className="text-body-sm font-semibold">{t('enrolment.key')}</span>
        <code
          data-testid="enrolment-key"
          className="rounded-control bg-sunken px-3 py-2 font-mono text-h3 tracking-wider select-all"
        >
          {groupedKey(secret.reveal())}
        </code>
      </div>
      <a href={otpauthUri.reveal()} className="text-body text-accent underline">
        {t('enrolment.link')}
      </a>
    </div>
  );
}

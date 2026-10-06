import type { MissingItem } from '@apparel-os/schemas';
import { isMessageId, t } from '../messages/catalogue';
import { Banner } from './Banner';

/** The text of one missing item, by its kind (code-house-rules 12.3 "What is missing"). */
export function missingText(item: MissingItem): string {
  const id = `missing.${item.kind}`;
  return t(isMessageId(id) ? id : 'missing.other');
}

/**
 * Live action unavailable (design-language 10.17; PRD-UXP-003, PRD-SEC-017): an Attention banner that names each thing
 * the server listed as missing and points to Setup › Policy readiness. The action itself stays visible and disabled.
 */
export function UnavailableState({ missing }: { missing: readonly MissingItem[] }) {
  return (
    <Banner tone="warning" message="unavailable.title" role="status">
      <span>{t('missing.count', { count: missing.length })}</span>
      <ul className="list-none p-0">
        {missing.map((item, index) => (
          <li key={index}>{missingText(item)}</li>
        ))}
      </ul>
      <span className="text-accent underline">{t('unavailable.policy-readiness')}</span>
    </Banner>
  );
}

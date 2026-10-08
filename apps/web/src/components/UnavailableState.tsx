import type { MissingItem } from '@apparel-os/schemas';
import { isMessageId, t } from '../messages/catalogue';
import { Banner } from './Banner';

/**
 * The text of one missing item, by its kind (code-house-rules 12.3 "What is missing"). A missing permission names its
 * action and record type, so the person knows what to ask for (PRD-UXP-003).
 */
export function missingText(item: MissingItem): string {
  const action = `action.${item.action ?? ''}`;
  if ((item.kind === 'action' || item.kind === 'permission') && item.recordType !== undefined && isMessageId(action)) {
    const recordType = `record-type.${item.recordType}`;
    return t('missing.permission.named', {
      action: t(action),
      recordType: isMessageId(recordType) ? t(recordType) : item.recordType,
    });
  }
  // The rule a refused password failed, with the setting's value, never the password (S1-F01-T31).
  if (item.kind === 'password-rule' && item.rule === 'minimum-length') {
    const least = Number(item.minimumLength);
    if (Number.isInteger(least) && least >= 0) return t('missing.password-rule.minimum-length', { count: least });
  }
  // A scope that stops short names the place or legal entity, by its code where the server gives it (PRD-UXP-003).
  const fact = `scope.fact.${item.factType ?? ''}`;
  if (item.kind === 'scope' && isMessageId(fact) && (item.factCode ?? item.factId) !== undefined) {
    return t('missing.scope.named', { type: t(fact), code: item.factCode ?? item.factId ?? '' });
  }
  const id = `missing.${item.kind}`;
  return t(isMessageId(id) ? id : 'missing.other');
}

/** The kinds of missing item a policy or setting gate names (design-language 10.17). */
const gateKinds: ReadonlySet<string> = new Set(['policy', 'setting', 'capability']);

/**
 * Unavailable (PRD-UXP-003, PRD-SEC-017). Where a policy, setting or capability is missing, it is Live action
 * unavailable (design-language 10.17): an Attention banner that names each thing the server listed as missing and
 * points to Setup › Policy readiness. Where only the person's role assignments fall short, it is Not available to you
 * (design-language 10.17 "Missing permission", as built): the same banner naming the missing permission or scope and
 * saying who to ask, with no policy link, since no policy is involved. The action itself stays visible and disabled.
 */
export function UnavailableState({ missing }: { missing: readonly MissingItem[] }) {
  if (!missing.some((item) => gateKinds.has(item.kind))) {
    return (
      <Banner tone="warning" message="unavailable.access.title" role="status">
        <ul className="list-none p-0">
          {missing.map((item, index) => (
            <li key={index}>{missingText(item)}</li>
          ))}
        </ul>
        <span>{t('unavailable.access.next')}</span>
      </Banner>
    );
  }
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

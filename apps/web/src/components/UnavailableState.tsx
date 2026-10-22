import type { MissingItem } from '@apparel-os/schemas';
import { isMessageId, t } from '../messages/catalogue';
import { formatPaise } from '../setup/format';
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
  // A Locked period a posting was refused for, by its code (books-and-posting 14; PRD-UXP-003; S1-F09-T03).
  if (item.kind === 'financial-period' && item.code !== undefined) {
    return t('missing.financial-period.named', { code: item.code });
  }
  // A unit a billing device cannot bill for, by its code (offline-counter 3.1; PRD-UXP-003; S1-F12-T01).
  if (item.kind === 'business-unit' && item.code !== undefined) {
    return t('missing.business-unit.named', { code: item.code });
  }
  // A setting not set, by its name where the catalogue has one (code-house-rules 12.14; PRD-UXP-003).
  const setting = `setting.name.${item.setting ?? ''}`;
  if (item.kind === 'setting' && isMessageId(setting)) return t('missing.setting.named', { setting: t(setting) });
  const gate = gateText(item) ?? readinessText(item) ?? importText(item) ?? bookingText(item);
  if (gate !== undefined) return gate;
  const id = `missing.${item.kind}`;
  return t(isMessageId(id) ? id : 'missing.other');
}

/**
 * The text of a booking approval's item (goods-in 3.3; S2-F01-T03): the open-to-buy short of the booking's value at
 * cost, with the shortfall, the value and what remains, in rupees. Undefined for any other item.
 */
function bookingText(item: MissingItem): string | undefined {
  if (item.kind !== 'open-to-buy-shortfall') return undefined;
  const amounts = [item.shortfall, item.value, item.remaining].map(Number);
  if (!amounts.every((amount) => Number.isSafeInteger(amount))) return undefined;
  const [shortfall = 0, value = 0, remaining = 0] = amounts;
  return t('missing.open-to-buy-shortfall.named', {
    shortfall: formatPaise(shortfall),
    value: formatPaise(value),
    remaining: formatPaise(remaining),
  });
}

/** A policy's number and name, as Policy readiness shows it: "Policy 14 · Opening and cutover". */
export function policyTitle(policy: string): string {
  const name = `policy.name.${policy}`;
  return t('policy.title', { number: policy, name: isMessageId(name) ? t(name) : '' });
}

/** A name from the catalogue under a prefix, or the code itself where it has none, as for a synthetic one. */
function named(prefix: string, code: string): string {
  const id = `${prefix}.${code}`;
  return isMessageId(id) ? t(id) : code;
}

/**
 * The text of a policy gate's item (module-map 4.4; design-language 10.17; S1-F04-T01): the policy by number and name
 * and what it lacks, its signature or its validated values; the capability that is off; the activity not granted at
 * its place; a value whose origin this environment does not accept. Undefined for any other item.
 */
function gateText(item: MissingItem): string | undefined {
  if (
    item.kind === 'policy' &&
    item.policy !== undefined &&
    (item.lacks === 'signature' || item.lacks === 'validation' || item.lacks === 'values')
  ) {
    return t(`missing.policy.${item.lacks}`, { policy: policyTitle(item.policy) });
  }
  if (item.kind === 'validator' && item.policy !== undefined) {
    return t('missing.validator', { policy: policyTitle(item.policy) });
  }
  if (item.kind === 'capability' && item.capability !== undefined) {
    return t('missing.capability.named', { capability: named('capability', item.capability) });
  }
  if (item.kind === 'activity' && item.activity !== undefined) {
    const activity = named('activity', item.activity);
    if (item.placeType === undefined || item.placeId === undefined) return t('missing.activity.nowhere', { activity });
    return t('missing.activity.named', { activity, place: named('place-type', item.placeType), id: item.placeId });
  }
  if (item.kind === 'origin' && item.origin !== undefined) {
    return t('missing.origin.named', { origin: named('origin', item.origin) });
  }
  return undefined;
}

/**
 * The text of a readiness check's item (module-map 4.16; S1-F04-T02): the check that fails, a mapping not verified,
 * the permission nobody at the unit holds, the action fewer than two people can prepare and approve, the Site not made
 * ready for the activity. Undefined for any other item, whose text is its kind's.
 */
function readinessText(item: MissingItem): string | undefined {
  if (item.kind === 'site-readiness' && item.activity !== undefined) {
    return t('missing.site-readiness.named', { activity: named('activity', item.activity) });
  }
  if (item.kind === 'readiness-check' && item.check !== undefined) {
    return t('missing.readiness-check.named', { check: named('readiness.check', item.check) });
  }
  if (item.kind === 'mapping' && item.lacks === 'verification') return t('missing.mapping.verification');
  const action = `action.${item.action ?? ''}`;
  if (item.kind === 'permission-holder' && item.recordType !== undefined && isMessageId(action)) {
    return t('missing.permission-holder.named', {
      action: t(action),
      recordType: named('record-type', item.recordType),
    });
  }
  // A billing device with no Open series, by its code and why (offline-counter section 11; S1-F12-T02).
  const lacks = `missing.device-series.${item.lacks ?? ''}`;
  if (item.kind === 'device-series' && item.code !== undefined && isMessageId(lacks)) {
    return t(lacks, { code: item.code });
  }
  if (item.kind === 'approval-people' && item.actionType !== undefined) {
    return t('missing.approval-people.named', { actionType: named('approval.action', item.actionType) });
  }
  return undefined;
}

/**
 * The text of an import's item (imports-and-opening-data 13.1; S1-F06-T01): the number series of a kind named by its
 * kind, a publishing control still missing, the layout's sheet or column a file lacks. Undefined for any other item.
 */
function importText(item: MissingItem): string | undefined {
  const series = `missing.number-series.${item.numberedKind ?? ''}`;
  if (item.kind === 'number-series' && isMessageId(series)) return t(series);
  if (item.kind === 'layout-sheet' && item.sheet !== undefined)
    return t('missing.layout-sheet.named', { sheet: item.sheet });
  if (item.kind === 'layout-column' && item.column !== undefined) {
    return t('missing.layout-column.named', { column: item.column });
  }
  // An earlier batch of the same file, by its code and state (imports-and-opening-data 7.2; S1-F06-T04).
  if (item.kind === 'import-batch' && item.code !== undefined && item.state !== undefined) {
    return t('missing.import-batch.named', { code: item.code, state: item.state });
  }
  return intakeText(item);
}

/** What an intake refusal names (imports-and-opening-data 9.3, 11; PRD-UXP-003; S1-F06-T02). */
function intakeText(item: MissingItem): string | undefined {
  const named = `missing.${item.kind}.${item.found ?? item.cap ?? ''}`;
  if ((item.kind === 'active-content' || item.kind === 'unapproved-link') && isMessageId(named)) return t(named);
  if (item.kind === 'unapproved-link' && item.found !== undefined) {
    return t('missing.unapproved-link.named', { found: item.found });
  }
  if (item.kind === 'intake-cap' && isMessageId(named) && item.limit !== undefined) {
    return t(named, { limit: item.limit });
  }
  if (item.kind === 'reader-error' && item.error !== undefined) {
    return t('missing.reader-error.named', { error: item.error });
  }
  if (item.kind === 'customer-contact-column' && item.column !== undefined && item.sheet !== undefined) {
    return t('missing.customer-contact-column.named', { column: item.column, sheet: item.sheet });
  }
  if (item.kind === 'unrecognised-sheet' && item.sheet !== undefined) {
    return t('missing.unrecognised-sheet.named', { sheet: item.sheet });
  }
  return undefined;
}

/** The kinds of missing item a policy or setting gate names (design-language 10.17). */
const gateKinds: ReadonlySet<string> = new Set([
  'policy',
  'setting',
  'capability',
  'activity',
  'origin',
  // An opening batch's own gate: the hosting and the unit's switch (imports-and-opening-data 4.2, 10.1; S1-F13-T03).
  'hosting',
  'opening-switch',
]);

/** Where the banner points: the first policy it names on Setup › Policy readiness, or the screen itself. */
export function policyReadinessHref(missing: readonly MissingItem[]): string {
  const policy = missing.find((item) => item.kind === 'policy' && item.policy !== undefined)?.policy;
  return policy === undefined ? '/setup/policy-readiness' : `/setup/policy-readiness?policy=${policy}`;
}

/**
 * Unavailable (PRD-UXP-003, PRD-SEC-017). Where a policy, setting or capability is missing, it is Live action
 * unavailable (design-language 10.17): an Attention banner that names each thing the server listed as missing and
 * links to the policy on Setup › Policy readiness (S1-F04-T01). Where only the person's role assignments fall short, it is Not available to you
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
      <a href={policyReadinessHref(missing)} className="text-accent underline">
        {t('unavailable.policy-readiness')}
      </a>
    </Banner>
  );
}

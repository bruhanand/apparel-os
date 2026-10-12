import type { ErrorBody, MissingItem } from '@apparel-os/schemas';
import { isMessageId, t } from '@apparel-os/ui';

// The counter's screen text comes from the one message catalogue, shared with the web app through `@apparel-os/ui`
// (code-house-rules 12.13; English first, Hindi in stage 5). Every word the enrolment and sign-in pages show is an
// entry there; a refusal is shown by its code's entry, with what is missing named (PRD-UXP-003).

export { t };

/** The text of one missing item: a setting by its name, any other by its kind (code-house-rules 12.3, 12.14). */
function missingText(item: MissingItem): string {
  if (item.kind === 'setting' && item.setting !== undefined) {
    const name = `setting.name.${item.setting}`;
    return t('missing.setting.named', { setting: isMessageId(name) ? t(name) : item.setting });
  }
  const id = `missing.${item.kind}`;
  return t(isMessageId(id) ? id : 'missing.other');
}

/** A refusal's text: its code's entry and each thing it names as missing; no answer when there is no refusal body. */
export function refusalText(error: Pick<ErrorBody, 'code' | 'missing'> | undefined): string {
  if (error === undefined) return t('error-state.no-answer');
  const id = `error.${error.code}`;
  return [t(isMessageId(id) ? id : 'error.unknown-code'), ...(error.missing ?? []).map(missingText)].join(' ');
}

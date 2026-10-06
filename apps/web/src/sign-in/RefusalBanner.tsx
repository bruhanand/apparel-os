import type { ErrorBody } from '@apparel-os/schemas';
import { displayReference } from '../api/reference';
import { Banner } from '../components/Banner';
import { missingText } from '../components/UnavailableState';
import { isMessageId, t, type MessageId } from '../messages/catalogue';

function codeMessage(code: string): MessageId {
  const id = `error.${code}`;
  return isMessageId(id) ? id : 'error.unknown-code';
}

/**
 * A refused sign-in step, at the top of its form (design-language 10.12; code-house-rules 12.3): the code's text, what
 * is missing when the server names it, and the reference to give the people who run the system. Null `refusal`: no
 * answer came. A refused sign-in names no part (access-and-approvals 3.1), so this shows nothing the server did not.
 */
export function RefusalBanner({ refusal }: { refusal: ErrorBody | null }) {
  if (refusal === null) return <Banner tone="danger" role="alert" message="error-state.no-answer" />;
  const missing = refusal.missing ?? [];
  return (
    <Banner
      tone={refusal.kind === 'unavailable' ? 'warning' : 'danger'}
      role="alert"
      message={codeMessage(refusal.code)}
    >
      {missing.length > 0 && (
        <ul className="list-none p-0">
          {missing.map((item, index) => (
            <li key={index}>{missingText(item)}</li>
          ))}
        </ul>
      )}
      <span className="text-caption">
        {t('error-state.reference')} <span className="font-mono">{displayReference(refusal.reference)}</span>
      </span>
    </Banner>
  );
}

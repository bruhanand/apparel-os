import type { SettingOrigin } from '@apparel-os/schemas';
import { t, type MessageId } from '../messages/catalogue';

// Where a setting's value comes from (code-house-rules 12.14), as the options of a select every setting form shares:
// KDPS's answer, a setting of the test setup, or synthetic. No origin is chosen for the person: the first option asks
// for one (AGENTS.md "Never invent a value").

const ORIGINS = ['kdps', 'test-setup', 'synthetic'] as const satisfies readonly SettingOrigin[];

/** The options of an origin select, the first one empty and asking for a choice. */
export function OriginOptions({ choose }: { choose: MessageId }) {
  return (
    <>
      <option value="">{t(choose)}</option>
      {ORIGINS.map((origin) => (
        <option key={origin} value={origin}>
          {t(`security.origin.${origin}`)}
        </option>
      ))}
    </>
  );
}

import { useState } from 'react';
import { t } from '../messages/catalogue';

const choices = ['system', 'light', 'dark'] as const;
type ThemeChoice = (typeof choices)[number];

/**
 * The theme switch of the top bar (design-language 2 "Theme", 6 A): Match device, Light or Dark, applied at once
 * without a reload by setting data-theme on <html>; Match device removes it, so the CSS follows the device. The
 * choice is saved to the user once My profile › Theme has its setting (RR-263); until then it lasts for the page.
 */
export function ThemeSwitch() {
  // Starts from what the page shows, since the switch sits in the top bar from 640 px up and in the left drawer below
  // it, and mounts afresh each time the drawer opens (S1-F01-T32).
  const [choice, setChoice] = useState<ThemeChoice>(() =>
    typeof document === 'undefined'
      ? 'system'
      : (choices.find((value) => value === document.documentElement.dataset.theme) ?? 'system'),
  );
  return (
    <label className="flex items-center gap-2 text-body-sm">
      <span className="sr-only">{t('theme.label')}</span>
      <select
        value={choice}
        className="h-9 rounded-control border border-control bg-surface px-2"
        onChange={(event) => {
          const next = choices.find((value) => value === event.target.value) ?? 'system';
          setChoice(next);
          if (next === 'system') delete document.documentElement.dataset.theme;
          else document.documentElement.dataset.theme = next;
        }}
      >
        {choices.map((value) => (
          <option key={value} value={value}>
            {t(`theme.${value}`)}
          </option>
        ))}
      </select>
    </label>
  );
}

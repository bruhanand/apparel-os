import type { ValueSuggestion } from '@apparel-os/schemas';

// The suggestions a handler offers for a staged value from its own records, for a person to accept (imports-and-opening-data
// 5, 13.2; PRD-IMP-009). Shared by every handler, so each offers them the same way. Pure.

/**
 * The most close matches offered for one value. Technical tuning of a suggestion a person still accepts, never a
 * business value: imports-and-opening-data 13.2, a design choice accepted as a builder value by the product owner,
 * 10 Oct 2026.
 */
export const MOST_SUGGESTIONS = 5;

/** The close matches given, best first, each value once, at most `MOST_SUGGESTIONS`. */
export function closeSuggestions(
  matches: readonly { readonly value: string; readonly label?: string }[],
): ValueSuggestion[] {
  const best = new Map<string, string | undefined>();
  for (const match of matches) if (!best.has(match.value)) best.set(match.value, match.label);
  return [...best]
    .slice(0, MOST_SUGGESTIONS)
    .map(([value, label]) => ({ kind: 'close', value, ...(label === undefined ? {} : { label }) }));
}

/**
 * Exact or close matches among the values a handler accepts, such as stock units or Store formats: the option equal to
 * the value, case ignored; else those that hold it, it holds, or that start as it does.
 */
export function optionSuggestions(options: readonly string[], value: string | undefined): ValueSuggestion[] {
  if (value === undefined || value === '') return [];
  const said = value.toLowerCase();
  const exact = options.filter((option) => option.toLowerCase() === said);
  if (exact.length > 0) return exact.map((option) => ({ kind: 'exact', value: option }));
  return closeSuggestions(
    options
      .filter((option) => option.includes(said) || said.includes(option) || option.startsWith(said.slice(0, 3)))
      .map((option) => ({ value: option })),
  );
}

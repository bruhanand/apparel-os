import { normalisedName, type MappingRuleScope } from '@apparel-os/schemas';

// Mapping rules (imports-and-opening-data 6.3; PRD-IMP-003, PRD-IMP-008; S1-F06-T03): a rule turns one source word
// into one approved value for one attribute, in one scope. Matching compares the word trimmed with spaces collapsed;
// whether case matters is part of the rule. A layout-scope rule wins over any wider rule; supplier, brand and
// Organisation rules that match one word with different targets make it ambiguous: it is not mapped, and the issue
// names the rules. Only Confirmed versions in force on the date reach matching; an unconfirmed proposal changes
// nothing (PRD-IMP-008). Pure: no database.

/** A word as a rule keeps it: trimmed, spaces collapsed, and lower-cased where case does not matter (6.3). */
export function normalisedWord(word: string, caseSensitive: boolean): string {
  const normal = normalisedName(word);
  return caseSensitive ? normal : normal.toLowerCase();
}

/** One Confirmed rule version in force, as matching needs it. */
export interface RuleInForce {
  readonly ruleId: string;
  readonly ruleVersionId: string;
  readonly attribute: string;
  readonly scope: MappingRuleScope;
  readonly normalisedWord: string;
  readonly caseSensitive: boolean;
  readonly target: string;
}

/** The scopes a batch reads rules in: its layout, the supplier or brand it names, and the Organisation (6.3). */
export interface RuleScopes {
  readonly layoutId: string;
  readonly supplierId?: string | undefined;
  readonly brandId?: string | undefined;
}

export type RuleMatch =
  | { readonly kind: 'none' }
  | { readonly kind: 'mapped'; readonly target: string; readonly ruleId: string; readonly ruleVersionId: string }
  | { readonly kind: 'ambiguous'; readonly ruleIds: readonly string[] };

function inScope(rule: RuleInForce, scopes: RuleScopes): boolean {
  switch (rule.scope.kind) {
    case 'organisation':
      return true;
    case 'layout':
      return rule.scope.id === scopes.layoutId;
    case 'supplier':
      return rule.scope.id === scopes.supplierId;
    case 'brand':
      return rule.scope.id === scopes.brandId;
  }
}

/** Matches one word of one attribute against the rules in force (6.3). */
export function matchRule(
  rules: readonly RuleInForce[],
  attribute: string,
  word: string,
  scopes: RuleScopes,
): RuleMatch {
  const matching = rules.filter(
    (rule) =>
      rule.attribute === attribute &&
      inScope(rule, scopes) &&
      rule.normalisedWord === normalisedWord(word, rule.caseSensitive),
  );
  const layoutRules = matching.filter((rule) => rule.scope.kind === 'layout');
  const candidates = layoutRules.length > 0 ? layoutRules : matching;
  const targets = new Set(candidates.map((rule) => rule.target));
  const [first] = candidates;
  if (first === undefined) return { kind: 'none' };
  if (targets.size > 1)
    return { kind: 'ambiguous', ruleIds: [...new Set(candidates.map((rule) => rule.ruleId))].sort() };
  return { kind: 'mapped', target: first.target, ruleId: first.ruleId, ruleVersionId: first.ruleVersionId };
}

/** A business-date range, half-open: from its first day, to the day after its last; no `to` when open-ended. */
export interface DateRange {
  readonly from: string;
  readonly to?: string;
}

/** A `daterange` as Postgres writes it, `[2026-10-10,2026-11-01)` or `[2026-10-10,)`. */
export function dateRangeOf(text: string): DateRange {
  const match = /^\[(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})?\)$/.exec(text);
  if (match?.[1] === undefined) throw new Error('A date range is not in the form Postgres writes');
  return { from: match[1], ...(match[2] === undefined ? {} : { to: match[2] }) };
}

/** A `daterange`'s text, half-open. */
export function dateRangeText(range: DateRange): string {
  return `[${range.from},${range.to ?? ''})`;
}

export type FollowOn =
  | {
      readonly kind: 'follows';
      /** The Confirmed versions it follows, each ended on its start date (code-house-rules 7.3). */
      readonly ends: readonly { readonly id: string; readonly range: DateRange }[];
      /** Its own end, where it is open-ended and a Confirmed version starts after it. */
      readonly ownEnd?: string;
    }
  | { readonly kind: 'conflict'; readonly with: string };

const overlaps = (a: DateRange, b: DateRange) =>
  (a.to === undefined || b.from < a.to) && (b.to === undefined || a.from < b.to);

/**
 * How a rule version confirmed from its start date sits among the Confirmed versions of the same rule, which never
 * overlap (code-house-rules 7.3; imports-and-opening-data 6.3, 15.1): one that starts before it and runs into it ends
 * on its start date, as a version followed by the next does; where it is open-ended and one starts after it, it ends
 * where that one starts. One starting on its own start date, or after it while it has an end of its own that runs
 * into it, is a conflict: neither may be moved, since a start never changes.
 */
export function followOn(
  version: DateRange,
  confirmed: readonly { readonly id: string; readonly range: DateRange }[],
): FollowOn {
  const later = confirmed
    .filter((each) => each.range.from >= version.from)
    .sort((a, b) => (a.range.from < b.range.from ? -1 : 1));
  const same = later.find((each) => each.range.from === version.from);
  if (same !== undefined) return { kind: 'conflict', with: same.id };
  let ownEnd: string | undefined;
  const [next] = later;
  if (next !== undefined) {
    if (version.to === undefined) ownEnd = next.range.from;
    else if (overlaps(version, next.range)) return { kind: 'conflict', with: next.id };
  }
  const ends = confirmed
    .filter((each) => each.range.from < version.from && overlaps(each.range, version))
    .map((each) => ({ id: each.id, range: { from: each.range.from, to: version.from } }));
  return { kind: 'follows', ends, ...(ownEnd === undefined ? {} : { ownEnd }) };
}

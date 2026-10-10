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

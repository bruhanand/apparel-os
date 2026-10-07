import { get, set, type FieldErrors, type FieldValues, type Resolver } from 'react-hook-form';

// A start date before the Organisation's today (S1-F01-T34; design-language 8 and 10.7). The refusal code and its
// message are the server's own, `access.starts-in-past`; the server still checks every date it is sent, this check
// only says so before the request goes (GC2-7; RR-381).

/** The refusal code of a start date before the earliest day allowed, shared with the server's. */
export const STARTS_IN_PAST = 'access.starts-in-past';

/**
 * The issue code of the security settings form only: the server refuses a setting that starts today as well, so its
 * earliest day is tomorrow, and "today or a later date" would be wrong there (`security-settings.ts`, access-and-
 * approvals 3.3; S1-F01-T34). A client-side code with its own message, never one the server sends.
 */
export const STARTS_BEFORE_TOMORROW = 'access.starts-before-tomorrow';

/**
 * Whether a start date is before the earliest day allowed, both as YYYY-MM-DD (so a plain string compare orders
 * them). An empty or missing value is not a past date: the route's own schema says it is required. A browser that
 * rejects a typed date hands on an empty value, which is the same case.
 */
export function startsInPast(value: unknown, earliest: string): boolean {
  return typeof value === 'string' && value !== '' && value < earliest;
}

/** One start-date field of a form: its path in the values, the earliest day allowed, and when it applies at all. */
export interface StartDateCheck<Values extends FieldValues = FieldValues> {
  readonly path: string;
  /** The Organisation's today, or the day after it where the server refuses today too (security settings). */
  readonly earliest: string;
  /** The issue code a day before the earliest fails with; `access.starts-in-past` unless the form says otherwise. */
  readonly code?: string;
  readonly when?: (values: Values) => boolean;
}

/**
 * A resolver that adds the start-date check to another's answer: the field fails with the type `access.starts-in-past`
 * unless the route's schema already found something wrong with it, whose message is the better one. It reports on
 * blur and on submit as the form's other fields do (design-language 10.7).
 */
export function withStartDateChecks<Values extends FieldValues>(
  base: Resolver<Values>,
  checks: readonly StartDateCheck<Values>[],
): Resolver<Values> {
  return async (values, context, options) => {
    const answer = await base(values, context, options);
    const errors = { ...answer.errors } as FieldErrors<Values>;
    let found = false;
    for (const check of checks) {
      if (check.when !== undefined && !check.when(values)) continue;
      if (!startsInPast(get(values, check.path), check.earliest)) continue;
      if (get(errors, check.path) !== undefined) continue;
      const code = check.code ?? STARTS_IN_PAST;
      set(errors, check.path, { type: code, message: code });
      found = true;
    }
    if (!found) return answer;
    return { values: {}, errors };
  };
}

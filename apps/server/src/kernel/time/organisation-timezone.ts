import type { TransactionContext } from '../command-runner/transaction-context.js';

/**
 * The Organisation's timezone as read for a command: the setting's version in force, whose identifier the command
 * stores (code-house-rules 7.3, 12.14; PRD-MOD-010), or "not set" as an answer of its own, never a guess.
 */
export type TimezoneSetting =
  { readonly kind: 'set'; readonly timezone: string; readonly versionId: string } | { readonly kind: 'not-set' };

/**
 * Where the command runner reads the Organisation's timezone (PRD-MOD-009). The timezone is an Organisation setting
 * in `configuration`, effective-dated, with no default (code-house-rules 9; domain-model 3.6). `configuration` sits
 * above `kernel`, so `kernel` defines this contract and `configuration` implements it when it is built
 * (module-map section 3, rules 4 and 6). It reads inside the command's transaction, through its context.
 */
export interface OrganisationTimezoneSource {
  /** The timezone in force for the instant the command acts at. */
  read(context: TransactionContext, at: Date): Promise<TimezoneSetting>;
}

/**
 * The source until `configuration` exists: no Organisation has a timezone yet, so every answer is "not set", and an
 * operation that needs a business date stays unavailable (code-house-rules 9; PRD-SEC-017). It supplies no value.
 */
export const timezoneNotConfigured: OrganisationTimezoneSource = {
  read: () => Promise.resolve({ kind: 'not-set' }),
};

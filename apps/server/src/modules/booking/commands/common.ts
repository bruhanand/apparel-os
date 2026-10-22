import type { MissingItem } from '@apparel-os/schemas';
import { LOCK_STEP, lockTable, type CommandRefusal, type TransactionContext } from '../../../kernel/index.js';
import type { AuditChange } from '../../audit/index.js';

// What every command of `booking` shares (code-house-rules 8.1, 8.2, 12.3).

/** A command's answer: its success, or a refusal naming what is missing (PRD-UXP-003). */
export type Outcome<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

export function refused<Answer>(
  kind: CommandRefusal['kind'],
  code: string,
  missing: readonly MissingItem[] = [],
): Outcome<Answer> {
  return { kind: 'refusal', refusal: { kind, code, missing } };
}

export type ValueChange = Extract<AuditChange, { kind: 'value' }>;

/** A field's value before and after a change, as its audit record keeps it (numbering-and-audit 4.1). */
export const valueChange = (
  field: string,
  before: ValueChange['before'],
  after: ValueChange['after'],
): ValueChange => ({ kind: 'value', field, before, after });

/** Today under the Organisation's timezone, or the refusal while it has none (code-house-rules 9). */
export async function today(context: TransactionContext): Promise<string | CommandRefusal> {
  const date = await context.businessDate();
  if (date.kind === 'set') return date.date;
  return {
    kind: 'unavailable',
    code: 'access.business-date-not-set',
    missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
  };
}

/** A budget's identity row, which every change and decision of it locks exclusively at step 1 (8.2). */
export const budgetLock = (budgetId: string) =>
  ({ table: lockTable('booking', 'open_to_buy_budget'), id: budgetId, mode: 'exclusive' }) as const;

/** Locks a budget's identity row with any further targets of step 1, in one call; false when it does not exist. */
export async function lockBudget(
  context: TransactionContext,
  budgetId: string,
  further: Parameters<TransactionContext['lock']>[1] = [],
): Promise<boolean> {
  const locked = await context.lock(LOCK_STEP.document, [budgetLock(budgetId), ...further]);
  return !locked.missing.some((each) => each.id === budgetId);
}

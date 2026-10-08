import type { MissingItem } from '@apparel-os/schemas';
import { and, eq, sql } from 'drizzle-orm';
import type { CommandRefusal, TransactionContext } from '../../../kernel/index.js';
import { masterTables } from '../db/tables.js';
import { recordTypeOf, type MasterKind } from '../domain/kinds.js';

// What preparing a change and deciding it share (structure-and-masters 2.2, 2.3; S1-F02-T01).

/** The user preparing a change, and the assignment Authorise used (access-and-approvals 7.1 step 3, 9.1). */
export interface Preparer {
  readonly userId: string;
  readonly roleAssignmentId: string;
}

export type Prepared<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer }
  | { readonly kind: 'refusal'; readonly refusal: CommandRefusal };

export function refusal<Answer>(
  kind: CommandRefusal['kind'],
  code: string,
  missing: MissingItem[] = [],
): Prepared<Answer> {
  return { kind: 'refusal', refusal: { kind, code, missing } };
}

export const notFound = (kind: MasterKind, id: string): MissingItem => ({
  kind: 'record',
  recordType: recordTypeOf(kind),
  recordId: id,
});

/** Today under the Organisation's timezone, or the refusal while it has none (PRD-MOD-009; code-house-rules 9). */
export async function today(context: TransactionContext): Promise<string | CommandRefusal> {
  const date = await context.businessDate();
  if (date.kind === 'set') return date.date;
  return {
    kind: 'unavailable',
    code: 'access.business-date-not-set',
    missing: [{ kind: 'setting', setting: 'configuration.timezone' }],
  };
}

/** A record another one refers to. */
export interface Reference {
  readonly kind: MasterKind;
  readonly id: string;
}

/** Whether a record of a kind exists. */
export async function exists(context: TransactionContext, kind: MasterKind, id: string): Promise<boolean> {
  const tables = masterTables[kind];
  const rows = await context.tx
    .select({ id: tables.identityId })
    .from(tables.identity)
    .where(eq(tables.identityId, id));
  return rows.length > 0;
}

/** Whether a record has an approved version in force on a date (structure-and-masters 2.2). */
export async function inForceOn(
  context: TransactionContext,
  kind: MasterKind,
  recordId: string,
  date: string,
): Promise<boolean> {
  const tables = masterTables[kind];
  const rows = await context.tx
    .select({ id: tables.versionId })
    .from(tables.version)
    .where(
      and(eq(tables.owner, recordId), eq(tables.decision, 'Approved'), sql`${tables.validDuring} @> ${date}::date`),
    );
  return rows.length > 0;
}

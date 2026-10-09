import type { ExceptionLink, ExceptionParty } from '@apparel-os/schemas';
import { asc, desc, eq, inArray, ne } from 'drizzle-orm';
import type { TransactionContext } from '../../../kernel/index.js';
import { exception, exceptionEvent, exceptionLink, exceptionType } from '../db/schema.js';
import { partyOf } from '../commands/common.js';

// Reads of exceptions (access-and-approvals 12.3, 14; PRD-EXC-004). Only exceptions code reads its tables; the caller
// admits the reader first (12.4 "As built").

export type ExceptionRow = typeof exception.$inferSelect;

/** An exception with what its record shows: type, links, events, the earlier exception it repeats. */
export interface ExceptionRecord {
  readonly row: ExceptionRow;
  readonly type: { readonly code: string; readonly category: string; readonly module: string };
  readonly links: readonly ExceptionLink[];
  readonly events: readonly {
    readonly id: string;
    readonly kind: string;
    readonly actorId: string | null;
    readonly to: ExceptionParty | null;
    readonly comment: string | null;
    readonly occurredAt: Date;
  }[];
  readonly earlierCode: string | null;
  /** The parties escalated to since it was raised or last reopened (11.3), who may act on it beside its owner. */
  readonly escalatedTo: readonly ExceptionParty[];
}

export async function readException(
  context: TransactionContext,
  exceptionId: string,
): Promise<ExceptionRecord | undefined> {
  const row = (await context.tx.select().from(exception).where(eq(exception.id, exceptionId)))[0];
  if (row === undefined) return undefined;
  const type = (await context.tx.select().from(exceptionType).where(eq(exceptionType.id, row.exceptionTypeId)))[0];
  if (type === undefined) throw new Error('An exception has no type row');
  const links = await context.tx
    .select()
    .from(exceptionLink)
    .where(eq(exceptionLink.exceptionId, row.id))
    .orderBy(asc(exceptionLink.id));
  const events = await context.tx
    .select()
    .from(exceptionEvent)
    .where(eq(exceptionEvent.exceptionId, row.id))
    .orderBy(asc(exceptionEvent.id));
  const earlier =
    row.earlierExceptionId === null
      ? undefined
      : (
          await context.tx
            .select({ code: exception.code })
            .from(exception)
            .where(eq(exception.id, row.earlierExceptionId))
        )[0];
  const escalatedTo: ExceptionParty[] = [];
  for (const event of events) {
    if (event.kind === 'raised' || event.kind === 'reopened') escalatedTo.splice(0);
    if (event.kind === 'escalated') escalatedTo.push(partyOf(event.toUserId, event.toRoleId));
  }
  return {
    row,
    type: { code: type.code, category: type.category, module: type.module },
    links: links.map((link) => ({
      module: link.module,
      recordType: link.recordType,
      recordId: link.recordId,
      versionId: link.versionId,
    })),
    events: events.map((event) => ({
      id: event.id,
      kind: event.kind,
      actorId: event.actorId,
      to: event.toUserId === null && event.toRoleId === null ? null : partyOf(event.toUserId, event.toRoleId),
      comment: event.comment,
      occurredAt: event.occurredAt,
    })),
    earlierCode: earlier?.code ?? null,
    escalatedTo,
  };
}

/** The open exceptions with their type code, for the read model (12.3), before the reader's scope is applied. */
export async function openExceptions(context: TransactionContext): Promise<{ row: ExceptionRow; typeCode: string }[]> {
  const rows = await context.tx
    .select({ row: exception, typeCode: exceptionType.code })
    .from(exception)
    .innerJoin(exceptionType, eq(exceptionType.id, exception.exceptionTypeId))
    .where(ne(exception.state, 'Closed'))
    .orderBy(desc(exception.id));
  return rows;
}

/** The exceptions with these identifiers, for My work's names. */
export async function exceptionsById(context: TransactionContext, ids: readonly string[]): Promise<ExceptionRow[]> {
  if (ids.length === 0) return [];
  return context.tx
    .select()
    .from(exception)
    .where(inArray(exception.id, [...ids]));
}

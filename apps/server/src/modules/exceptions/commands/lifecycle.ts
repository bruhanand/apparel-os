import { paise, uuidv7 } from '@apparel-os/domain';
import type { ExceptionParty } from '@apparel-os/schemas';
import { and, asc, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import { LOCK_STEP, type TransactionContext } from '../../../kernel/index.js';
import type { AuditActor, AuditChange } from '../../audit/index.js';
import { exception, exceptionEvent, exceptionLink, exceptionRoutingVersion, exceptionType } from '../db/schema.js';
import { EXCEPTION_RECORD_TYPE } from '../domain/types.js';
import { exceptionAssigned, exceptionReopened, exceptionResolved } from '../events.js';
import { done, exceptionRow, exceptionTarget, isOpen, partyColumns, partyOf, refused, type Outcome } from './common.js';
import { publishItem } from './items.js';
import { factsOf, type RaiseDependencies } from './raise.js';

// The lifecycle of an exception (access-and-approvals 12.3; module-map 4.13; POL-03.05, PRD-EXC-002, PRD-EXC-003;
// S1-F08-T02): reassign and comment as events, Resolved when the owning module records the correction, Closed only
// after the owning module's resolution check passes, Reopened when the problem comes back. Each locks the exception at
// step 1 and rechecks its state under the lock (code-house-rules 8.1, 8.2). None changes stock, money or saleability.

type Row = typeof exception.$inferSelect;

/** Who acts, and the assignment Authorise used, when an authorised person rather than the owner acts (7.1). */
export interface Acting {
  readonly actor: AuditActor;
  readonly roleAssignmentId?: string;
}

export interface Changed {
  readonly exceptionId: string;
  readonly state: 'Unresolved' | 'Resolved' | 'Closed' | 'Reopened';
}

async function locked(context: TransactionContext, exceptionId: string): Promise<Outcome<Row>> {
  await context.lock(LOCK_STEP.document, [exceptionTarget(exceptionId)]);
  const row = await exceptionRow(context, exceptionId);
  if (row === undefined) return refused('not-found', 'exceptions.exception-not-found');
  return done(row);
}

function rowFacts(row: Row) {
  return { siteId: row.siteId, storeId: row.storeId, businessUnitId: row.businessUnitId, brandId: row.brandId };
}

async function recordEvent(
  context: TransactionContext,
  row: Row,
  event: { kind: string; actorId: string; to?: ExceptionParty; comment?: string },
): Promise<string> {
  const id = uuidv7();
  const to = event.to === undefined ? { userId: null, roleId: null } : partyColumns(event.to);
  await context.tx.insert(exceptionEvent).values({
    id,
    exceptionId: row.id,
    kind: event.kind,
    actorId: event.actorId,
    toUserId: to.userId,
    toRoleId: to.roleId,
    comment: event.comment ?? null,
    occurredAt: context.startedAt,
  });
  return id;
}

async function audited(
  context: TransactionContext,
  dependencies: RaiseDependencies,
  acting: Acting,
  row: Row,
  operation: string,
  changes: AuditChange[],
): Promise<void> {
  await dependencies.audit.record(context, {
    actor: acting.actor,
    ...(acting.roleAssignmentId === undefined ? {} : { roleAssignmentId: acting.roleAssignmentId }),
    scope: factsOf(rowFacts(row)),
    record: { module: 'exceptions', type: EXCEPTION_RECORD_TYPE, id: row.id },
    operation,
    changes,
    source: { kind: acting.actor.kind === 'user' ? 'screen' : 'job' },
  });
}

function subject(row: Row, eventId: string) {
  return {
    subject: { module: 'exceptions', recordType: EXCEPTION_RECORD_TYPE, recordId: row.id, versionId: eventId },
    scope: factsOf(rowFacts(row)),
    payload: { exceptionId: row.id, eventId },
  };
}

function exposureOf(row: Row) {
  return row.exposureKind === 'known' && row.exposureAmount !== null
    ? ({ kind: 'known', amount: paise(row.exposureAmount) } as const)
    : ({ kind: 'unknown' } as const);
}

/** Comment (POL-03.05): kept in the history, on an open exception. */
export async function comment(
  context: TransactionContext,
  dependencies: RaiseDependencies,
  acting: Acting,
  exceptionId: string,
  text: string,
): Promise<Outcome<Changed>> {
  const found = await locked(context, exceptionId);
  if (found.kind === 'refused') return found;
  const row = found.value;
  if (!isOpen(row.state)) return refused('refused', 'exceptions.not-open');
  await recordEvent(context, row, { kind: 'comment', actorId: acting.actor.id, comment: text });
  await audited(context, dependencies, acting, row, 'comment-on-exception', [
    { kind: 'value', field: 'comment', before: null, after: text },
  ]);
  return done({ exceptionId, state: row.state as Changed['state'] });
}

/**
 * Reassign (POL-03.05; 12.2): the exception's owner becomes the party named, its item in My work moves to them, and
 * the change is kept as an event. A holder of the owning role takes it the same way, naming themselves (12.2).
 */
export async function reassign(
  context: TransactionContext,
  dependencies: RaiseDependencies,
  acting: Acting,
  exceptionId: string,
  to: ExceptionParty,
): Promise<Outcome<Changed>> {
  const found = await locked(context, exceptionId);
  if (found.kind === 'refused') return found;
  const row = found.value;
  if (!isOpen(row.state)) return refused('refused', 'exceptions.not-open');
  const before = partyOf(row.ownerUserId, row.ownerRoleId);
  if (JSON.stringify(before) === JSON.stringify(to)) return refused('refused', 'exceptions.already-owner');
  const owner = partyColumns(to);
  await context.tx
    .update(exception)
    .set({ ownerUserId: owner.userId, ownerRoleId: owner.roleId })
    .where(eq(exception.id, row.id));
  const eventId = await recordEvent(context, row, { kind: 'assigned', actorId: acting.actor.id, to });
  await audited(context, dependencies, acting, row, 'reassign-exception', [
    { kind: 'value', field: 'owner', before, after: to },
  ]);
  await context.publish(exceptionAssigned, subject(row, eventId));
  await dependencies.inbox.close(context, 'exceptions', row.id, row.state);
  await publishItem(context, dependencies.inbox, {
    exceptionId: row.id,
    versionId: eventId,
    state: row.state,
    dueAt: row.dueAt,
    exposure: exposureOf(row),
    facts: rowFacts(row),
    actors: [to],
  });
  return done({ exceptionId, state: row.state as Changed['state'] });
}

/**
 * Record the correction (12.3; PRD-EXC-002): the owning module calls it once the permitted correction, return,
 * reversal or reconciliation is recorded in its own records. The exception is Resolved and stays open until closed.
 */
export async function recordCorrection(
  context: TransactionContext,
  dependencies: RaiseDependencies,
  acting: Acting,
  exceptionId: string,
): Promise<Outcome<Changed>> {
  const found = await locked(context, exceptionId);
  if (found.kind === 'refused') return found;
  const row = found.value;
  if (!isOpen(row.state)) return refused('refused', 'exceptions.not-open');
  if (row.state === 'Resolved') return done({ exceptionId, state: 'Resolved' });
  await context.tx.update(exception).set({ state: 'Resolved' }).where(eq(exception.id, row.id));
  const eventId = await recordEvent(context, row, { kind: 'resolved', actorId: acting.actor.id });
  await audited(context, dependencies, acting, row, 'resolve-exception', [
    { kind: 'value', field: 'state', before: row.state, after: 'Resolved' },
  ]);
  await context.publish(exceptionResolved, subject(row, eventId));
  await dependencies.inbox.updateState(context, 'exceptions', row.id, 'Resolved');
  return done({ exceptionId, state: 'Resolved' });
}

/**
 * Close (12.3; module-map 4.13 "Resolve"; PRD-EXC-002, POL-03.05): only after the owning module's resolution check
 * verifies the linked business outcome, under the exception's lock; otherwise refused, naming what the check finds
 * missing, and the exception stays as it was. The required approval is that of the linked correction in its owning
 * module, which its check verifies (12.3). Closing writes nothing of stock, money or saleability (PRD-EXC-003): only
 * the exception's state, its event, its audit record and the item's close.
 */
export async function close(
  context: TransactionContext,
  dependencies: RaiseDependencies,
  acting: Acting,
  exceptionId: string,
): Promise<Outcome<Changed>> {
  const found = await locked(context, exceptionId);
  if (found.kind === 'refused') return found;
  const row = found.value;
  if (!isOpen(row.state)) return refused('refused', 'exceptions.not-open');
  const typeRow = (await context.tx.select().from(exceptionType).where(eq(exceptionType.id, row.exceptionTypeId)))[0];
  const type = typeRow === undefined ? undefined : dependencies.types.get(typeRow.code);
  const missingCheck = { kind: 'resolution-check', exceptionType: typeRow?.code ?? 'unknown' };
  if (type === undefined) return refused('refused', 'exceptions.resolution-not-verified', [missingCheck]);
  const links = await context.tx
    .select()
    .from(exceptionLink)
    .where(eq(exceptionLink.exceptionId, row.id))
    .orderBy(asc(exceptionLink.id));
  const answer = await type.resolutionCheck(context, {
    exceptionId: row.id,
    typeCode: type.code,
    links: links.map((link) => ({
      module: link.module,
      recordType: link.recordType,
      recordId: link.recordId,
      versionId: link.versionId,
    })),
  });
  if (answer.kind !== 'verified') {
    return refused('refused', 'exceptions.resolution-not-verified', [missingCheck, ...answer.missing]);
  }
  await context.tx.update(exception).set({ state: 'Closed' }).where(eq(exception.id, row.id));
  const eventId = await recordEvent(context, row, { kind: 'closed', actorId: acting.actor.id });
  await audited(context, dependencies, acting, row, 'close-exception', [
    { kind: 'value', field: 'state', before: row.state, after: 'Closed' },
  ]);
  await context.publish(exceptionResolved, subject(row, eventId));
  await dependencies.inbox.close(context, 'exceptions', row.id, 'Closed');
  return done({ exceptionId, state: 'Closed' });
}

/**
 * Reopen (12.3; PRD-EXC-003): a closed exception whose problem came back is Reopened, with the reason as its comment,
 * back in its owner's My work under the due time it was given. Its history is kept.
 */
export async function reopen(
  context: TransactionContext,
  dependencies: RaiseDependencies,
  acting: Acting,
  exceptionId: string,
  text: string,
): Promise<Outcome<Changed>> {
  const found = await locked(context, exceptionId);
  if (found.kind === 'refused') return found;
  const row = found.value;
  if (row.state !== 'Closed') return refused('refused', 'exceptions.not-closed');
  await context.tx.update(exception).set({ state: 'Reopened' }).where(eq(exception.id, row.id));
  const eventId = await recordEvent(context, row, { kind: 'reopened', actorId: acting.actor.id, comment: text });
  await audited(context, dependencies, acting, row, 'reopen-exception', [
    { kind: 'value', field: 'state', before: row.state, after: 'Reopened' },
    { kind: 'value', field: 'comment', before: null, after: text },
  ]);
  await context.publish(exceptionReopened, subject(row, eventId));
  await publishItem(context, dependencies.inbox, {
    exceptionId: row.id,
    versionId: eventId,
    state: 'Reopened',
    dueAt: row.dueAt,
    exposure: exposureOf(row),
    facts: rowFacts(row),
    actors: [partyOf(row.ownerUserId, row.ownerRoleId)],
  });
  return done({ exceptionId, state: 'Reopened' });
}

/**
 * Escalate overdue exceptions (11.3; PRD-ACS-010, POL-02.16): each open exception past its due time, not yet escalated
 * since it was raised or last reopened, gets the escalation recipient of the routing version it used added to its
 * item, its owner kept, and the escalation recorded on the exception and on the item. Run by the job under its
 * service identity; each exception is locked at step 1 in this one transaction and rechecked. Returns how many.
 */
export async function escalateOverdue(
  context: TransactionContext,
  dependencies: RaiseDependencies,
  acting: Acting,
): Promise<number> {
  const due = await context.tx
    .select({ id: exception.id })
    .from(exception)
    .where(and(ne(exception.state, 'Closed'), lt(exception.dueAt, context.startedAt)))
    .orderBy(asc(exception.id));
  if (due.length === 0) return 0;
  await context.lock(
    LOCK_STEP.document,
    due.map((row) => exceptionTarget(row.id)),
  );
  const rows = await context.tx
    .select()
    .from(exception)
    .where(
      inArray(
        exception.id,
        due.map((row) => row.id),
      ),
    )
    .orderBy(asc(exception.id));
  let escalated = 0;
  for (const row of rows) {
    if (!isOpen(row.state) || row.dueAt >= context.startedAt) continue;
    const last = (
      await context.tx
        .select({ kind: exceptionEvent.kind })
        .from(exceptionEvent)
        .where(
          and(
            eq(exceptionEvent.exceptionId, row.id),
            sql`${exceptionEvent.kind} in ('escalated', 'raised', 'reopened')`,
          ),
        )
        .orderBy(desc(exceptionEvent.id))
        .limit(1)
    )[0];
    if (last?.kind === 'escalated') continue;
    const routing = (
      await context.tx
        .select()
        .from(exceptionRoutingVersion)
        .where(eq(exceptionRoutingVersion.id, row.routingVersionId))
    )[0];
    if (routing === undefined) continue;
    const recipient = partyOf(routing.escalationUserId, routing.escalationRoleId);
    const eventId = await recordEvent(context, row, { kind: 'escalated', actorId: acting.actor.id, to: recipient });
    await audited(context, dependencies, acting, row, 'escalate-exception', [
      { kind: 'value', field: 'escalatedTo', before: null, after: recipient },
    ]);
    await context.publish(exceptionAssigned, subject(row, eventId));
    await dependencies.inbox.escalate(
      context,
      'exceptions',
      row.id,
      recipient.kind === 'user' ? { userId: recipient.userId } : { roleId: recipient.roleId },
    );
    escalated += 1;
  }
  return escalated;
}

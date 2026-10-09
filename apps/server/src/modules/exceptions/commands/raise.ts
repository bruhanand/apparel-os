import { uuidv7 } from '@apparel-os/domain';
import type { ExceptionExposure, ExceptionLink } from '@apparel-os/schemas';
import { and, desc, eq, inArray, lt } from 'drizzle-orm';
import {
  CommandDefect,
  LOCK_STEP,
  scopeFactsOf,
  type LockTarget,
  type TransactionContext,
} from '../../../kernel/index.js';
import type { AuditActor, AuditInterface } from '../../audit/index.js';
import type { InboxInterface } from '../../inbox/index.js';
import type { NumberingInterface } from '../../numbering/index.js';
import { exception, exceptionEvent, exceptionLink } from '../db/schema.js';
import {
  dueAtOf,
  EXCEPTION_CODE_KIND,
  EXCEPTION_CODE_SCOPE_KEY,
  EXCEPTION_RECORD_TYPE,
  MISSING_SERIES,
  missingRouting,
  storedDueRule,
  type ExceptionTypeRegistration,
} from '../domain/types.js';
import { exceptionRaised } from '../events.js';
import { done, ensureType, partyOf, refused, routingInForce, today, type Outcome } from './common.js';
import { publishItem } from './items.js';

// Raise (access-and-approvals 12.1; module-map 4.13; PRD-EXC-001, PRD-EXC-002, PRD-EXC-004, PRD-INT-008, POL-02.16,
// POL-03.04; S1-F08-T02).

/** The Site, Store, business unit and brand of an exception, where they apply (12.1). */
export interface ExceptionFacts {
  readonly siteId: string | null;
  readonly storeId: string | null;
  readonly businessUnitId: string | null;
  readonly brandId: string | null;
}

/** What a raising module, a job or a person gives to raise one exception (12.1). */
export interface RaiseInput {
  /**
   * The event that raised it, unique per problem: a replay of that event finds the exception it raised and makes no
   * second one (PRD-INT-008). Such as the failed job's event, or a person's idempotency key.
   */
  readonly raisingEvent: string;
  readonly typeCode: string;
  readonly facts: ExceptionFacts;
  readonly links: readonly ExceptionLink[];
  readonly exposure: ExceptionExposure;
  /** Who raised it: the person, or the service identity of the job. */
  readonly raisedBy: AuditActor;
  readonly roleAssignmentId?: string;
  readonly comment?: string;
}

export interface Raised {
  readonly exceptionId: string;
  readonly code: string;
  /** True when the raising event had raised it already, so nothing was written. */
  readonly replayed: boolean;
}

export interface RaiseDependencies {
  readonly numbering: NumberingInterface;
  readonly inbox: InboxInterface;
  readonly audit: AuditInterface;
  readonly types: ReadonlyMap<string, ExceptionTypeRegistration>;
}

/**
 * The lock target of the exception-code series, for the raising command's one call at step 8 (stock-ledger 10.3;
 * code-house-rules 8.2), or the refusal while no Open series exists: the operation that would raise is unavailable,
 * naming the series and why: none is defined, or it is Paused (12.1; DEC-116; PRD-UXP-003).
 */
export async function codeSeriesTarget(
  context: TransactionContext,
  numbering: NumberingInterface,
): Promise<Outcome<LockTarget>> {
  const series = await numbering.liveSeries(context, {
    kind: EXCEPTION_CODE_KIND.kind,
    scopeKey: EXCEPTION_CODE_SCOPE_KEY,
  });
  if (series === undefined) return refused('unavailable', 'exceptions.no-exception-code-series', [MISSING_SERIES]);
  if (series.state === 'Paused') {
    return refused('unavailable', 'exceptions.exception-code-series-paused', [MISSING_SERIES]);
  }
  return done(numbering.seriesLockTarget(series.seriesId));
}

/**
 * Allocate's refusal on the held exception-code series, as the raise's: Paused, or used up (numbering-and-audit 3.5,
 * 3.7). Any other cannot happen on the live series the command holds, for a new exception: a defect.
 */
function allocateRefusal<Value>(code: string): Outcome<Value> {
  if (code === 'numbering.series-paused') {
    return refused('unavailable', 'exceptions.exception-code-series-paused', [MISSING_SERIES]);
  }
  if (code === 'numbering.series-exhausted') {
    return refused('unavailable', 'exceptions.exception-code-series-exhausted', [MISSING_SERIES]);
  }
  throw new CommandDefect(`Allocate refused the exception-code series: ${code}`);
}

/**
 * Raise, inside a command that holds the exception-code series at step 8 (numbering-and-audit 3.2). A replay of the
 * raising event answers the exception it raised. Otherwise: the routing in force for the type and Site today gives the
 * owner and the due time, or the raise is refused naming the type and Site (POL-02.16); the code is allocated; the
 * exception is written Unresolved with its links, linked to the latest earlier exception of its type on one of the
 * same records (PRD-EXC-004), with its raised event, its audit record and `exceptions.raised`, and published to the
 * owner's My work in this transaction (11.1). It changes no stock, money or saleability (PRD-EXC-003).
 */
export async function raise(
  context: TransactionContext,
  dependencies: RaiseDependencies,
  input: RaiseInput,
): Promise<Outcome<Raised>> {
  const type = dependencies.types.get(input.typeCode);
  if (type === undefined) {
    return refused('refused', 'exceptions.type-not-registered', [
      { kind: 'exception-type', exceptionType: input.typeCode },
    ]);
  }
  const strange = input.links.find((link) => !type.linksTo.includes(link.recordType));
  if (strange !== undefined) {
    return refused('refused', 'exceptions.link-not-for-type', [
      { kind: 'exception-link', exceptionType: type.code, recordType: strange.recordType },
    ]);
  }
  const first = (await context.tx.select().from(exception).where(eq(exception.raisingEvent, input.raisingEvent)))[0];
  if (first !== undefined) return done({ exceptionId: first.id, code: first.code, replayed: true });
  const date = await today(context);
  if (date.kind === 'refused') return date;
  const routing = await routingInForce(context, type.code, input.facts.siteId, date.value);
  if (routing === undefined) {
    return refused('unavailable', 'exceptions.no-routing', [missingRouting(type.code, input.facts.siteId)]);
  }
  const exceptionId = uuidv7();
  const series = await dependencies.numbering.liveSeries(context, {
    kind: EXCEPTION_CODE_KIND.kind,
    scopeKey: EXCEPTION_CODE_SCOPE_KEY,
  });
  if (series === undefined) return refused('unavailable', 'exceptions.no-exception-code-series', [MISSING_SERIES]);
  const allocated = await dependencies.numbering.allocate(context, {
    seriesId: series.seriesId,
    documentType: EXCEPTION_RECORD_TYPE,
    documentId: exceptionId,
  });
  if (allocated.kind === 'refused') return allocateRefusal(allocated.refusal.code);
  const typeId = await ensureType(context, type);
  const earlier = await earlierException(
    context,
    typeId,
    input.links.map((link) => link.recordId),
    exceptionId,
  );
  const owner = partyOf(routing.ownerUserId, routing.ownerRoleId);
  const dueAt = dueAtOf(storedDueRule(routing.dueRuleFormat, routing.dueRule), context.startedAt);
  await context.tx.insert(exception).values({
    id: exceptionId,
    code: allocated.value.formattedText,
    raisingEvent: input.raisingEvent,
    exceptionTypeId: typeId,
    ...input.facts,
    exposureKind: input.exposure.kind,
    exposureAmount: input.exposure.kind === 'known' ? input.exposure.amount : null,
    routingVersionId: routing.id,
    ownerUserId: routing.ownerUserId,
    ownerRoleId: routing.ownerRoleId,
    dueAt,
    state: 'Unresolved',
    earlierExceptionId: earlier ?? null,
    raisedAt: context.startedAt,
  });
  if (input.links.length > 0) {
    await context.tx.insert(exceptionLink).values(input.links.map((link) => ({ id: uuidv7(), exceptionId, ...link })));
  }
  const raisedEventId = uuidv7();
  await context.tx.insert(exceptionEvent).values({
    id: raisedEventId,
    exceptionId,
    kind: 'raised',
    actorId: input.raisedBy.id,
    toUserId: routing.ownerUserId,
    toRoleId: routing.ownerRoleId,
    comment: null,
    occurredAt: context.startedAt,
  });
  if (input.comment !== undefined) {
    await context.tx.insert(exceptionEvent).values({
      id: uuidv7(),
      exceptionId,
      kind: 'comment',
      actorId: input.raisedBy.id,
      comment: input.comment,
      occurredAt: context.startedAt,
    });
  }
  const scope = factsOf(input.facts);
  await dependencies.audit.record(context, {
    actor: input.raisedBy,
    ...(input.roleAssignmentId === undefined ? {} : { roleAssignmentId: input.roleAssignmentId }),
    scope,
    record: { module: 'exceptions', type: EXCEPTION_RECORD_TYPE, id: exceptionId },
    operation: 'raise-exception',
    changes: [
      { kind: 'value', field: 'code', before: null, after: allocated.value.formattedText },
      { kind: 'value', field: 'typeCode', before: null, after: type.code },
      { kind: 'value', field: 'state', before: null, after: 'Unresolved' },
      { kind: 'value', field: 'owner', before: null, after: owner },
      { kind: 'value', field: 'routingVersionId', before: null, after: routing.id },
    ],
    source: { kind: input.raisedBy.kind === 'user' ? 'screen' : 'job' },
  });
  await context.publish(exceptionRaised, {
    subject: {
      module: 'exceptions',
      recordType: EXCEPTION_RECORD_TYPE,
      recordId: exceptionId,
      versionId: raisedEventId,
    },
    scope,
    payload: { exceptionId, eventId: raisedEventId },
  });
  await publishItem(context, dependencies.inbox, {
    exceptionId,
    versionId: raisedEventId,
    state: 'Unresolved',
    dueAt,
    exposure: input.exposure,
    facts: input.facts,
    actors: [owner],
  });
  return done({ exceptionId, code: allocated.value.formattedText, replayed: false });
}

/** The latest exception of the type, earlier than this one, on one of the same records (PRD-EXC-004). */
async function earlierException(
  context: TransactionContext,
  typeId: string,
  recordIds: readonly string[],
  before: string,
): Promise<string | undefined> {
  if (recordIds.length === 0) return undefined;
  const rows = await context.tx
    .select({ id: exception.id })
    .from(exception)
    .innerJoin(exceptionLink, eq(exceptionLink.exceptionId, exception.id))
    .where(
      and(
        eq(exception.exceptionTypeId, typeId),
        inArray(exceptionLink.recordId, [...recordIds]),
        lt(exception.id, before),
      ),
    )
    .orderBy(desc(exception.id))
    .limit(1);
  return rows[0]?.id;
}

/** The facts an audit record and an event carry: those that apply, never a null as a fact. */
export function factsOf(facts: ExceptionFacts): Record<string, string> {
  return { ...scopeFactsOf(facts) };
}

/**
 * Raise in a command of its own (12.1; module-map 4.13): takes the exception-code series at step 8 and raises. For a
 * person's raise, a job's, or a module's after the transaction that found the problem rolled back, so the exception
 * survives the rollback (PRD-EXC-002; code-house-rules 8.1).
 */
export async function raiseInOwnCommand(
  context: TransactionContext,
  dependencies: RaiseDependencies,
  input: RaiseInput,
): Promise<Outcome<Raised>> {
  const replay = (await context.tx.select().from(exception).where(eq(exception.raisingEvent, input.raisingEvent)))[0];
  if (replay !== undefined && dependencies.types.has(input.typeCode)) {
    return done({ exceptionId: replay.id, code: replay.code, replayed: true });
  }
  const target = await codeSeriesTarget(context, dependencies.numbering);
  if (target.kind === 'refused') return target;
  await context.lock(LOCK_STEP.numberSeries, [target.value]);
  return raise(context, dependencies, input);
}

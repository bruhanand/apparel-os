import { uuidv7 } from '@apparel-os/domain';
import { sql } from 'drizzle-orm';
import { CommandDefect } from '../command-runner/command-errors.js';
import type { Transaction } from '../command-runner/transaction-context.js';
import { outboxEvent } from '../db/schema.js';
import { canonicalJson, type JsonValue } from '../idempotency/canonical-form.js';
import type { EventDefinition, PublishedEvent } from './event-definition.js';

/** The PostgreSQL channel of the wake-up sent at commit; the outbox stays the source (code-house-rules 12.8). */
export const OUTBOX_CHANNEL = 'kernel_outbox';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface Writer {
  readonly tx: Transaction;
  readonly actorId: string | null;
  readonly correlationId: string;
  readonly startedAt: Date;
  /** Whether this transaction has already sent its wake-up. */
  readonly notified: boolean;
}

function checkIdentifier(value: string | undefined, what: string): string | null {
  if (value === undefined) return null;
  if (!UUID.test(value)) throw new CommandDefect(`An event's ${what} is an identifier (a UUID)`);
  return value;
}

/**
 * Saves one event in the command's transaction (code-house-rules 12.8 "Written with the command"; PRD-MOD-006,
 * PRD-INT-004): it commits with the command's other writes, or not at all. The payload is checked against its
 * event type's schema and kept as that schema parsed it, so nothing the type does not declare is kept
 * (PRD-SEC-006). The first event of a transaction also sends the wake-up, which PostgreSQL delivers only at commit.
 * Returns the event's identity.
 */
export async function writeOutboxEvent<Payload extends Record<string, unknown>>(
  writer: Writer,
  definition: EventDefinition<Payload>,
  event: PublishedEvent<Payload>,
): Promise<string> {
  const parsed = definition.payload.safeParse(event.payload);
  // A field the schema does not declare is refused, never silently dropped: the publisher meant to send it.
  if (
    !parsed.success ||
    canonicalJson(parsed.data as JsonValue) !== canonicalJson(event.payload as unknown as JsonValue)
  ) {
    throw new CommandDefect(
      `The payload of a ${definition.type} event does not match its schema at version ${String(definition.version)}`,
    );
  }
  const id = uuidv7();
  const scope = event.scope ?? {};
  await writer.tx.insert(outboxEvent).values({
    id,
    eventType: definition.type,
    payloadVersion: definition.version,
    eventTime: event.eventTime ?? writer.startedAt,
    actorId: writer.actorId,
    onBehalfOfUserId: checkIdentifier(event.onBehalfOfUserId, 'person acted for'),
    correlationId: writer.correlationId,
    subjectModule: event.subject.module,
    subjectRecordType: event.subject.recordType,
    subjectRecordId: checkIdentifier(event.subject.recordId, 'record') ?? '',
    subjectVersionId: checkIdentifier(event.subject.versionId, 'version'),
    siteId: checkIdentifier(scope.siteId, 'Site'),
    storeId: checkIdentifier(scope.storeId, 'Store'),
    businessUnitId: checkIdentifier(scope.businessUnitId, 'business unit'),
    legalEntityId: checkIdentifier(scope.legalEntityId, 'legal entity'),
    brandId: checkIdentifier(scope.brandId, 'brand'),
    subjectUserId: checkIdentifier(scope.subjectUserId, 'subject user'),
    payload: parsed.data,
  });
  if (!writer.notified) await writer.tx.execute(sql`select pg_catalog.pg_notify(${OUTBOX_CHANNEL}, '')`);
  return id;
}

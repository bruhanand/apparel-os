import { asc, desc, eq, gt } from 'drizzle-orm';
import type { LiveMessage } from '@apparel-os/schemas';
import { Client, type ClientConfig, type Pool } from 'pg';
import { newCorrelationId } from '../command-runner/correlation.js';
import type { CommandRunner } from '../command-runner/command-runner.js';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import { outboxEvent } from '../db/schema.js';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import { OUTBOX_CHANNEL } from '../outbox/outbox-writer.js';
import type { RoutedOrganisation } from '../routing/organisation-router.js';
import type { LiveAudience, LiveEvent, SessionAccess, SignedInSession } from './contracts.js';

/**
 * The stream's timing (code-house-rules 12.12; deployment.md section 5). These follow Railway's limits on a stream, 5
 * minutes with no data and 15 minutes in all; they are builders' values, no KDPS value (12.12).
 */
export interface LiveSettings {
  /** How often a heartbeat comment is sent, and the session checked again: well inside the 5-minute idle limit. */
  readonly heartbeatMs: number;
  /** How long a stream lasts before the server ends it and the browser reconnects: inside the 15-minute limit. */
  readonly streamMs: number;
}

/** The stream's timing on Railway (code-house-rules 12.12, as built in S1-F08-T04). */
export const PLATFORM_LIVE_SETTINGS: LiveSettings = { heartbeatMs: 30_000, streamMs: 14 * 60_000 };

/** The token of LiveSettings. */
export const LIVE_SETTINGS = 'kernel.LiveSettings';

/** How long the browser waits before it reconnects, sent as the stream's `retry` field. */
const RECONNECT_MS = 1000;
/**
 * How far back each read looks again for events that committed after a later one (identifiers are made inside the
 * transaction, so commit order can differ from identifier order): longer than any command may run (5.1).
 */
const LOOKBACK_MS = 60_000;
/** How many events one read takes; the stream reads again until none is left. */
const READ_BATCH = 200;

/** One SSE message (code-house-rules 12.12): the event's identity, its type and its data. */
export interface SseMessage {
  readonly id?: string;
  readonly event: string;
  readonly data: LiveMessage;
}

/** Where the stream writes: the HTTP response, through the controller. */
export interface StreamSink {
  send(message: SseMessage): void;
  comment(text: string): void;
  retry(ms: number): void;
  end(): void;
}

interface Subscriber {
  readonly session: SignedInSession;
  readonly sink: StreamSink;
  readonly access: SessionAccess;
  /** Events at or below this identifier were in the outbox when the stream opened, or were sent before it reopened. */
  readonly start: string;
  cursor: string;
  readonly sent: Map<string, number>;
  reading: boolean;
  again: boolean;
  ended: boolean;
  readonly timers: NodeJS.Timeout[];
}

interface Follower {
  readonly subscribers: Set<Subscriber>;
  client: Client | undefined;
}

/** The smallest identifier UUIDv7 can give at an instant: the floor of the look back. */
export function uuidv7Floor(at: number): string {
  const hex = Math.max(0, Math.floor(at)).toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-000000000000`;
}

/** The nil identifier: below every event, for an empty outbox. */
const NOTHING = '00000000-0000-0000-0000-000000000000';

/**
 * The live-update streams of this `app` instance (code-house-rules 12.12; deployment.md section 5; module-map 4.1
 * "Live updates"; PRD Stack: Live updates). One stream per session. For each Organisation with a stream open, the
 * instance follows its outbox, woken by the notification each command sends at commit (12.8); the heartbeat reads it
 * too, so a lost notification delays an event by one heartbeat at most.
 *
 * - **Only what the actor may view.** Each event is read in a read as the session's actor and sent only when its
 *   audience admits the actor: the owning module's, where one registered for the subject's record type, otherwise the
 *   effective grants covering its scope facts (`SessionAccess.mayView`; access-and-approvals 7.2; PRD-SEC-005).
 *   Nothing is cached, so a changed assignment counts from the next event (`PRD-SEC-005`).
 * - **Identifiers only.** A message carries the event's identity, type and subject (PRD-SEC-006).
 * - **Reconnecting.** With `Last-Event-ID`, the events after it are sent; an identifier the outbox does not hold gets
 *   `resync` (deployment.md section 5).
 * - **Revocation and lock.** An event that revokes the session ends the stream at once; the heartbeat ends it when the
 *   session is no longer open: revoked, ended, locked or its user no longer Active (access-and-approvals 3.3;
 *   PRD-SEC-008). The browser opens it again after an unlock.
 */
export class LiveUpdates {
  private readonly audiences = new Map<string, LiveAudience>();
  private readonly followers = new Map<string, Follower>();
  private closing = false;

  constructor(
    private readonly runner: CommandRunner,
    private readonly logger: StructuredLogger,
    private readonly settings: LiveSettings,
    private readonly now: () => number = Date.now,
  ) {}

  /** The owning module's audience for its record types (access-and-approvals 11.1; module-map section 3, rule 6). */
  registerAudience(recordTypes: readonly string[], audience: LiveAudience): void {
    for (const recordType of recordTypes) {
      if (this.audiences.has(recordType)) throw new Error(`A live audience for ${recordType} is already registered`);
      this.audiences.set(recordType, audience);
    }
  }

  /** Opens one stream for a session; resolves once it is open and its first messages, if any, are sent. */
  async open(session: SignedInSession, access: SessionAccess, sink: StreamSink, lastEventId?: string): Promise<void> {
    if (this.closing) {
      sink.end();
      return;
    }
    let start: { cursor: string; resync: boolean };
    try {
      start = await this.start(session, lastEventId);
    } catch (error) {
      this.logger.structured(
        'warn',
        {
          organisationCode: session.organisation.organisationCode,
          correlationId: session.correlationId,
          error: errorName(error),
        },
        'The live stream could not open; the browser reconnects',
        'LiveUpdates',
      );
      sink.end();
      return;
    }
    const subscriber: Subscriber = {
      session,
      sink,
      access,
      start: start.cursor,
      cursor: start.cursor,
      sent: new Map(),
      reading: false,
      again: false,
      ended: false,
      timers: [],
    };
    sink.retry(RECONNECT_MS);
    if (start.resync)
      sink.send({
        ...(start.cursor === NOTHING ? {} : { id: start.cursor }),
        event: 'resync',
        data: { kind: 'resync' },
      });
    subscriber.timers.push(
      setInterval(() => {
        void this.heartbeat(subscriber);
      }, this.settings.heartbeatMs),
      setTimeout(() => {
        this.end(subscriber);
      }, this.settings.streamMs),
    );
    await this.follow(subscriber);
    this.wake(subscriber);
  }

  /** Where a stream starts: after `Last-Event-ID` while the outbox holds it, otherwise after the latest event. */
  private start(
    session: SignedInSession,
    lastEventId: string | undefined,
  ): Promise<{ cursor: string; resync: boolean }> {
    return this.read(session, async (context) => {
      const latest = (
        await context.tx.select({ id: outboxEvent.id }).from(outboxEvent).orderBy(desc(outboxEvent.id)).limit(1)
      )[0]?.id;
      if (lastEventId === undefined) return { cursor: latest ?? NOTHING, resync: false };
      const held = await context.tx
        .select({ id: outboxEvent.id })
        .from(outboxEvent)
        .where(eq(outboxEvent.id, lastEventId));
      if (held.length > 0) return { cursor: lastEventId, resync: false };
      return { cursor: latest ?? NOTHING, resync: true };
    });
  }

  /** Ends a stream: the client went away, or the server ends it. */
  end(subscriber: Subscriber): void {
    if (subscriber.ended) return;
    subscriber.ended = true;
    for (const timer of subscriber.timers.splice(0)) clearTimeout(timer);
    subscriber.sink.end();
    const code = subscriber.session.organisation.organisationCode;
    const follower = this.followers.get(code);
    if (follower === undefined) return;
    follower.subscribers.delete(subscriber);
    if (follower.subscribers.size === 0) {
      this.followers.delete(code);
      void this.unlisten(follower);
    }
  }

  /** The stream of a sink, so the controller can end it when the client goes away. */
  endSink(sink: StreamSink): void {
    for (const follower of this.followers.values()) {
      for (const subscriber of follower.subscribers) if (subscriber.sink === sink) this.end(subscriber);
    }
  }

  /** On shutdown: every stream ends, so the server can close (the browser reconnects to another instance). */
  async beforeApplicationShutdown(): Promise<void> {
    this.closing = true;
    for (const follower of [...this.followers.values()]) {
      for (const subscriber of [...follower.subscribers]) this.end(subscriber);
    }
    await Promise.resolve();
  }

  private async heartbeat(subscriber: Subscriber): Promise<void> {
    if (subscriber.ended) return;
    subscriber.sink.comment('heartbeat');
    try {
      const open = await this.runner.read(
        {
          commandName: 'kernel.live-session-check',
          organisation: subscriber.session.organisation,
          correlationId: newCorrelationId(),
          actor: { kind: 'no-actor', path: 'authenticate' },
        },
        (context) => subscriber.access.stillOpen(context, subscriber.session.sessionId),
      );
      if (!open) {
        this.end(subscriber);
        return;
      }
    } catch (error) {
      this.log('warn', subscriber, error, 'The live stream could not check its session; it ends');
      this.end(subscriber);
      return;
    }
    this.wake(subscriber);
  }

  /** Reads and sends what is new, once at a time per stream; a wake while reading reads once more after. */
  private wake(subscriber: Subscriber): void {
    if (subscriber.ended) return;
    if (subscriber.reading) {
      subscriber.again = true;
      return;
    }
    subscriber.reading = true;
    void (async () => {
      try {
        // Read through a function: a wake may set it while the read is awaited.
        const more = (): boolean => subscriber.again && !subscriber.ended;
        do {
          subscriber.again = false;
          await this.pump(subscriber);
        } while (more());
      } catch (error) {
        this.log('warn', subscriber, error, 'The live stream could not read the outbox; it ends');
        this.end(subscriber);
      } finally {
        subscriber.reading = false;
      }
    })();
  }

  private async pump(subscriber: Subscriber): Promise<void> {
    for (;;) {
      if (subscriber.ended) return;
      const floor = uuidv7Floor(this.now() - LOOKBACK_MS);
      const lower = maxId(subscriber.start, minId(subscriber.cursor, floor));
      const more = await this.read(subscriber.session, async (context) => {
        const rows = await context.tx
          .select()
          .from(outboxEvent)
          .where(gt(outboxEvent.id, lower))
          .orderBy(asc(outboxEvent.id))
          .limit(READ_BATCH);
        const out: SseMessage[] = [];
        let ends = false;
        for (const row of rows) {
          if (subscriber.sent.has(row.id)) continue;
          subscriber.sent.set(row.id, this.now());
          if (row.id > subscriber.cursor) subscriber.cursor = row.id;
          const event = liveEventOf(row);
          if (subscriber.access.endsSession(event, subscriber.session.sessionId)) {
            ends = true;
            break;
          }
          if (await this.admits(context, subscriber.session.userId, event, subscriber.access)) {
            out.push({
              id: event.id,
              event: event.type,
              data: { kind: 'event', type: event.type, subject: event.subject },
            });
          }
        }
        return { out, ends, full: rows.length === READ_BATCH };
      });
      for (const message of more.out) subscriber.sink.send(message);
      if (more.ends) {
        this.end(subscriber);
        return;
      }
      // Forget what fell below the look back: it is never read again.
      for (const [id] of subscriber.sent) if (id < floor) subscriber.sent.delete(id);
      if (!more.full) return;
    }
  }

  private async admits(
    context: TransactionContext,
    actorId: string,
    event: LiveEvent,
    access: SessionAccess,
  ): Promise<boolean> {
    const audience = this.audiences.get(event.subject.recordType);
    return audience === undefined ? access.mayView(context, actorId, event) : audience(context, actorId, event);
  }

  private read<T>(session: SignedInSession, work: (context: TransactionContext) => Promise<T>): Promise<T> {
    return this.runner.read(
      {
        commandName: 'kernel.read-live-updates',
        organisation: session.organisation,
        correlationId: newCorrelationId(),
        actor: { kind: 'actor', actorId: session.userId },
      },
      work,
    );
  }

  /** Follows the Organisation's outbox while a stream is open there: LISTEN on a connection of its own (12.8). */
  private async follow(subscriber: Subscriber): Promise<void> {
    const organisation = subscriber.session.organisation;
    let follower = this.followers.get(organisation.organisationCode);
    if (follower === undefined) {
      follower = { subscribers: new Set(), client: undefined };
      this.followers.set(organisation.organisationCode, follower);
      follower.subscribers.add(subscriber);
      await this.listen(organisation, follower);
      return;
    }
    follower.subscribers.add(subscriber);
  }

  private async listen(organisation: RoutedOrganisation, follower: Follower): Promise<void> {
    const pool = organisation.db.$client as Pool & { options: ClientConfig };
    const client = new Client(pool.options);
    client.on('error', () => {
      // The heartbeat still reads the outbox; the next stream opened here listens again.
      if (follower.client === client) follower.client = undefined;
      client.end().catch(() => undefined);
    });
    client.on('notification', () => {
      for (const subscriber of follower.subscribers) this.wake(subscriber);
    });
    try {
      await client.connect();
      await client.query(`listen ${OUTBOX_CHANNEL}`);
      follower.client = client;
      if (follower.subscribers.size === 0) await this.unlisten(follower);
    } catch (error) {
      this.logger.structured(
        'warn',
        { organisationCode: organisation.organisationCode, error: errorName(error) },
        'The live stream could not listen for the outbox; the heartbeat reads it',
        'LiveUpdates',
      );
      await client.end().catch(() => undefined);
    }
  }

  private async unlisten(follower: Follower): Promise<void> {
    const client = follower.client;
    follower.client = undefined;
    await client?.end().catch(() => undefined);
  }

  private log(level: 'warn', subscriber: Subscriber, error: unknown, message: string): void {
    this.logger.structured(
      level,
      {
        organisationCode: subscriber.session.organisation.organisationCode,
        correlationId: subscriber.session.correlationId,
        error: errorName(error),
      },
      message,
      'LiveUpdates',
    );
  }
}

function liveEventOf(row: typeof outboxEvent.$inferSelect): LiveEvent {
  const scope: Record<string, string> = {};
  for (const [key, value] of [
    ['siteId', row.siteId],
    ['storeId', row.storeId],
    ['businessUnitId', row.businessUnitId],
    ['legalEntityId', row.legalEntityId],
    ['brandId', row.brandId],
    ['subjectUserId', row.subjectUserId],
  ] as const) {
    if (value !== null) scope[key] = value;
  }
  return {
    id: row.id,
    type: row.eventType,
    subject: {
      module: row.subjectModule,
      recordType: row.subjectRecordType,
      recordId: row.subjectRecordId,
      ...(row.subjectVersionId === null ? {} : { versionId: row.subjectVersionId }),
    },
    scope,
    payload: row.payload,
  };
}

function minId(a: string, b: string): string {
  return a < b ? a : b;
}

function maxId(a: string, b: string): string {
  return a > b ? a : b;
}

/** The error's class name only: a message can hold a value (code-house-rules 12.11). */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

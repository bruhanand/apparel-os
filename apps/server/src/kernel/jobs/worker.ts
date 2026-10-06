import { uuidv7 } from '@apparel-os/domain';
import { and, asc, eq, gte, notExists, sql } from 'drizzle-orm';
import { fromDrizzle, type JobResult, type PgBoss } from 'pg-boss';
import { CommandDefect } from '../command-runner/command-errors.js';
import type { CommandRequest, CommandRunner } from '../command-runner/command-runner.js';
import { newCorrelationId } from '../command-runner/correlation.js';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import { outboxConsumer, outboxDispatch, outboxEvent } from '../db/schema.js';
import type { JsonValue, RequestContent } from '../idempotency/canonical-form.js';
import type { CommandOutcome, IdempotencyHelper, IdempotentAnswer } from '../idempotency/idempotency-helper.js';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import type { OrganisationRouter, RoutedOrganisation } from '../routing/organisation-router.js';
import type { JobIdentities } from './contracts.js';
import { KEEP_EVERY_JOB, startJobQueue } from './job-queue.js';
import {
  checkRegistry,
  type ConsumerDefinition,
  type DeliveredEvent,
  type JobKindDefinition,
  type JobRegistry,
} from './registry.js';
import { retryRuleOf } from './retry-rule.js';
import type { RetrySettings, WorkerSettings } from './worker-settings.js';

/** The queue of outbox deliveries, one job per event and consumer (migration 0009; code-house-rules 12.8). */
export const OUTBOX_DELIVERY_QUEUE = 'kernel.outbox-delivery';
/**
 * The code of the internal service identity the outbox processor runs as (access-and-approvals 2.3;
 * code-house-rules 6.3, 12.8). The setup step writes it with the Organisation's other service identities.
 */
export const OUTBOX_PROCESSOR_IDENTITY = 'outbox';

/** A delivery job's data: identifiers only (code-house-rules 12.9). */
export interface DeliveryData {
  readonly eventId: string;
  readonly consumer: string;
}

/** How a job step ended, as pg-boss records it: `completed`, `failed` (retried by its setting) or a terminal fail. */
export type StepResult =
  | { readonly status: 'completed'; readonly output: Record<string, JsonValue> }
  | { readonly status: 'failed' | 'deadletter'; readonly output: Record<string, JsonValue> };

export interface WorkerDependencies {
  readonly router: OrganisationRouter;
  readonly runner: CommandRunner;
  readonly helper: IdempotencyHelper;
  readonly identities: JobIdentities;
  readonly logger: StructuredLogger;
  readonly registry: JobRegistry;
  readonly settings: WorkerSettings;
}

const SERVICE = 'worker';
const CONTEXT = 'Worker';
/** How many events one read of the outbox takes; the processor reads again until none is left. Not a setting. */
const DISPATCH_BATCH = 100;

/** One Organisation database the worker serves: its pg-boss instance and its consumers' identifiers there. */
interface Served {
  readonly organisation: RoutedOrganisation;
  readonly boss: PgBoss;
  readonly consumerIds: ReadonlyMap<string, string>;
}

/**
 * The worker (code-house-rules 12.8, 12.9; module-map 4.1 "Outbox and jobs", section 10; deployment.md section 2):
 * the same build as `app`, another start command. In each Organisation database the directory lists it runs one
 * pg-boss instance and the outbox processor.
 *
 * - **Dispatch.** The processor reads the new events of each consumer's type, recorded since the consumer was first
 *   registered, in identifier order, and for each creates, in one transaction, the delivery job and the dispatch row
 *   naming the event, the consumer and the job; the pair is unique, so an event is handed to each consumer once
 *   however many workers run (PRD-INT-008). It runs under its own internal service identity (6.3, PRD-SEC-018).
 * - **Delivery.** Each delivery is a command under the consumer's service identity, keyed by the event's identity and
 *   the consumer's name, its receipt committed with its effect: a second delivery replays and has no second effect
 *   (PRD-INT-008).
 * - **Job kinds.** Each job kind is sent for each Organisation at the interval of its setting, one per interval
 *   however many workers run, and its step is a command keyed by the job's identity.
 * - **The retry rule** of 12.9: a transient failure is retried by the job kind's setting, a refusal is kept and
 *   never retried, a defect fails the job at once and is logged. A failed job stays failed (CH-9).
 *
 * The NOTIFY a command sends at commit is not listened to yet: the processor reads the outbox at the poll interval
 * of its settings (RR-272).
 */
export class Worker {
  private readonly served = new Map<string, Served>();
  private readonly timers: NodeJS.Timeout[] = [];
  private opened = false;
  private working = false;
  private stopped = false;
  private passing: Promise<void> | undefined;

  constructor(private readonly dependencies: WorkerDependencies) {}

  /** Opens and starts working: the outbox processor, the delivery and job-kind workers, and the job-kind timers. */
  async start(): Promise<void> {
    await this.open();
    this.working = true;
    for (const served of this.served.values()) await this.work(served);
    await this.dispatchAll();
    const every = this.dependencies.settings.pollSeconds * 1000;
    this.timers.push(
      setInterval(() => {
        this.pass();
      }, every),
    );
  }

  /**
   * Checks the registry and starts pg-boss in each Organisation database, refusing to start when a job kind's queue
   * does not exist (code-house-rules 3.2, 12.8). Does no work.
   */
  async open(): Promise<void> {
    if (this.opened) return;
    checkRegistry(this.dependencies.registry);
    this.opened = true;
    await this.serveNewOrganisations();
  }

  /** One pass of the outbox processor over every Organisation, after serving any the directory newly lists. */
  async dispatchAll(): Promise<void> {
    await this.serveNewOrganisations();
    for (const served of this.served.values()) await this.dispatch(served);
  }

  /** On SIGTERM from a deploy, before the database pools close (Nest's shutdown hooks). */
  async beforeApplicationShutdown(): Promise<void> {
    await this.stop();
  }

  /** Stops the timers and every pg-boss instance, waiting for the jobs running to end. */
  async stop(): Promise<void> {
    this.stopped = true;
    for (const timer of this.timers.splice(0)) clearInterval(timer);
    await this.passing;
    const all = [...this.served.values()];
    this.served.clear();
    await Promise.all(all.map((served) => served.boss.stop({ graceful: true, close: false })));
  }

  /**
   * One delivery step, as the delivery queue's handler runs it: the event to one consumer, as a command under the
   * consumer's service identity keyed by the event (code-house-rules 12.8 "One effect").
   */
  async deliver(organisationCode: string, data: DeliveryData, jobId: string): Promise<StepResult> {
    const served = this.served.get(organisationCode);
    if (served === undefined) throw new CommandDefect(`The worker does not serve ${organisationCode}`);
    const consumer = this.dependencies.registry.consumers.find((each) => each.name === data.consumer);
    const fields = { organisationCode, jobKind: data.consumer, jobId, eventId: data.eventId };
    if (consumer === undefined) {
      return this.defect(fields, new CommandDefect(`No consumer named ${data.consumer} is registered`));
    }
    return this.step(served.organisation, consumer.serviceIdentity, consumer.name, fields, (request) =>
      this.dependencies.helper.run(request, {
        key: data.eventId,
        content: contentOf({ eventId: data.eventId }),
        authoriseReplay: consumer.authoriseReplay,
        work: async (context) => {
          const event = await readEvent(context, data.eventId);
          if (event.type !== consumer.event.type || event.payloadVersion !== consumer.event.version) {
            throw new CommandDefect(
              `Consumer ${consumer.name} reads ${consumer.event.type} at version ${String(consumer.event.version)}, not this event`,
            );
          }
          const payload = consumer.event.payload.safeParse(event.payload);
          if (!payload.success) throw new CommandDefect(`The payload of event ${event.id} does not match its schema`);
          const outcome = await consumer.handle(context, { ...event, payload: payload.data });
          return outcome.kind === 'done' ? success({ eventId: data.eventId }) : refusal(outcome.refusal);
        },
      }),
    );
  }

  /** One step of a job kind, keyed by the job's identity (code-house-rules 12.9 "Each step is a command"). */
  async runJobKind(organisationCode: string, kind: JobKindDefinition, jobId: string): Promise<StepResult> {
    const served = this.served.get(organisationCode);
    if (served === undefined) throw new CommandDefect(`The worker does not serve ${organisationCode}`);
    const fields = { organisationCode, jobKind: kind.name, jobId };
    return this.step(served.organisation, kind.serviceIdentity, kind.name, fields, (request) =>
      this.dependencies.helper.run(request, {
        key: jobId,
        content: contentOf({ jobId }),
        authoriseReplay: kind.authoriseReplay,
        work: async (context) => success(await kind.run(context, { logger: this.dependencies.logger })),
      }),
    );
  }

  private pass(): void {
    if (this.stopped || this.passing !== undefined) return;
    this.passing = this.dispatchAll()
      .catch((error: unknown) => {
        this.log('error', { outcome: 'defect', error: errorName(error) }, 'The outbox pass failed');
      })
      .finally(() => {
        this.passing = undefined;
      });
  }

  private async serveNewOrganisations(): Promise<void> {
    if (this.stopped) return;
    for (const organisation of await this.dependencies.router.listOrganisations()) {
      if (this.served.has(organisation.organisationCode)) continue;
      const boss = await startJobQueue(organisation, this.dependencies.logger, SERVICE);
      try {
        for (const queue of [OUTBOX_DELIVERY_QUEUE, ...this.dependencies.registry.jobKinds.map((kind) => kind.name)]) {
          if ((await boss.getQueue(queue)) === null) {
            throw new CommandDefect(`The queue ${queue} does not exist; queues are created by migration (3.2)`);
          }
        }
        const consumerIds = await this.registerConsumers(organisation);
        if (consumerIds === undefined) {
          await boss.stop({ graceful: false, close: false });
          continue;
        }
        const served: Served = { organisation, boss, consumerIds };
        this.served.set(organisation.organisationCode, served);
        if (this.working) await this.work(served);
      } catch (error) {
        await boss.stop({ graceful: false, close: false });
        throw error;
      }
    }
  }

  /**
   * Records each registered consumer in the Organisation's database, from its first deploy on (12.8 "Consumers"),
   * and refuses a name already recorded for another event type: a renamed consumer is a new consumer. Undefined
   * while the processor's identity is not enabled there; the Organisation is tried again at the next pass.
   */
  private async registerConsumers(organisation: RoutedOrganisation): Promise<Map<string, string> | undefined> {
    const actorId = await this.authenticate(organisation, OUTBOX_PROCESSOR_IDENTITY);
    if (actorId === undefined) {
      this.log(
        'warn',
        { organisationCode: organisation.organisationCode, serviceIdentity: OUTBOX_PROCESSOR_IDENTITY },
        'The outbox processor’s service identity is not enabled; the Organisation is not served yet',
      );
      return undefined;
    }
    const { consumers } = this.dependencies.registry;
    return this.dependencies.runner.run(this.request(organisation, 'kernel.register-consumers', actorId), async (c) => {
      if (consumers.length > 0) {
        await c.tx
          .insert(outboxConsumer)
          .values(consumers.map((consumer) => ({ id: uuidv7(), name: consumer.name, eventType: consumer.event.type })))
          .onConflictDoNothing({ target: outboxConsumer.name });
      }
      const rows = await c.tx.select().from(outboxConsumer);
      const ids = new Map<string, string>();
      for (const consumer of consumers) {
        const row = rows.find((each) => each.name === consumer.name);
        if (row === undefined) throw new CommandDefect(`Consumer ${consumer.name} was not recorded`);
        if (row.eventType !== consumer.event.type) {
          throw new CommandDefect(
            `Consumer ${consumer.name} was registered for ${row.eventType}; a renamed consumer is a new consumer (12.8)`,
          );
        }
        ids.set(consumer.name, row.id);
      }
      return ids;
    });
  }

  private async dispatch(served: Served): Promise<void> {
    const { organisation } = served;
    const actorId = await this.authenticate(organisation, OUTBOX_PROCESSOR_IDENTITY);
    if (actorId === undefined) {
      this.log(
        'warn',
        { organisationCode: organisation.organisationCode, serviceIdentity: OUTBOX_PROCESSOR_IDENTITY },
        'The outbox processor’s service identity is not enabled; nothing is dispatched',
      );
      return;
    }
    for (const consumer of this.dependencies.registry.consumers) {
      const consumerId = served.consumerIds.get(consumer.name);
      if (consumerId === undefined) throw new CommandDefect(`Consumer ${consumer.name} is not recorded`);
      const retry = this.dependencies.settings.consumers[consumer.name];
      if (retry === undefined) throw new CommandDefect(`Consumer ${consumer.name} has no retry setting`);
      for (;;) {
        const pending = await this.dependencies.runner.read(
          this.request(organisation, 'kernel.read-outbox', actorId),
          (context) => pendingEvents(context, consumer, consumerId),
        );
        for (const eventId of pending) {
          await this.dependencies.runner.run(this.request(organisation, 'kernel.dispatch-event', actorId), (context) =>
            dispatchOne(context, served.boss, { eventId, consumer, consumerId, retry }),
          );
        }
        if (pending.length < DISPATCH_BATCH) break;
      }
    }
  }

  private async work(served: Served): Promise<void> {
    const { boss, organisation } = served;
    const pollingIntervalSeconds = this.dependencies.settings.pollSeconds;
    await boss.work<DeliveryData>(
      OUTBOX_DELIVERY_QUEUE,
      { batchSize: 1, perJobResults: true, pollingIntervalSeconds },
      async (jobs): Promise<JobResult[]> =>
        Promise.all(
          jobs.map(async (job) => ({
            id: job.id,
            ...(await this.deliver(organisation.organisationCode, job.data, job.id)),
          })),
        ),
    );
    for (const kind of this.dependencies.registry.jobKinds) {
      const setting = this.dependencies.settings.jobKinds[kind.name];
      if (setting === undefined) throw new CommandDefect(`Job kind ${kind.name} has no setting`);
      await boss.work(
        kind.name,
        { batchSize: 1, perJobResults: true, pollingIntervalSeconds },
        async (jobs): Promise<JobResult[]> =>
          Promise.all(
            jobs.map(async (job) => ({
              id: job.id,
              ...(await this.runJobKind(organisation.organisationCode, kind, job.id)),
            })),
          ),
      );
      const send = (): void => {
        if (this.stopped) return;
        // One job per interval and Organisation however many workers send it (pg-boss's singleton slot).
        boss
          .send(
            kind.name,
            {},
            {
              ...KEEP_EVERY_JOB,
              ...retryOptions(setting),
              singletonKey: kind.name,
              singletonSeconds: setting.everySeconds,
            },
          )
          .catch((error: unknown) => {
            this.log(
              'error',
              { organisationCode: organisation.organisationCode, jobKind: kind.name, error: errorName(error) },
              'The job kind could not be sent',
            );
          });
      };
      send();
      this.timers.push(setInterval(send, setting.everySeconds * 1000));
    }
  }

  /**
   * Runs one step: Authenticate the identity on the authenticate path (code-house-rules 6.3), then the command under
   * it, and turns what happened into the retry rule's result (12.9), logging the step's end with the job's
   * correlation identifier and the event's (12.11).
   */
  private async step(
    organisation: RoutedOrganisation,
    identity: string,
    commandName: string,
    fields: Record<string, string>,
    command: (request: CommandRequest) => Promise<IdempotentAnswer<JsonValue>>,
  ): Promise<StepResult> {
    const correlationId = newCorrelationId();
    const logged = { ...fields, correlationId };
    try {
      const actorId = await this.authenticate(organisation, identity, correlationId);
      if (actorId === undefined) {
        // Nothing can run without its identity; the job fails at once and an operator runs it again (12.9).
        this.log('error', { ...logged, outcome: 'identity-not-enabled', serviceIdentity: identity }, 'Job not run');
        return { status: 'deadletter', output: { outcome: 'identity-not-enabled', serviceIdentity: identity } };
      }
      const answer = await command(this.request(organisation, commandName, actorId, correlationId));
      if (answer.kind === 'success') {
        this.log('info', { ...logged, outcome: 'done', replayed: answer.replayed }, 'Job step ended');
        return { status: 'completed', output: { outcome: 'done', replayed: answer.replayed } };
      }
      this.log('warn', { ...logged, outcome: 'refused', code: answer.refusal.code }, 'Job step refused');
      return { status: 'completed', output: { outcome: 'refused', code: answer.refusal.code } };
    } catch (error) {
      if (retryRuleOf(error) === 'retry') {
        this.log('warn', { ...logged, outcome: 'transient', error: errorName(error) }, 'Job step failed; retried');
        return { status: 'failed', output: { outcome: 'transient', error: errorName(error) } };
      }
      return this.defect(logged, error);
    }
  }

  private defect(fields: Record<string, string>, error: unknown): StepResult {
    this.log('error', { ...fields, outcome: 'defect', error: errorName(error) }, 'Job step failed: a defect');
    return { status: 'deadletter', output: { outcome: 'defect', error: errorName(error) } };
  }

  private async authenticate(
    organisation: RoutedOrganisation,
    code: string,
    correlationId: string = newCorrelationId(),
  ): Promise<string | undefined> {
    return this.dependencies.runner.read(
      {
        commandName: 'kernel.authenticate-job',
        organisation,
        correlationId,
        actor: { kind: 'no-actor', path: 'authenticate' },
      },
      (context) => this.dependencies.identities.authenticate(context, code),
    );
  }

  private request(
    organisation: RoutedOrganisation,
    commandName: string,
    actorId: string,
    correlationId: string = newCorrelationId(),
  ): CommandRequest {
    return { commandName, organisation, correlationId, actor: { kind: 'actor', actorId } };
  }

  private log(level: 'info' | 'warn' | 'error', fields: Record<string, unknown>, message: string): void {
    this.dependencies.logger.structured(level, { service: SERVICE, ...fields }, message, CONTEXT);
  }
}

function contentOf(body: Record<string, string>): RequestContent {
  return { pathParameters: {}, body, secretFields: [], restrictedFields: [] };
}

function success(answer: JsonValue): CommandOutcome<JsonValue> {
  return { kind: 'success', answer, shows: 'nothing' };
}

function refusal(
  refused: Extract<CommandOutcome<JsonValue>, { kind: 'refusal' }>['refusal'],
): CommandOutcome<JsonValue> {
  return { kind: 'refusal', refusal: refused, causedBySecret: false };
}

/** The error's class name only: a message can hold a value, which never reaches the log (code-house-rules 12.11). */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}

function retryOptions(setting: RetrySettings) {
  return {
    retryLimit: setting.retries,
    retryDelay: setting.retryDelaySeconds,
    retryBackoff: setting.retryBackoff,
    expireInSeconds: setting.activeLimitSeconds,
  };
}

/** The events of a consumer's type recorded since it was registered and not yet handed to it, in identifier order. */
async function pendingEvents(
  context: TransactionContext,
  consumer: ConsumerDefinition,
  consumerId: string,
): Promise<string[]> {
  const registered = context.tx
    .select({ recordedAt: outboxConsumer.recordedAt })
    .from(outboxConsumer)
    .where(eq(outboxConsumer.id, consumerId));
  const rows = await context.tx
    .select({ id: outboxEvent.id })
    .from(outboxEvent)
    .where(
      and(
        eq(outboxEvent.eventType, consumer.event.type),
        gte(outboxEvent.recordedAt, sql`(${registered})`),
        notExists(
          context.tx
            .select({ one: sql`1` })
            .from(outboxDispatch)
            .where(
              and(eq(outboxDispatch.outboxEventId, outboxEvent.id), eq(outboxDispatch.outboxConsumerId, consumerId)),
            ),
        ),
      ),
    )
    .orderBy(asc(outboxEvent.id))
    .limit(DISPATCH_BATCH);
  return rows.map((row) => row.id);
}

/**
 * Hands one event to one consumer: the dispatch row and the delivery job in one transaction (12.8 "Dispatch"). A
 * second worker handing the same pair waits at the unique pair and then finds it taken, and makes no job.
 */
async function dispatchOne(
  context: TransactionContext,
  boss: PgBoss,
  item: { eventId: string; consumer: ConsumerDefinition; consumerId: string; retry: RetrySettings },
): Promise<void> {
  const jobId = uuidv7();
  const inserted = await context.tx
    .insert(outboxDispatch)
    .values({ id: uuidv7(), outboxEventId: item.eventId, outboxConsumerId: item.consumerId, jobId })
    .onConflictDoNothing({ target: [outboxDispatch.outboxConsumerId, outboxDispatch.outboxEventId] })
    .returning({ id: outboxDispatch.id });
  if (inserted.length === 0) return;
  const data: DeliveryData = { eventId: item.eventId, consumer: item.consumer.name };
  const sent = await boss.send(
    OUTBOX_DELIVERY_QUEUE,
    { ...data },
    {
      id: jobId,
      ...KEEP_EVERY_JOB,
      ...retryOptions(item.retry),
      db: fromDrizzle(context.tx, sql),
    },
  );
  if (sent !== jobId) throw new CommandDefect('The delivery job was not created with its dispatch row');
}

/** Reads one event from the outbox in the consumer's transaction. */
async function readEvent(
  context: TransactionContext,
  eventId: string,
): Promise<DeliveredEvent<Record<string, unknown>>> {
  const rows = await context.tx.select().from(outboxEvent).where(eq(outboxEvent.id, eventId));
  const row = rows[0];
  if (row === undefined) throw new CommandDefect('The event of a delivery job is not in the outbox');
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
    payloadVersion: row.payloadVersion,
    eventTime: row.eventTime,
    actorId: row.actorId,
    onBehalfOfUserId: row.onBehalfOfUserId,
    correlationId: row.correlationId,
    subject: {
      module: row.subjectModule,
      recordType: row.subjectRecordType,
      recordId: row.subjectRecordId,
      ...(row.subjectVersionId === null ? {} : { versionId: row.subjectVersionId }),
    },
    scope,
    payload: row.payload as Record<string, unknown>,
  };
}

import type { StructuredLogger } from '../logging/pino-logger.service.js';
import { CommandDefect } from '../command-runner/command-errors.js';
import type { TransactionContext } from '../command-runner/transaction-context.js';
import type { JsonValue } from '../idempotency/canonical-form.js';
import type { CommandRefusal } from '../idempotency/contracts.js';
import type { JobAuthority } from './contracts.js';
import type { EventDefinition, EventScopeFacts, EventSubject } from '../outbox/event-definition.js';

/** A consumer or job kind is named `<unit>.<name>` in lower case, stable and unique in the application (12.8). */
const NAME = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

/** An event as a consumer receives it: what the outbox row holds (code-house-rules 12.8 "The row"). */
export interface DeliveredEvent<Payload extends Record<string, unknown>> {
  readonly id: string;
  readonly type: string;
  readonly payloadVersion: number;
  readonly eventTime: Date;
  readonly actorId: string | null;
  readonly onBehalfOfUserId: string | null;
  readonly correlationId: string;
  readonly subject: EventSubject;
  readonly scope: EventScopeFacts;
  readonly payload: Payload;
}

/**
 * What a consumer's step decides. `done`: its effect is written in the context's transaction. `refused`: a refusal
 * under the locks, such as a version that changed or a state that no longer allows it; it is kept under the event's
 * key and never retried (code-house-rules 12.9).
 */
export type ConsumerOutcome =
  { readonly kind: 'done' } | { readonly kind: 'refused'; readonly refusal: CommandRefusal };

/**
 * A consumer of one event type (code-house-rules 12.8 "Consumers"), registered in its unit's `jobs/` folder. It runs
 * as a command under its own internal service identity (access-and-approvals 2.3; PRD-SEC-018), keyed by the event's
 * identity and its name, so a second delivery has no second effect (PRD-INT-008). An event carries identifiers only:
 * the handler reads the record's current version through its owner's interface (PRD-SEC-005).
 */
export interface ConsumerDefinition<Payload extends Record<string, unknown> = Record<string, unknown>> {
  readonly name: string;
  /** The event type and the one payload version it reads. */
  readonly event: EventDefinition<Payload>;
  /** The code of the internal service identity it runs as. */
  readonly serviceIdentity: string;
  /** The action its steps need, authorised in each step and again before a redelivery is answered (RR-273; CH-14). */
  readonly authorises: JobAuthority;
  readonly handle: (context: TransactionContext, event: DeliveredEvent<Payload>) => Promise<ConsumerOutcome>;
}

/** What a job kind's step has to hand besides its transaction. */
export interface JobStepTools {
  /** The worker's logger, for an alert such as `audit-partitions-short`. Identifiers and codes only. */
  readonly logger: StructuredLogger;
}

/**
 * A job kind the worker sends for each Organisation at the interval of its worker setting, such as the audit sealing
 * job (code-house-rules 12.9 "A job kind"). Its one step is a command keyed by the job's identity (12.4), run under
 * its internal service identity (PRD-SEC-018); it returns the answer kept under the key, identifiers only.
 */
export interface JobKindDefinition {
  /** Its name, which is also its pg-boss queue, created by migration (code-house-rules 3.2). */
  readonly name: string;
  readonly serviceIdentity: string;
  readonly authorises: JobAuthority;
  readonly run: (context: TransactionContext, tools: JobStepTools) => Promise<JsonValue>;
}

/** Everything the worker runs: the event types the application declares, their consumers and the job kinds. */
export interface JobRegistry {
  readonly events: readonly EventDefinition[];
  readonly consumers: readonly ConsumerDefinition[];
  readonly jobKinds: readonly JobKindDefinition[];
}

function checkName(name: string, what: string): void {
  if (!NAME.test(name)) throw new CommandDefect(`A ${what} is named <unit>.<name> in lower case, not ${name}`);
}

function checkIdentityCode(code: string, name: string): void {
  if (code.trim() === '') throw new CommandDefect(`${name} names no service identity to run as (PRD-SEC-018)`);
}

/** Declares a consumer. */
export function defineConsumer<Payload extends Record<string, unknown>>(
  definition: ConsumerDefinition<Payload>,
): ConsumerDefinition {
  checkName(definition.name, 'consumer');
  checkIdentityCode(definition.serviceIdentity, definition.name);
  return Object.freeze({ ...definition }) as unknown as ConsumerDefinition;
}

/** Declares a job kind. */
export function defineJobKind(definition: JobKindDefinition): JobKindDefinition {
  checkName(definition.name, 'job kind');
  checkIdentityCode(definition.serviceIdentity, definition.name);
  return Object.freeze({ ...definition });
}

/**
 * Refuses a registry the worker must not start with (code-house-rules 12.8 "Consumers"): two consumers or job kinds
 * of one name, or a consumer of an event type, or a payload version, that no unit declares.
 */
export function checkRegistry(registry: JobRegistry): void {
  const names = new Set<string>();
  for (const name of [...registry.consumers.map((c) => c.name), ...registry.jobKinds.map((k) => k.name)]) {
    if (names.has(name)) throw new CommandDefect(`Two consumers or job kinds are named ${name}`);
    names.add(name);
  }
  const declared = new Set(registry.events.map((event) => `${event.type}@${String(event.version)}`));
  for (const consumer of registry.consumers) {
    const key = `${consumer.event.type}@${String(consumer.event.version)}`;
    if (!declared.has(key)) {
      throw new CommandDefect(
        `Consumer ${consumer.name} reads ${consumer.event.type} at version ${String(consumer.event.version)}, which no unit declares`,
      );
    }
  }
}

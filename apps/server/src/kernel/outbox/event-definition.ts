import type { z } from 'zod';
import { CommandDefect } from '../command-runner/command-errors.js';

/** An event type is named `module.fact`, in lower case and the past tense (module-map section 8). */
export const EVENT_TYPE_NAME = /^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/;

/**
 * One event type and the schema of its payload at one version (code-house-rules 12.8 "The row", 12.2; module-map
 * section 8). The publishing unit states it; its payload holds identifiers and versions only, never an amount, a
 * name, a restricted value or a secret (access-and-approvals 6; PRD-SEC-006). A consumer names the definitions it
 * reads, so the worker can refuse a consumer of an unknown type.
 */
export interface EventDefinition<Payload extends Record<string, unknown> = Record<string, unknown>> {
  readonly type: string;
  readonly version: number;
  readonly payload: z.ZodType<Payload>;
}

/** Declares an event type. Refuses a name that is not `module.fact` or a version that is not a positive integer. */
export function defineEvent<Payload extends Record<string, unknown>>(
  definition: EventDefinition<Payload>,
): EventDefinition<Payload> {
  if (!EVENT_TYPE_NAME.test(definition.type)) {
    throw new CommandDefect(`An event type is named module.fact in lower case, not ${definition.type}`);
  }
  if (!Number.isInteger(definition.version) || definition.version < 1) {
    throw new CommandDefect(`Event type ${definition.type} needs a payload version that is a positive integer`);
  }
  return Object.freeze({ ...definition });
}

/** The record an event is about (code-house-rules 12.8): its module, record type, record and version. */
export interface EventSubject {
  readonly module: string;
  readonly recordType: string;
  readonly recordId: string;
  readonly versionId?: string;
}

/**
 * The subject's scope facts, as identifiers (code-house-rules 6.1, 12.12), for the live-update filter. A fact the
 * record type does not declare is left out.
 */
export interface EventScopeFacts {
  readonly siteId?: string;
  readonly storeId?: string;
  readonly businessUnitId?: string;
  readonly legalEntityId?: string;
  readonly brandId?: string;
  /** For a `self` record, the user it belongs to (code-house-rules 6.1). */
  readonly subjectUserId?: string;
}

/** A row's scope facts, each held as an identifier or null; null is Unknown (PRD-MOD-015). */
export type ScopeFactColumns = { readonly [Fact in keyof EventScopeFacts]?: string | null | undefined };

/**
 * The scope facts a row holds, as an event, an audit record or an attachment carries them: a null or missing fact is
 * left out, never passed on as a fact (code-house-rules 12.8 "The row"; PRD-MOD-015). The one builder the modules
 * share (S1-F08 review).
 */
export function scopeFactsOf(row: ScopeFactColumns): EventScopeFacts {
  const facts: Record<string, string> = {};
  for (const fact of ['siteId', 'storeId', 'businessUnitId', 'legalEntityId', 'brandId', 'subjectUserId'] as const) {
    const value = row[fact];
    if (value !== null && value !== undefined) facts[fact] = value;
  }
  return facts;
}

/** What a command gives to publish one event; the actor and correlation identifier come from its context. */
export interface PublishedEvent<Payload extends Record<string, unknown>> {
  readonly subject: EventSubject;
  readonly scope?: EventScopeFacts;
  readonly payload: Payload;
  /** The person on whose behalf a job acts (access-and-approvals 2.3, 9.8). */
  readonly onBehalfOfUserId?: string;
  /** When it happened, if not when the command started (code-house-rules 9). */
  readonly eventTime?: Date;
}

import type { IncomingMessage, ServerResponse } from 'node:http';
import { uuidv7 } from '@apparel-os/domain';

/** The response header that carries the request's correlation identifier (code-house-rules 12.11). */
export const CORRELATION_ID_HEADER = 'X-Correlation-Id';

const UUIDV7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** A new correlation identifier: a UUIDv7 the server makes (code-house-rules 12.11; PRD-MOD-008). */
export function newCorrelationId(): string {
  return uuidv7();
}

/** Whether a value has the form of a correlation identifier the server made. */
export function isCorrelationId(value: string): boolean {
  return UUIDV7.test(value);
}

const correlationIds = new WeakMap<object, string>();

/**
 * Gives every request one correlation identifier when it arrives (code-house-rules 12.11): a UUIDv7 the server makes,
 * never one taken from the client, sent back in the `X-Correlation-Id` header. Handlers read it with
 * correlationIdOf and pass it to the command runner, which keeps it in the command's context; the error envelope,
 * audit records, outbox events and log lines carry it as their tasks add them (`S1-F01-T05` to `T07`).
 */
export function correlationIdMiddleware(request: IncomingMessage, response: ServerResponse, next: () => void): void {
  const correlationId = newCorrelationId();
  correlationIds.set(request, correlationId);
  response.setHeader(CORRELATION_ID_HEADER, correlationId);
  next();
}

/** The correlation identifier the middleware gave a request; undefined for a request it did not see. */
export function correlationIdOf(request: object): string | undefined {
  return correlationIds.get(request);
}

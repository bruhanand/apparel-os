import { IDEMPOTENT_REPLAYED_HEADER, statusOfKind } from '@apparel-os/schemas';
import { Catch, HttpException, Inject, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import {
  CommandCancelled,
  CommandOutcomeUnknown,
  CommandTimedOut,
  sqlStateOf,
} from '../command-runner/command-errors.js';
import { correlationIdOf, newCorrelationId } from '../command-runner/correlation.js';
import { IdempotencyConflict } from '../idempotency/idempotency-errors.js';
import { LOGGER } from '../logging/logging.module.js';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import { ApiRefusal, type RefusalBody } from './api-refusal.js';
import type { HttpRequest, HttpResponse } from './http-types.js';

const CONTEXT = 'ErrorEnvelope';

/** The key under which the filter leaves the answer's code for the request log line (code-house-rules 12.11). */
export const ERROR_CODE_LOCAL = 'aosErrorCode';

/**
 * Answers every error in the one envelope of code-house-rules 12.3, with the status of its kind and the request's
 * correlation identifier as its reference. An error it does not know is `failed` with `kernel.failed`: nothing is
 * said of its cause, and the log keeps only its name and SQLSTATE, never its message, a value or a body
 * (12.11; PRD-SEC-006, PRD-SEC-014).
 */
@Catch()
export class ErrorEnvelopeFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: StructuredLogger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<HttpRequest>();
    const response = host.switchToHttp().getResponse<HttpResponse>();
    const reference = correlationIdOf(request) ?? newCorrelationId();
    const body = this.bodyOf(exception, reference);
    const { replayed, ...rest } = body;
    response.locals[ERROR_CODE_LOCAL] = body.code;
    if (replayed === true) response.setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
    response.status(statusOfKind(body.kind)).json({ error: { ...rest, reference } });
  }

  private bodyOf(exception: unknown, reference: string): RefusalBody {
    if (exception instanceof ApiRefusal) return exception.body;
    if (exception instanceof IdempotencyConflict) return { kind: 'conflict', code: exception.code };
    if (exception instanceof CommandTimedOut) return { kind: 'timed-out', code: 'kernel.timed-out' };
    if (exception instanceof CommandOutcomeUnknown) return { kind: 'failed', code: 'kernel.outcome-unknown' };
    if (exception instanceof CommandCancelled) return { kind: 'failed', code: 'kernel.failed' };
    if (exception instanceof HttpException && exception.getStatus() === 404) {
      return { kind: 'not-found', code: 'kernel.not-found' };
    }
    if (isBodyParserError(exception)) return { kind: 'invalid', code: 'kernel.invalid-request' };
    this.logger.structured(
      'error',
      {
        correlationId: reference,
        errorName: exception instanceof Error ? exception.name : typeof exception,
        sqlState: sqlStateOf(exception),
      },
      'The request failed unexpectedly; nothing of the cause was answered',
      CONTEXT,
    );
    return { kind: 'failed', code: 'kernel.failed' };
  }
}

/** A body the JSON parser refused: not JSON, or beyond its size limit. Its message is never answered or logged. */
function isBodyParserError(exception: unknown): boolean {
  if (exception instanceof HttpException) {
    const status = exception.getStatus();
    return status === 400 || status === 413;
  }
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'type' in exception &&
    typeof exception.type === 'string' &&
    exception.type.startsWith('entity.')
  );
}

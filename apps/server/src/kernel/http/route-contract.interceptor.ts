import {
  IDEMPOTENCY_KEY_HEADER,
  IDEMPOTENT_REPLAYED_HEADER,
  needsIdempotencyKey,
  type Issue,
  type Route,
} from '@apparel-os/schemas';
import { Inject, Injectable, type CallHandler, type ExecutionContext, type NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { map, type Observable } from 'rxjs';
import { z } from 'zod';
import { CommandDefect } from '../command-runner/command-errors.js';
import { correlationIdOf } from '../command-runner/correlation.js';
import { LOGGER } from '../logging/logging.module.js';
import type { StructuredLogger } from '../logging/pino-logger.service.js';
import { ApiRefusal } from './api-refusal.js';
import type { HttpRequest, HttpResponse } from './http-types.js';
import { keepRouteInput, ROUTE_METADATA, RouteAnswer, type RouteInputOf } from './api-route.js';

const NO_FIELDS = z.strictObject({});
const UUID = z.uuid();
const CONTEXT = 'RouteContract';

/**
 * The API conventions around every route (code-house-rules 12.2, 12.4):
 *
 * - **Every input parsed.** The path parameters, the query and a command's body are parsed with the route's strict
 *   schemas before the handler runs; nothing unparsed reaches a command. A failure is `invalid` with
 *   `kernel.invalid-request`, giving the paths and issue codes only, never the input (12.3; PRD-SEC-006).
 * - **The key.** A command that needs one carries `Idempotency-Key`, a UUID, or is `invalid` with
 *   `kernel.idempotency-key-required` (12.4; PRD-INT-002).
 * - **Every answer checked.** The success answer is encoded through the route's schema. One that does not match is a
 *   defect: the request fails, and the log names the route and the paths in the schema, never the values (12.11). So
 *   a field the schema does not name is never sent (PRD-SEC-006). A replayed answer carries `Idempotent-Replayed`.
 */
@Injectable()
export class RouteContractInterceptor implements NestInterceptor {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(LOGGER) private readonly logger: StructuredLogger,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const route = this.reflector.get<Route | undefined>(ROUTE_METADATA, context.getHandler());
    if (route === undefined) {
      // The route declaration check stops the application at start before this can happen.
      throw new CommandDefect('A route without its declaration in the route table was called (code-house-rules 12.1)');
    }
    const request = context.switchToHttp().getRequest<HttpRequest>();
    const response = context.switchToHttp().getResponse<HttpResponse>();
    keepRouteInput(request, parseInput(route, request));
    // A stream's handler encodes each message through the route's schema as it writes it (12.12).
    if (!route.command && route.stream === 'event-stream') return next.handle();
    return next.handle().pipe(
      map((value: unknown) => {
        const answer = value instanceof RouteAnswer ? value : new RouteAnswer(value, false);
        const encoded = this.encode(route, answer.data, request);
        if (answer.replayed) response.setHeader(IDEMPOTENT_REPLAYED_HEADER, 'true');
        return encoded;
      }),
    );
  }

  private encode(route: Route, data: unknown, request: HttpRequest): unknown {
    try {
      return z.encode(route.response, data);
    } catch (error) {
      if (!(error instanceof z.ZodError)) throw error;
      this.logger.structured(
        'error',
        { correlationId: correlationIdOf(request), route: route.path, issues: issuesOf(error, []) },
        'The answer did not match its route schema, a defect; nothing of it was sent',
        CONTEXT,
      );
      throw new CommandDefect(`The answer of ${route.path} did not match its schema`);
    }
  }
}

function parseInput(route: Route, request: HttpRequest): RouteInputOf<Route> {
  let idempotencyKey: string | undefined;
  if (needsIdempotencyKey(route)) {
    const header = request.headers[IDEMPOTENCY_KEY_HEADER.toLowerCase()];
    if (typeof header !== 'string' || !UUID.safeParse(header).success) {
      throw new ApiRefusal({ kind: 'invalid', code: 'kernel.idempotency-key-required' });
    }
    idempotencyKey = header.toLowerCase();
  }
  const rawParams = { ...request.params };
  const issues: Issue[] = [];
  const parse = (section: string, schema: z.ZodType, value: unknown): unknown => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    issues.push(...issuesOf(result.error, [section]));
    return undefined;
  };
  const params = parse('params', route.params ?? NO_FIELDS, rawParams);
  const query = parse('query', route.query ?? NO_FIELDS, { ...request.query });
  const body = route.command ? parse('body', route.body, request.body) : undefined;
  if (issues.length > 0) throw new ApiRefusal({ kind: 'invalid', code: 'kernel.invalid-request', issues });
  return { params, query, body, idempotencyKey, rawParams } as RouteInputOf<Route>;
}

/** The paths and codes of a Zod error, never its input or message (code-house-rules 12.3). */
function issuesOf(error: z.ZodError, prefix: readonly string[]): Issue[] {
  return error.issues.map((issue) => ({
    path: [...prefix, ...issue.path.map((part) => (typeof part === 'symbol' ? String(part) : part))],
    code: issue.code,
  }));
}

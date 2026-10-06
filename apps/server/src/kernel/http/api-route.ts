import type { CommandRoute, Route } from '@apparel-os/schemas';
import { applyDecorators, createParamDecorator, Get, HttpCode, Post, SetMetadata } from '@nestjs/common';
import type { z } from 'zod';
import type { JsonValue, RequestContent } from '../idempotency/canonical-form.js';
import type { IdempotentAnswer } from '../idempotency/idempotency-helper.js';
import { ApiRefusal } from './api-refusal.js';

/** The metadata key under which ApiRoute keeps a handler's route. */
export const ROUTE_METADATA = 'kernel.api-route';

/**
 * Serves a route of the route table from a controller method (code-house-rules 12.1, 12.2): its method and path, the
 * status 200 for a success, and the route itself, from which the API conventions parse the input, require the
 * idempotency key and encode the answer. The controller is declared `@Controller()` with no path of its own, so the
 * route table alone says where a route is. A method with no ApiRoute stops the application at start.
 */
export function ApiRoute(route: Route): MethodDecorator {
  const path = route.path.replace(/^\/api/, '').replace(/\{([a-zA-Z0-9]+)\}/g, ':$1');
  return applyDecorators(
    route.method === 'GET' ? Get(path) : Post(path),
    HttpCode(200),
    SetMetadata(ROUTE_METADATA, route),
  );
}

type Parsed<S> = S extends z.ZodType ? z.output<S> : Record<string, never>;

/** The input of a route as its schemas parsed it (code-house-rules 12.2 "Every input parsed"). */
export interface RouteInputOf<R extends Route> {
  readonly params: Parsed<R['params']>;
  readonly query: Parsed<R['query']>;
  readonly body: R extends { command: true; body: infer B } ? Parsed<B> : undefined;
  /** The `Idempotency-Key`, for a command that needs one (code-house-rules 12.4). */
  readonly idempotencyKey: R extends { command: true; access: { kind: 'own' | 'action' | 'decision' } }
    ? string
    : undefined;
  /** The path parameters as sent, which the idempotency hash covers. */
  readonly rawParams: Readonly<Record<string, string>>;
}

const inputs = new WeakMap<object, RouteInputOf<Route>>();

/** Keeps a request's parsed input for its handler. Used by the API conventions only. */
export function keepRouteInput(request: object, input: RouteInputOf<Route>): void {
  inputs.set(request, input);
}

/** The parsed input of the route a handler serves. */
export const RouteInput = createParamDecorator((_data: unknown, context): unknown =>
  inputs.get(context.switchToHttp().getRequest<object>()),
);

/** A success answer, and whether it is the one kept under the idempotency key (code-house-rules 12.4). */
export class RouteAnswer {
  constructor(
    readonly data: unknown,
    readonly replayed: boolean,
  ) {}
}

/** A success answer of a handler. A handler that returns a plain value answers it, not replayed. */
export function routeAnswer(data: unknown, options: { readonly replayed: boolean }): RouteAnswer {
  return new RouteAnswer(data, options.replayed);
}

/**
 * The answer of a command run under the idempotency helper: a success, or a refusal in the envelope, either marked
 * `Idempotent-Replayed: true` when it is the one kept under the key (code-house-rules 12.3, 12.4).
 */
export function commandAnswer<Answer extends JsonValue>(answer: IdempotentAnswer<Answer>): RouteAnswer {
  if (answer.kind === 'success') return routeAnswer(answer.answer, { replayed: answer.replayed });
  throw new ApiRefusal({ ...answer.refusal, replayed: answer.replayed });
}

/** What the idempotency helper hashes of a command's request, from its route and parsed input (12.4, 12.5). */
export function requestContentOf(route: CommandRoute, input: RouteInputOf<CommandRoute>): RequestContent {
  return {
    pathParameters: input.rawParams,
    body: input.body,
    secretFields: route.secretFields,
    restrictedFields: route.restrictedFields,
  };
}

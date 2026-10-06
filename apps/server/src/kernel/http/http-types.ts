import type { IncomingMessage, ServerResponse } from 'node:http';

// The parts of Express's request and response the API conventions use, typed here so no type package is added
// (code-house-rules 10.6). Nest serves the API through Express (@nestjs/platform-express).

export interface HttpRequest extends IncomingMessage {
  readonly params: Readonly<Record<string, string>>;
  readonly query: Readonly<Record<string, unknown>>;
  readonly body: unknown;
  /** The matched route, once Express has routed the request; its path is the route template. */
  readonly route?: { readonly path: string };
}

export interface HttpResponse extends ServerResponse {
  readonly locals: Record<string, unknown>;
  status(code: number): HttpResponse;
  json(body: unknown): HttpResponse;
}

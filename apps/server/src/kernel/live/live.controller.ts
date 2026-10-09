import { routes } from '@apparel-os/schemas';
import { Controller, Inject, Req, Res } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { z } from 'zod';
import { ApiRoute } from '../http/api-route.js';
import type { HttpRequest, HttpResponse } from '../http/http-types.js';
import { SESSION_ACCESS, type SessionAccess } from './contracts.js';
import { LIVE_UPDATES } from './live.module-tokens.js';
import type { LiveUpdates, SseMessage, StreamSink } from './live-updates.js';

const UUID = z.uuid();
/** An identifier the outbox never holds: what a malformed `Last-Event-ID` is taken as, so it gets `resync`. */
const NEVER_HELD = '00000000-0000-0000-0000-000000000000';

/**
 * `GET /api/kernel/live` (code-house-rules 12.12; deployment.md section 5; S1-F08-T04): one stream per session,
 * authenticated by the session cookie like any request, without counting as its activity. Each message's data is
 * encoded through the route's schema, so nothing it does not name is sent (PRD-SEC-006).
 */
@Controller()
export class LiveController {
  constructor(
    @Inject(LIVE_UPDATES) private readonly live: LiveUpdates,
    @Inject(ModuleRef) private readonly moduleRef: ModuleRef,
  ) {}

  @ApiRoute(routes.openLiveUpdates)
  async open(@Req() request: HttpRequest, @Res() response: HttpResponse): Promise<void> {
    const access = this.moduleRef.get<SessionAccess>(SESSION_ACCESS, { strict: false });
    const session = access.signedInOf(request);
    const header = request.headers['last-event-id'];
    const lastEventId =
      typeof header === 'string' ? (UUID.safeParse(header).success ? header.toLowerCase() : NEVER_HELD) : undefined;
    response.status(200);
    response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    response.setHeader('Connection', 'keep-alive');
    // No proxy holds the stream back (Railway's edge passes it through).
    response.setHeader('X-Accel-Buffering', 'no');
    response.flushHeaders();
    let open = true;
    const sink: StreamSink = {
      send: (message: SseMessage) => {
        if (!open) return;
        const data = JSON.stringify(z.encode(routes.openLiveUpdates.response, message.data));
        response.write(
          `${message.id === undefined ? '' : `id: ${message.id}\n`}event: ${message.event}\ndata: ${data}\n\n`,
        );
      },
      comment: (text: string) => {
        if (open) response.write(`: ${text}\n\n`);
      },
      retry: (ms: number) => {
        if (open) response.write(`retry: ${String(ms)}\n\n`);
      },
      end: () => {
        if (!open) return;
        open = false;
        response.end();
      },
    };
    let gone = false;
    const isGone = (): boolean => gone;
    // The response's close, not the request's: a request closes once its (empty) body is read.
    response.on('close', () => {
      gone = true;
      this.live.endSink(sink);
      open = false;
    });
    await this.live.open(session, access, sink, lastEventId);
    // The client may have gone while the stream opened.
    if (isGone()) this.live.endSink(sink);
  }
}

import { liveMessageSchema, type LiveMessage } from '@apparel-os/schemas';

// S1-F08-T04: a reader of the live-update stream (code-house-rules 12.12), as a browser's EventSource would read it,
// for the tests that open one. Every value it sees is SYNTHETIC.

/** One SSE message as read: its `id` and `event` lines and its data parsed through the route's schema. */
export interface ReadMessage {
  readonly id: string | undefined;
  readonly event: string | undefined;
  readonly data: LiveMessage;
}

export interface OpenStream {
  readonly status: number;
  /** The messages read so far, in order. */
  readonly messages: ReadMessage[];
  /** Everything read, as text: what a test searches for a value that must never appear. */
  text(): string;
  /** Resolves when the server ends the stream. */
  readonly ended: Promise<void>;
  /** Waits until a message passes the check, or fails after `timeoutMs`. */
  waitFor(check: (message: ReadMessage) => boolean, timeoutMs?: number): Promise<ReadMessage>;
  close(): void;
}

/** Opens `GET /api/kernel/live` with the session cookie, and `Last-Event-ID` when given. */
export async function openLiveStream(
  baseUrl: string,
  cookie: string,
  lastEventId?: string,
): Promise<OpenStream & { readonly body: unknown }> {
  const controller = new AbortController();
  const headers: Record<string, string> = { cookie, accept: 'text/event-stream' };
  if (lastEventId !== undefined) headers['last-event-id'] = lastEventId;
  const response = await fetch(`${baseUrl}/api/kernel/live`, { headers, signal: controller.signal });
  const messages: ReadMessage[] = [];
  let raw = '';
  if (!response.ok || response.body === null) {
    const body: unknown = await response.json();
    return {
      status: response.status,
      body,
      messages,
      text: () => raw,
      ended: Promise.resolve(),
      waitFor: () => Promise.reject(new Error('The stream did not open')),
      close: () => undefined,
    };
  }
  const reader = (response.body as ReadableStream<Uint8Array>).getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  const ended = (async () => {
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return;
        const chunk = decoder.decode(value, { stream: true });
        raw += chunk;
        buffer += chunk;
        let at = buffer.indexOf('\n\n');
        while (at >= 0) {
          const frame = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          const parsed = parseFrame(frame);
          if (parsed !== undefined) messages.push(parsed);
          at = buffer.indexOf('\n\n');
        }
      }
    } catch {
      // Closed by the test.
    }
  })();
  return {
    status: response.status,
    body: undefined,
    messages,
    text: () => raw,
    ended,
    async waitFor(check, timeoutMs = 15_000) {
      const until = Date.now() + timeoutMs;
      for (;;) {
        const found = messages.find(check);
        if (found !== undefined) return found;
        if (Date.now() > until) throw new Error(`No such message; read: ${JSON.stringify(messages)}`);
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    close: () => {
      controller.abort();
    },
  };
}

function parseFrame(frame: string): ReadMessage | undefined {
  let id: string | undefined;
  let event: string | undefined;
  const data: string[] = [];
  for (const line of frame.split('\n')) {
    if (line.startsWith(':') || line === '') continue;
    const colon = line.indexOf(':');
    const field = colon < 0 ? line : line.slice(0, colon);
    const value = colon < 0 ? '' : line.slice(colon + 1).replace(/^ /, '');
    if (field === 'id') id = value;
    else if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }
  if (data.length === 0) return undefined;
  return { id, event, data: liveMessageSchema.parse(JSON.parse(data.join('\n'))) };
}

import { LIVE_RESYNC, liveMessageSchema, routes, type LiveMessage } from '@apparel-os/schemas';

// Which cached reads a live update makes stale (code-house-rules 12.12; module-map 4.1): the message names a record
// by its identity only, so the browser reads it again through the owning routes, under the reader's own
// authorisation. A resync makes every read stale (deployment.md section 5).

/** The path of the live-update stream, from the route table. */
export const LIVE_PATH = routes.openLiveUpdates.path;

/** The event types the screens built so far follow, and the resync. Another type changes nothing on screen yet. */
export const FOLLOWED_TYPES = [
  'inbox.work-item-changed',
  'exceptions.raised',
  'exceptions.assigned',
  'exceptions.resolved',
  'exceptions.reopened',
  'kernel.job-failed',
  LIVE_RESYNC,
] as const;

/** What to read again: every read, or the reads of these routes, each with or without one record's identity. */
export type Stale =
  | { readonly kind: 'everything' }
  | { readonly kind: 'reads'; readonly reads: readonly { readonly route: string; readonly recordId?: string }[] };

/** The reads a message makes stale. */
export function staleReads(message: LiveMessage): Stale {
  if (message.kind === 'resync') return { kind: 'everything' };
  const { recordType, recordId } = message.subject;
  switch (recordType) {
    case 'inbox.work_item':
      return { kind: 'reads', reads: [{ route: 'listMyWork' }] };
    case 'exceptions.exception':
      return {
        kind: 'reads',
        reads: [{ route: 'readException', recordId }, { route: 'listMyWork' }, { route: 'listOpenExceptions' }],
      };
    case 'kernel.job':
      return { kind: 'reads', reads: [{ route: 'listFailedJobs' }] };
    default:
      return { kind: 'reads', reads: [] };
  }
}

/** What the stream needs of an EventSource. */
export interface LiveSource {
  readonly readyState: number;
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
}

/** EventSource's CLOSED state: the browser will not reconnect by itself. */
const CLOSED = 2;

/**
 * Follows one stream (code-house-rules 12.12 "As built"; deployment.md section 5). Every open, the first and each
 * reconnect, makes every read stale: the server answers only once it knows where the stream starts, so whatever
 * committed before then is in these reads, and nothing between a stream's end and the next is lost, with or without
 * `Last-Event-ID`. Each message makes its record's reads stale. A stream closed for good, as when the session ended
 * or locked, makes My work stale, whose read tells the shell which.
 */
export function followStream(source: LiveSource, markStale: (stale: Stale) => void): void {
  source.addEventListener('open', () => {
    markStale({ kind: 'everything' });
  });
  const onMessage = (event: MessageEvent<string>) => {
    const message = parseMessage(event.data);
    if (message !== null) markStale(staleReads(message));
  };
  for (const type of FOLLOWED_TYPES) source.addEventListener(type, onMessage);
  source.addEventListener('error', () => {
    if (source.readyState === CLOSED) markStale({ kind: 'reads', reads: [{ route: 'listMyWork' }] });
  });
}

/** A message's data as the stream sent it, or null for one the schema refuses. */
export function parseMessage(data: string): LiveMessage | null {
  try {
    const parsed = liveMessageSchema.safeParse(JSON.parse(data));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Whether a cached read's key (`[route, input]`) is one a stale read names: the route, and where the stale read names
 * a record, a read whose path parameters name that record.
 */
export function keyIsStale(stale: Stale, key: readonly unknown[]): boolean {
  if (stale.kind === 'everything') return true;
  const [route, input] = key;
  return stale.reads.some(
    (read) => read.route === route && (read.recordId === undefined || pathParametersOf(input).includes(read.recordId)),
  );
}

/** The values of a read input's path parameters, or none. */
function pathParametersOf(input: unknown): readonly unknown[] {
  if (typeof input !== 'object' || input === null || !('params' in input)) return [];
  const { params } = input;
  return typeof params === 'object' && params !== null ? Object.values(params) : [];
}

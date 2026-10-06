import { z } from 'zod';
import type { JobRegistry } from './registry.js';

/** The variable the worker reads its settings from at start, as JSON (code-house-rules 12.9, 12.14). */
export const WORKER_SETTINGS_VARIABLE = 'AOS_WORKER_SETTINGS';

/**
 * The retry setting of one consumer or job kind (code-house-rules 12.9 "The retry rule"; CH-10): how many times a
 * transient failure is retried after the first attempt, the delay before the first retry, whether the delays grow
 * (pg-boss's exponential backoff from that delay), and how long one attempt may stay active before pg-boss counts it
 * failed, as when the worker stopped under it.
 */
const retrySchema = z.strictObject({
  retries: z.int().min(0),
  retryDelaySeconds: z.int().min(0),
  retryBackoff: z.boolean(),
  activeLimitSeconds: z.int().min(1),
});

const settingsSchema = z.strictObject({
  /** How often the worker reads the directory and each Organisation's outbox, and polls each queue (pg-boss >= 0.5). */
  pollSeconds: z.number().min(0.5),
  consumers: z.record(z.string(), retrySchema),
  /** Each job kind's retry setting and how often it is sent for each Organisation. */
  jobKinds: z.record(z.string(), retrySchema.extend({ everySeconds: z.int().min(1) })),
});

export type RetrySettings = z.infer<typeof retrySchema>;
export type WorkerSettings = z.infer<typeof settingsSchema>;

/**
 * Reads the worker's settings (code-house-rules 12.9 "Settings, no defaults"; CH-10). None has a value in code: the
 * worker refuses to start without the variable, with a consumer or job kind it does not set, or with one that is not
 * registered, so a mistyped name cannot leave a job kind on settings it was not meant to have. The values for
 * synthetic work are proposed with S1-F01-T06 for the product owner to approve; those of kdps-test and production are
 * OPEN (CH-10).
 */
export function workerSettingsFromEnvironment(
  env: Readonly<Record<string, string | undefined>>,
  registry: JobRegistry,
): WorkerSettings {
  const text = env[WORKER_SETTINGS_VARIABLE];
  if (text === undefined || text.trim() === '') {
    throw new Error(`${WORKER_SETTINGS_VARIABLE} is not set; the worker has no default settings (CH-10)`);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${WORKER_SETTINGS_VARIABLE} is not JSON`);
  }
  const parsed = settingsSchema.safeParse(json);
  if (!parsed.success) {
    const where = parsed.error.issues.map((issue) => issue.path.join('.') || '(top)').join(', ');
    throw new Error(`${WORKER_SETTINGS_VARIABLE} does not hold valid worker settings at: ${where}`);
  }
  const settings = parsed.data;
  checkNames(
    'consumer',
    registry.consumers.map((consumer) => consumer.name),
    Object.keys(settings.consumers),
  );
  checkNames(
    'job kind',
    registry.jobKinds.map((kind) => kind.name),
    Object.keys(settings.jobKinds),
  );
  return settings;
}

function checkNames(what: string, registered: readonly string[], set: readonly string[]): void {
  const missing = registered.filter((name) => !set.includes(name));
  if (missing.length > 0) {
    throw new Error(`${WORKER_SETTINGS_VARIABLE} sets no retry setting for the ${what} ${missing.join(', ')} (CH-10)`);
  }
  const stray = set.filter((name) => !registered.includes(name));
  if (stray.length > 0) {
    throw new Error(`${WORKER_SETTINGS_VARIABLE} sets the ${what} ${stray.join(', ')}, which is not registered`);
  }
}

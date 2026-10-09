import type { JobRegistry, RetrySettings, WorkerSettings } from '../../src/kernel/index.js';

// The SYNTHETIC worker settings of local work, tests and the browser server (code-house-rules 11.1, 12.9; CH-10).
// They are the provisional values the product owner approved for synthetic and test work only (DEC-118, DEC-119):
// never a KDPS value, never a default in code, and never the settings of kdps-test or production, which stay OPEN
// (CH-10). The worker reads its settings only from AOS_WORKER_SETTINGS; code under src/ never imports this file.

/**
 * SYNTHETIC retry of every consumer and job kind (DEC-118, DEC-119): five attempts in all for a transient failure
 * (`retries` 4 after the first), the first retry after 10 seconds, then increasing delays with jitter (pg-boss's
 * backoff draws each delay at random between the doubled delay and twice that, so the worker adds none of its own;
 * code-house-rules 12.9), and five minutes per attempt for ordinary jobs.
 */
export const SYNTHETIC_RETRY: RetrySettings = {
  retries: 4,
  retryDelaySeconds: 10,
  retryBackoff: true,
  activeLimitSeconds: 300,
};

/** SYNTHETIC poll interval (DEC-119): every 5 seconds. */
export const SYNTHETIC_POLL_SECONDS = 5;

/**
 * SYNTHETIC intervals of the job kinds on an interval (DEC-119): seal every 15 minutes, check the seals hourly, check
 * the partition coverage hourly, and create the partitions ahead of need hourly with it. The grants rebuild every
 * minute (DEC-120, RR-390): it only refreshes the cache and publishes what changed, since Authorise and row-level
 * security check every assignment's dates against today themselves.
 */
export const SYNTHETIC_EVERY_SECONDS: Readonly<Record<string, number>> = {
  'audit.seal-closed-block': 900,
  'audit.check-seals': 3600,
  'audit.check-partition-coverage': 3600,
  'audit.ensure-partitions': 3600,
  'access.rebuild-grants': 60,
  // SYNTHETIC: the escalation of overdue exceptions every minute (S1-F08-T02), a test value only; its real interval
  // is a worker setting with no default (CH-10).
  'exceptions.escalate-overdue': 60,
  // SYNTHETIC: the escalation of overdue tasks and approvals every minute (S1-F05-T02), a test value only (CH-10).
  'inbox.escalate-overdue': 60,
};

/**
 * Tests that wait for a retry or an interval job make the waits short so a run stays quick. The attempts and the
 * growing, jittered delays stay as approved; only how long a test waits changes. SYNTHETIC, tests only.
 */
export const SYNTHETIC_TEST_SPEED = { pollSeconds: 0.5, retryDelaySeconds: 1, everySeconds: 1 } as const;

/**
 * The SYNTHETIC settings of a registry: every consumer and job kind gets SYNTHETIC_RETRY, each job kind its
 * SYNTHETIC_EVERY_SECONDS interval. With `fast`, a test's short waits (SYNTHETIC_TEST_SPEED).
 */
export function syntheticWorkerSettings(registry: JobRegistry, options: { fast?: boolean } = {}): WorkerSettings {
  const fast = options.fast === true;
  const retry: RetrySettings = fast
    ? { ...SYNTHETIC_RETRY, retryDelaySeconds: SYNTHETIC_TEST_SPEED.retryDelaySeconds }
    : SYNTHETIC_RETRY;
  return {
    pollSeconds: fast ? SYNTHETIC_TEST_SPEED.pollSeconds : SYNTHETIC_POLL_SECONDS,
    consumers: Object.fromEntries(registry.consumers.map((consumer) => [consumer.name, retry])),
    jobKinds: Object.fromEntries(
      registry.jobKinds.map((kind) => {
        const every = fast ? SYNTHETIC_TEST_SPEED.everySeconds : SYNTHETIC_EVERY_SECONDS[kind.name];
        if (every === undefined) throw new Error(`No SYNTHETIC interval for the job kind ${kind.name}`);
        return [kind.name, { ...retry, everySeconds: every }];
      }),
    ),
  };
}

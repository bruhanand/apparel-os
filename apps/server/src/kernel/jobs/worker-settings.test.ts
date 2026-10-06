import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { defineEvent } from '../outbox/event-definition.js';
import { checkRegistry, defineConsumer, defineJobKind, type JobRegistry } from './registry.js';
import { WORKER_SETTINGS_VARIABLE, workerSettingsFromEnvironment } from './worker-settings.js';

// S1-F01-T06: consumers and job kinds are registered with a stable name, and the worker does not start with two of
// one name, a consumer of an unknown event type, or a job kind without its retry settings (code-house-rules 12.8,
// 12.9; CH-10). Every value here is SYNTHETIC.

const changed = defineEvent({ type: 'kernel.synthetic-changed', version: 1, payload: z.object({ id: z.uuid() }) });
const unknown = defineEvent({ type: 'kernel.synthetic-unknown', version: 1, payload: z.object({ id: z.uuid() }) });
const authority = { action: 'view', recordType: 'kernel.outbox_event' } as const;

const consumer = defineConsumer({
  name: 'kernel.synthetic-consumer',
  event: changed,
  serviceIdentity: 'synthetic-consumer',
  authorises: authority,
  handle: () => Promise.resolve({ kind: 'done' }),
});
const jobKind = defineJobKind({
  name: 'kernel.synthetic-job',
  serviceIdentity: 'synthetic-job',
  authorises: authority,
  run: () => Promise.resolve({}),
});
const registry: JobRegistry = { events: [changed], consumers: [consumer], jobKinds: [jobKind] };

const retry = { retries: 2, retryDelaySeconds: 1, retryBackoff: true, activeLimitSeconds: 60 };
const valid = {
  pollSeconds: 1,
  consumers: { 'kernel.synthetic-consumer': retry },
  jobKinds: { 'kernel.synthetic-job': { ...retry, everySeconds: 30 } },
};

function environment(value: unknown): Record<string, string> {
  return { [WORKER_SETTINGS_VARIABLE]: JSON.stringify(value) };
}

describe('the job registry (code-house-rules 12.8, 12.9)', () => {
  it('PRD-INT-008 accepts unique names whose event types are declared', () => {
    expect(() => {
      checkRegistry(registry);
    }).not.toThrow();
  });

  it('PRD-INT-008 refuses two consumers of one name, and a consumer of an unknown event type', () => {
    expect(() => {
      checkRegistry({ ...registry, consumers: [consumer, consumer] });
    }).toThrow(/kernel\.synthetic-consumer/);
    const stray = defineConsumer({ ...consumer, name: 'kernel.synthetic-stray', event: unknown });
    expect(() => {
      checkRegistry({ ...registry, consumers: [stray] });
    }).toThrow(/kernel\.synthetic-unknown/);
  });

  it('refuses a name that is not unit.name in lower case', () => {
    expect(() => defineJobKind({ ...jobKind, name: 'Synthetic Job' })).toThrow();
  });
});

describe('the worker settings (code-house-rules 12.9; CH-10)', () => {
  it('reads every registered consumer and job kind its retry settings', () => {
    expect(workerSettingsFromEnvironment(environment(valid), registry)).toEqual(valid);
  });

  it('PRD-SEC-017 has no default: without the variable, or with a job kind missing, the worker does not start', () => {
    expect(() => workerSettingsFromEnvironment({}, registry)).toThrow(new RegExp(WORKER_SETTINGS_VARIABLE));
    expect(() => workerSettingsFromEnvironment(environment({ ...valid, jobKinds: {} }), registry)).toThrow(
      /kernel\.synthetic-job/,
    );
    expect(() => workerSettingsFromEnvironment(environment({ ...valid, consumers: {} }), registry)).toThrow(
      /kernel\.synthetic-consumer/,
    );
  });

  it('refuses settings for a name nobody registered, and values out of range', () => {
    expect(() =>
      workerSettingsFromEnvironment(
        environment({ ...valid, consumers: { ...valid.consumers, 'kernel.synthetic-typo': retry } }),
        registry,
      ),
    ).toThrow(/kernel\.synthetic-typo/);
    expect(() =>
      workerSettingsFromEnvironment(
        environment({ ...valid, consumers: { 'kernel.synthetic-consumer': { ...retry, retries: -1 } } }),
        registry,
      ),
    ).toThrow();
    expect(() => workerSettingsFromEnvironment(environment({ ...valid, pollSeconds: 0.1 }), registry)).toThrow();
  });
});

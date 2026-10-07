import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { WORKER_SETTINGS_VARIABLE, workerSettingsFromEnvironment } from '../../src/kernel/index.js';
import { jobRegistry } from '../../src/worker.module.js';
import { SYNTHETIC_RETRY, syntheticWorkerSettings } from './worker-settings.js';

// S1-F01-T24: the SYNTHETIC worker settings of local work and tests (code-house-rules 11.1, 12.9; CH-10; DEC-118,
// DEC-119). Five attempts in all with growing, jittered delays, held only in labelled synthetic settings: no retry
// value appears in application code.

const LOCAL_FILE = fileURLToPath(new URL('./SYNTHETIC-worker-settings.local.json', import.meta.url));

function environment(value: unknown): Record<string, string> {
  return { [WORKER_SETTINGS_VARIABLE]: JSON.stringify(value) };
}

describe('the synthetic worker settings (DEC-118, DEC-119; CH-10)', () => {
  it('DEC-118 the worker settings schema accepts five attempts in all, with growing delays, for every job of the worker', () => {
    const settings = workerSettingsFromEnvironment(environment(syntheticWorkerSettings(jobRegistry)), jobRegistry);
    expect(SYNTHETIC_RETRY).toEqual({ retries: 4, retryDelaySeconds: 10, retryBackoff: true, activeLimitSeconds: 300 });
    for (const retry of [...Object.values(settings.consumers), ...Object.values(settings.jobKinds)]) {
      expect(retry).toMatchObject({ retries: 4, retryBackoff: true });
    }
    expect(settings.jobKinds['audit.ensure-partitions']).toMatchObject({ everySeconds: 3600 });
    expect(settings.pollSeconds).toBe(5);
  });

  it('CH-10 PRD-SEC-017 refuses a job kind without its retry settings, the upkeep job included', () => {
    const settings = syntheticWorkerSettings(jobRegistry);
    const withoutUpkeep = Object.fromEntries(
      Object.entries(settings.jobKinds).filter(([name]) => name !== 'audit.ensure-partitions'),
    );
    expect(() =>
      workerSettingsFromEnvironment(environment({ ...settings, jobKinds: withoutUpkeep }), jobRegistry),
    ).toThrow(/audit\.ensure-partitions/);
  });

  it('the settings file of local work is these synthetic settings for the whole registry', () => {
    expect(JSON.parse(readFileSync(LOCAL_FILE, 'utf8'))).toEqual(syntheticWorkerSettings(jobRegistry));
  });
});

describe('application code holds no retry value (code-house-rules 12.9 "Settings, no defaults"; CH-10)', () => {
  const src = fileURLToPath(new URL('../../src/', import.meta.url));
  const sources = readdirSync(src, { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts'))
    .map((entry) => join(entry.parentPath, entry.name));
  const retryValue =
    /\b(retries|retryLimit|retryDelay|retryDelaySeconds|retryDelayMax|retryBackoff|activeLimitSeconds|expireInSeconds|everySeconds|pollSeconds|pollingIntervalSeconds)\s*:\s*(\d|true|false)/;

  it('finds the worker’s sources', () => {
    expect(sources.map((file) => relative(src, file))).toContain('kernel/jobs/worker.ts');
  });

  it('PRD-SEC-017 no source under src/ writes a retry, delay, limit or interval as a value', () => {
    const found = sources.flatMap((file) => {
      const match = retryValue.exec(readFileSync(file, 'utf8'));
      return match === null ? [] : [`${relative(src, file)}: ${match[0]}`];
    });
    expect(found).toEqual([]);
  });
});

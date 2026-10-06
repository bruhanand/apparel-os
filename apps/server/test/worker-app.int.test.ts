import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  LOGGER,
  ORGANISATION_TIMEZONE_SOURCE,
  OUTBOX_PROCESSOR_IDENTITY,
  ROUTING_ENVIRONMENT,
  WORKER,
  WORKER_ENVIRONMENT,
  WORKER_SETTINGS_VARIABLE,
  type Worker,
} from '../src/kernel/index.js';
import { AUDIT_JOBS_IDENTITY } from '../src/modules/audit/index.js';
import { WorkerModule } from '../src/worker.module.js';
import { syntheticTimezone } from './support/access.js';
import { capturingLogger, eventually, writeSyntheticServiceIdentity } from './support/jobs.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F01-T06: the worker's start command as built (deployment.md section 2; code-house-rules 12.9) and the audit job
// kinds it sends for each Organisation (numbering-and-audit 4.4; RR-241). The settings are SYNTHETIC (CH-10).

const AUDIT_QUEUES = ['audit.seal-closed-block', 'audit.check-seals', 'audit.check-partition-coverage'];
const retry = { retries: 1, retryDelaySeconds: 0, retryBackoff: false, activeLimitSeconds: 60 };
const SYNTHETIC_SETTINGS = {
  pollSeconds: 0.5,
  consumers: {},
  jobKinds: Object.fromEntries(AUDIT_QUEUES.map((name) => [name, { ...retry, everySeconds: 1 }])),
};

let world: SyntheticWorld;
const log = capturingLogger();

beforeAll(async () => {
  world = await createSyntheticOrganisations('workerapp');
  for (const organisation of world.organisations) {
    await writeSyntheticServiceIdentity(organisation.database, OUTBOX_PROCESSOR_IDENTITY);
    await writeSyntheticServiceIdentity(organisation.database, AUDIT_JOBS_IDENTITY);
  }
});

afterAll(async () => {
  await (world as SyntheticWorld | undefined)?.reset();
});

function compile(workerEnvironment: Record<string, string>) {
  return Test.createTestingModule({ imports: [WorkerModule] })
    .overrideProvider(LOGGER)
    .useValue(log.logger)
    .overrideProvider(ROUTING_ENVIRONMENT)
    .useValue({ AOS_RUNTIME_DATABASE_URL: databaseUrl(world.directory, 'runtime'), AOS_DATABASE_POOL_MAX: '4' })
    .overrideProvider(WORKER_ENVIRONMENT)
    .useValue(workerEnvironment)
    .overrideProvider(ORGANISATION_TIMEZONE_SOURCE)
    .useValue(syntheticTimezone)
    .compile();
}

async function completed(database: string, queue: string): Promise<unknown[]> {
  const owner = await connect(database, 'migration');
  try {
    const result = await owner.query<{ output: unknown }>(
      `select output from pgboss.job where name = $1 and state = 'completed'`,
      [queue],
    );
    return result.rows.map((row) => row.output);
  } finally {
    await owner.end();
  }
}

describe('the worker start command (code-house-rules 12.9)', () => {
  it('CH-10 PRD-SEC-017 does not start without its settings', async () => {
    await expect(compile({})).rejects.toThrow(new RegExp(WORKER_SETTINGS_VARIABLE));
  });

  it('PRD-SEC-007 runs the audit sealing job, the seal check and the coverage check in every Organisation, under their service identity', async () => {
    const app = await compile({ [WORKER_SETTINGS_VARIABLE]: JSON.stringify(SYNTHETIC_SETTINGS) });
    await app.init();
    try {
      await app.get<Worker>(WORKER).start();
      for (const organisation of world.organisations) {
        for (const queue of AUDIT_QUEUES) {
          await eventually(async () => (await completed(organisation.database, queue)).length > 0);
          expect((await completed(organisation.database, queue))[0]).toEqual({ outcome: 'done', replayed: false });
        }
      }
      expect(log.lines.some((line) => line.alert === 'audit-partitions-short')).toBe(false);
    } finally {
      await app.close();
    }
  });
});

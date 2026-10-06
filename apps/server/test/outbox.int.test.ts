import { Writable } from 'node:stream';
import { pino } from 'pino';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  CommandDefect,
  CommandRunner,
  defineEvent,
  newCorrelationId,
  OrganisationRouter,
  PinoLoggerService,
  timezoneNotConfigured,
  type CommandRequest,
  type RoutedOrganisation,
} from '../src/kernel/index.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl } from './support/postgres.js';

// S1-F01-T06: the outbox written in the business transaction (code-house-rules 12.8; module-map section 8;
// PRD-MOD-006, PRD-INT-004). Every command runs as the runtime role through Organisation routing.

// SYNTHETIC identifiers of this file only.
const ACTOR = '01900000-0000-7000-8000-0000006a0001';
const RECORD = '01900000-0000-7000-8000-0000006a0d01';
const VERSION = '01900000-0000-7000-8000-0000006a0e01';
const SITE = '01900000-0000-7000-8000-0000006a0f01';
const SYNTHETIC_POOL_MAX = 4;

/** A SYNTHETIC event type of this file: identifiers only. */
const recordChanged = defineEvent({
  type: 'kernel.synthetic-record-changed',
  version: 1,
  payload: z.object({ recordId: z.uuid(), versionId: z.uuid() }),
});

let world: SyntheticWorld;
let router: OrganisationRouter;
let organisation: RoutedOrganisation;

beforeAll(async () => {
  world = await createSyntheticOrganisations('outbox');
  router = new OrganisationRouter(
    { directoryConnectionString: databaseUrl(world.directory, 'runtime'), poolMax: SYNTHETIC_POOL_MAX },
    logger(),
  );
  const found = await router.resolveForSignIn(world.organisations[0].code);
  if (!found.routed) throw new Error('not routed');
  organisation = found.organisation;
});

afterAll(async () => {
  await (router as OrganisationRouter | undefined)?.close();
  await (world as SyntheticWorld | undefined)?.reset();
});

function logger(): PinoLoggerService {
  return new PinoLoggerService(
    pino(
      new Writable({
        write(_chunk: Buffer, _encoding, done) {
          done();
        },
      }),
    ),
  );
}

const runner = (): CommandRunner =>
  new CommandRunner({ clock: { now: () => new Date() }, timezones: timezoneNotConfigured, logger: logger() });

function request(correlationId = newCorrelationId()): CommandRequest {
  return {
    commandName: 'kernel.synthetic-change-record',
    organisation,
    correlationId,
    actor: { kind: 'actor', actorId: ACTOR },
  };
}

async function eventsOf(correlationId: string): Promise<Record<string, unknown>[]> {
  const client = await connect(world.organisations[0].database, 'migration');
  try {
    const result = await client.query<Record<string, unknown>>(
      `select event_type, payload_version, actor_id, on_behalf_of_user_id, correlation_id, subject_module,
              subject_record_type, subject_record_id, subject_version_id, site_id, store_id, business_unit_id,
              legal_entity_id, brand_id, subject_user_id, payload
       from kernel.outbox_event where correlation_id = $1`,
      [correlationId],
    );
    return result.rows;
  } finally {
    await client.end();
  }
}

const change = {
  subject: { module: 'kernel', recordType: 'kernel.synthetic_record', recordId: RECORD, versionId: VERSION },
  scope: { siteId: SITE },
  payload: { recordId: RECORD, versionId: VERSION },
};

describe('the outbox row is written with the command (code-house-rules 12.8)', () => {
  it('PRD-MOD-006 PRD-INT-004 a committed command leaves its event, with identifiers only', async () => {
    const correlationId = newCorrelationId();
    await runner().run(request(correlationId), (context) => context.publish(recordChanged, change));
    expect(await eventsOf(correlationId)).toEqual([
      {
        event_type: 'kernel.synthetic-record-changed',
        payload_version: 1,
        actor_id: ACTOR,
        on_behalf_of_user_id: null,
        correlation_id: correlationId,
        subject_module: 'kernel',
        subject_record_type: 'kernel.synthetic_record',
        subject_record_id: RECORD,
        subject_version_id: VERSION,
        site_id: SITE,
        store_id: null,
        business_unit_id: null,
        legal_entity_id: null,
        brand_id: null,
        subject_user_id: null,
        payload: { recordId: RECORD, versionId: VERSION },
      },
    ]);
  });

  it('PRD-INT-004 a rolled-back command leaves no outbox row', async () => {
    const correlationId = newCorrelationId();
    await expect(
      runner().run(request(correlationId), async (context) => {
        await context.publish(recordChanged, change);
        throw new Error('SYNTHETIC failure after the event');
      }),
    ).rejects.toThrow('SYNTHETIC failure after the event');
    expect(await eventsOf(correlationId)).toEqual([]);
  });

  it('PRD-SEC-006 refuses a payload its event type does not declare, and an event from a read', async () => {
    const correlationId = newCorrelationId();
    await expect(
      runner().run(request(correlationId), (context) =>
        context.publish(recordChanged, { ...change, payload: { recordId: RECORD, name: 'SYNTHETIC name' } as never }),
      ),
    ).rejects.toThrow(CommandDefect);
    await expect(
      runner().read(request(correlationId), (context) => context.publish(recordChanged, change)),
    ).rejects.toThrow(CommandDefect);
    expect(await eventsOf(correlationId)).toEqual([]);
  });
});

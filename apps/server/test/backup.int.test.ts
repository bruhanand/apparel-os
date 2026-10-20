import { randomInt } from 'node:crypto';
import { uuidv7 } from '@apparel-os/domain';
import { backupStatusSchema, routes } from '@apparel-os/schemas';
import { ListObjectsV2Command } from '@aws-sdk/client-s3';
import { drizzle } from 'drizzle-orm/node-postgres';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { runBackupCommand } from '../src/backup.js';
import {
  BackupVerifyKey,
  signatureName,
  type BackupManifest,
  type BackupOutcome,
  type BackupStore,
  type DumpTool,
  type ParticipantTotals,
} from '../src/kernel/index.js';
import { ORGANISATION_KEYS_VARIABLE } from '../src/modules/access/index.js';
import { restoreRegistry } from '../src/restore-participants.js';
import {
  codeFor,
  startAccessApp,
  syntheticKeysEnvironment,
  SYNTHETIC_ORIGIN,
  writeSyntheticSetting,
  writeSyntheticUser,
  type AccessTestApp,
  type SyntheticUser,
} from './support/access.js';
import {
  containerDumpTool,
  createBackupBucket,
  loadDump,
  objectOf,
  syntheticBackupKey,
  syntheticSigningKey,
} from './support/backup.js';
import { grantSynthetic } from './support/grants.js';
import { startTestFileStore, type TestFileStore } from './support/minio.js';
import { createSyntheticOrganisations, type SyntheticWorld } from './support/organisations.js';
import { connect, databaseUrl, dropDatabase } from './support/postgres.js';
import { syntheticCode, syntheticName } from './fixtures/synthetic.js';

// S1-F14-T02: the application backup, against real PostgreSQL and MinIO with the two synthetic Organisations
// (backup-and-restore 2.3, 3.2, 3.3, 10.1 to 10.3, section 11, section 12 tests 7, 12, 15 and 17 in their backup
// halves; PRD-SEC-012, PRD-SEC-014, PRD-SEC-018, PRD-ACP-019, PRD-MOD-014, PRD-MOD-015, POL-18.02). Every key, file
// and value here is SYNTHETIC.

const MARKER = 'SYNTHETIC-BACKUP-PLAINTEXT-MARKER-7d2e';

let world: SyntheticWorld;
let minio: TestFileStore;
let api: AccessTestApp;
let keysEnvironment: Record<string, string>;
let backupEnvironment: Record<string, string>;
let backupBucket: string;
const backupKey = syntheticBackupKey();
const signingKey = syntheticSigningKey();
const users: SyntheticUser[] = [];
const cookies: string[] = [];
const loaded: string[] = [];
const logLines: string[] = [];

function pdf(label: string): Buffer {
  return Buffer.from(`%PDF-1.4\n% ${MARKER} ${label}\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n`, 'latin1');
}

async function storeFile(index: number, label: string): Promise<{ storedFileId: string; receiptId: string }> {
  const response = await fetch(`${api.baseUrl}/api/files-imports/files`, {
    method: 'POST',
    headers: {
      cookie: cookies[index] ?? '',
      origin: SYNTHETIC_ORIGIN,
      'content-type': 'application/json',
      'idempotency-key': uuidv7(),
    },
    body: JSON.stringify({
      sourceSystem: 'manual-upload',
      originalName: `${MARKER}-${label}.pdf`,
      contentBase64: pdf(`${label}-${String(randomInt(1_000_000_000))}`).toString('base64'),
    }),
  });
  expect(response.status).toBe(200);
  return (await response.json()) as { storedFileId: string; receiptId: string };
}

async function signIn(code: string, user: SyntheticUser): Promise<string> {
  const response = await fetch(`${api.baseUrl}/api/access/sign-in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: SYNTHETIC_ORIGIN, 'x-forwarded-for': '10.9.9.41' },
    body: JSON.stringify({
      organisationCode: code,
      login: user.login,
      password: user.password,
      totpCode: codeFor(user.factorSecret ?? Buffer.alloc(0)),
    }),
  });
  expect(response.status).toBe(200);
  return (response.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

/** A SYNTHETIC Site whose version names a real preparer, so every reference it holds resolves. */
async function writeSite(database: string, preparer: string): Promise<string> {
  const client = await connect(database, 'migration');
  const label = syntheticCode(`GEO-${uuidv7().slice(-8).toUpperCase()}`);
  const [country, state, city, area, site] = [uuidv7(), uuidv7(), uuidv7(), uuidv7(), uuidv7()];
  try {
    await client.query('insert into organisation.country (id, code) values ($1, $2)', [country, label]);
    await client.query('insert into organisation.state (id, country_id, code) values ($1, $2, $3)', [
      state,
      country,
      label,
    ]);
    await client.query('insert into organisation.city (id, state_id, code) values ($1, $2, $3)', [city, state, label]);
    await client.query('insert into organisation.area (id, city_id, code) values ($1, $2, $3)', [area, city, label]);
    await client.query('insert into organisation.site (id, code) values ($1, $2)', [
      site,
      syntheticCode(`SITE-${site.slice(-6).toUpperCase()}`),
    ]);
    await client.query(
      `insert into organisation.site_version (id, site_id, name, physical_kind, area_id, addresses, status,
         valid_during, decision, prepared_by_user_id)
       values ($1, $2, $3, 'retail-site', $4, $5, 'Active', '[2000-01-01,)', 'Approved', $6)`,
      [uuidv7(), site, syntheticName('Backup Site'), area, [syntheticName('Address')], preparer],
    );
    return site;
  } finally {
    await client.end();
  }
}

/** An attachment of a stored file to the Site, written as a fixture (code-house-rules 11.2). */
async function attach(database: string, stored: { storedFileId: string; receiptId: string }, site: string, by: string) {
  const client = await connect(database, 'migration');
  try {
    await client.query(
      `insert into files_imports.attachment (id, stored_file_id, file_receipt_id, record_module, record_type, record_id,
         record_version_id, evidences, restricted_classes, attached_by_kind, attached_by_id, attached_at, site_id)
       values ($1, $2, $3, 'organisation', 'organisation.site', $4, null, 'site-photo', '{}', 'user', $5, now(), $4)`,
      [uuidv7(), stored.storedFileId, stored.receiptId, site, by],
    );
  } finally {
    await client.end();
  }
}

async function backup(
  options: { dumpTool?: DumpTool; backupStore?: BackupStore; args?: string[]; env?: Record<string, string> } = {},
): Promise<BackupOutcome> {
  const outcome = await runBackupCommand({
    env: { ...backupEnvironment, ...options.env },
    args: options.args ?? [],
    dumpTool: options.dumpTool ?? containerDumpTool,
    ...(options.backupStore === undefined ? {} : { backupStore: options.backupStore }),
    log: (message) => logLines.push(message),
  });
  // The answer the command prints is checked with the log (GC-9 test 17).
  logLines.push(JSON.stringify(outcome));
  return outcome;
}

async function backupKeys(prefix = ''): Promise<string[]> {
  const found: string[] = [];
  let token: string | undefined;
  do {
    const page = await minio.client.send(
      new ListObjectsV2Command({ Bucket: backupBucket, Prefix: prefix, ContinuationToken: token }),
    );
    for (const object of page.Contents ?? []) if (object.Key !== undefined) found.push(object.Key);
    token = page.NextContinuationToken;
  } while (token !== undefined);
  return found.sort();
}

async function manifestOf(backupId: string): Promise<BackupManifest> {
  const name = `backups/${backupId}/manifest`;
  return JSON.parse(
    backupKey.privateKey.open(name, await objectOf(minio.client, backupBucket, name)).toString('utf8'),
  ) as BackupManifest;
}

/** Runs a participant reading on a database as the migration role, in one repeatable-read transaction. */
async function inSnapshot<T>(
  database: string,
  code: string,
  work: (context: Parameters<typeof restoreRegistry.controlTotals>[0]) => Promise<T>,
): Promise<T> {
  const client = await connect(database, 'migration');
  try {
    await client.query('begin isolation level repeatable read read only');
    const answer = await work({ organisationCode: code, tx: drizzle({ client }) });
    await client.query('rollback');
    return answer;
  } finally {
    await client.end();
  }
}

async function backupRecords(database: string): Promise<{ backup_id: string; result: string; failures: string[] }[]> {
  const client = await connect(database, 'migration');
  try {
    return (
      await client.query<{ backup_id: string; result: string; failures: string[] }>(
        'select backup_id::text, result, failures from kernel.backup_record order by recorded_at, id',
      )
    ).rows;
  } finally {
    await client.end();
  }
}

function completed(outcome: BackupOutcome): Extract<BackupOutcome, { backupId: string }> {
  if (outcome.outcome === 'refused') throw new Error(`The backup was refused: ${outcome.reason}`);
  return outcome;
}

beforeAll(async () => {
  world = await createSyntheticOrganisations('backup');
  minio = await startTestFileStore();
  keysEnvironment = syntheticKeysEnvironment(world);
  backupBucket = `syn-backups-${uuidv7().slice(-8)}`;
  const backupStoreEnvironment = await createBackupBucket(minio.client, minio.environment, backupBucket);
  for (const organisation of world.organisations) {
    await writeSyntheticSetting(organisation.database, 'access.sign-in-throttling', {
      failureLimit: 50,
      windowSeconds: 600,
    });
    await writeSyntheticSetting(organisation.database, 'access.password-rules', { minimumLength: 12 });
    await writeSyntheticSetting(organisation.database, 'access.office-session-limits', {
      idleLockSeconds: 1800,
      absoluteSeconds: 28800,
    });
  }
  // The application's start check records each Organisation's key version (backup-and-restore 2.4).
  api = await startAccessApp(world, keysEnvironment, { fileStoreEnvironment: minio.environment });
  for (const [index, organisation] of world.organisations.entries()) {
    const user = await writeSyntheticUser(organisation.database, organisation.code, keysEnvironment, {
      label: `BACKUP${String(index)}`,
      enrolled: true,
    });
    await grantSynthetic(organisation.database, { kind: 'user', id: user.id }, [
      { recordType: 'files_imports.stored_file', action: 'create' },
    ]);
    users.push(user);
    cookies.push(await signIn(organisation.code, user));
    const stored = await storeFile(index, 'evidence');
    await attach(organisation.database, stored, await writeSite(organisation.database, user.id), user.id);
  }
  backupEnvironment = {
    AOS_MIGRATION_DATABASE_URL: databaseUrl(world.directory, 'migration'),
    AOS_ENVIRONMENT: 'local',
    AOS_BACKUP_PUBLIC_KEY: backupKey.publicText,
    ...signingKey.backupRunner,
    ...backupStoreEnvironment,
    ...minio.environment,
  };
});

afterAll(async () => {
  await (api as AccessTestApp | undefined)?.close();
  for (const database of loaded) await dropDatabase(database);
  await (minio as TestFileStore | undefined)?.stop();
  await (world as SyntheticWorld | undefined)?.reset();
});

describe('the application backup (backup-and-restore 3.2; PRD-SEC-012)', () => {
  let first: Extract<BackupOutcome, { backupId: string }>;
  let liveTotals: ParticipantTotals[][];

  it('GC-9 12 test 7 PRD-ACP-019 has control totals equal to its own dumps while synthetic commands keep writing', async () => {
    // Each Organisation's dump runs after a command has committed in that database since its snapshot.
    const writing: DumpTool = {
      async dump(target, into) {
        const database = new URL(target.connectionString).pathname.slice(1);
        const index = world.organisations.findIndex((organisation) => organisation.database === database);
        if (index >= 0) {
          await storeFile(index, 'during-backup');
          await writeSyntheticUser(database, world.organisations[index]?.code ?? '', keysEnvironment, {
            label: `DURING${String(randomInt(1_000_000))}`,
            enrolled: true,
          });
        }
        return containerDumpTool.dump(target, into);
      },
    };
    first = completed(await backup({ dumpTool: writing }));
    expect(first.outcome).toBe('complete');
    expect(first.organisations).toEqual(world.organisations.map((organisation) => organisation.code).sort());
    const manifest = await manifestOf(first.backupId);
    expect(manifest.result).toBe('complete');
    liveTotals = [];
    for (const organisation of world.organisations) {
      const part = manifest.organisations.find((each) => each.organisationCode === organisation.code);
      if (part === undefined) throw new Error('The manifest lacks an Organisation');
      const dump = backupKey.privateKey.open(part.object, await objectOf(minio.client, backupBucket, part.object));
      const restored = await loadDump(dump, 'backup_check');
      loaded.push(restored);
      const fromDump = await inSnapshot(restored, organisation.code, (context) =>
        restoreRegistry.controlTotals(context),
      );
      expect(fromDump).toEqual(part.controlTotals);
      const live = await inSnapshot(organisation.database, organisation.code, (context) =>
        restoreRegistry.controlTotals(context),
      );
      liveTotals.push(live);
      // The commands committed after the snapshot, so the live database has moved on from the backup.
      expect(live).not.toEqual(part.controlTotals);
      // PRD-MOD-015: an amount column's Unknown values are counted apart, beside its sum.
      const totals = part.controlTotals.flatMap((each) => each.totals);
      expect(totals.find((total) => total.name === 'files_imports.stored_file.rows')?.value).not.toBe('0');
      expect(totals.every((total) => /^-?\d+$/.test(total.value))).toBe(true);
    }
  });

  it('PRD-ACP-019 each participant’s checks pass on both synthetic Organisations, as backed up', async () => {
    for (const organisation of world.organisations) {
      const results = await inSnapshot(organisation.database, organisation.code, (context) =>
        restoreRegistry.check(context),
      );
      expect(results.filter((result) => !result.passed)).toEqual([]);
      // References across modules were checked: Sites, users and the attachment's record among them.
      const names = results.map((result) => result.check);
      expect(names).toContain('files_imports.attachment.record_id -> organisation.site');
      expect(names).toContain('organisation.site_version.prepared_by_user_id -> access.user');
      expect(
        results.find((result) => result.check === 'files_imports.attachment.site_id -> organisation.site')?.checked,
      ).toBe(1);
      // RR-535: every column naming a user or a service identity is checked (10.4).
      for (const name of [
        'audit.audit_record.actor_id -> user or service identity',
        'files_imports.attachment.attached_by_id -> user or service identity',
        'files_imports.file_receipt.received_by_id -> user or service identity',
        'kernel.idempotency_key.actor_id -> user or service identity',
      ]) {
        expect(results.find((result) => result.check === name)?.checked, name).toBeGreaterThan(0);
      }
    }
  });

  it('RR-535 checks every column of the Organisation database that names a user or a service identity', async () => {
    // A column named `actor_id`, or ending in `_by_id`, names a user or a service identity (backup-and-restore 10.4);
    // `_by_user_id` columns are references to `access.user` and checked by their name. A table that adds one must
    // declare it to its participant, or the restore would leave it unchecked.
    const organisation = world.organisations[0];
    const client = await connect(organisation.database, 'migration');
    let columns: string[];
    try {
      columns = (
        await client.query<{ name: string }>(
          `select c.table_schema || '.' || c.table_name || '.' || c.column_name as name
             from information_schema.columns c
             join information_schema.tables t using (table_schema, table_name)
            where t.table_type = 'BASE TABLE' and c.table_schema not in ('pg_catalog', 'information_schema', 'pgboss')
              and (c.column_name = 'actor_id' or c.column_name like '%\\_by\\_id')
              and not exists (select 1 from pg_catalog.pg_inherits i
                               where i.inhrelid = (c.table_schema || '.' || c.table_name)::regclass)
            order by 1`,
        )
      ).rows.map((row) => row.name);
    } finally {
      await client.end();
    }
    const declared = restoreRegistry.participants
      .flatMap((participant) => participant.actorReferences ?? [])
      .map((reference) => `${reference.table}.${reference.idColumn}`)
      .sort();
    expect(columns.length).toBeGreaterThan(0);
    expect(declared).toEqual(columns);
  });

  it('RR-535 a check finds an actor no user or service identity holds, and one of the wrong kind', async () => {
    const organisation = world.organisations[0];
    const manifest = await manifestOf(first.backupId);
    const part = manifest.organisations.find((each) => each.organisationCode === organisation.code);
    if (part === undefined) throw new Error('The manifest lacks an Organisation');
    const copy = await loadDump(
      backupKey.privateKey.open(part.object, await objectOf(minio.client, backupBucket, part.object)),
      'backup_actors',
    );
    loaded.push(copy);
    const owner = await connect(copy, 'migration');
    try {
      await owner.query('alter table files_imports.attachment disable trigger user');
      await owner.query('alter table files_imports.file_receipt disable trigger user');
      // An attachment by nobody the database holds, and a receipt by a user recorded as a service identity.
      await owner.query('update files_imports.attachment set attached_by_id = $1', [uuidv7()]);
      await owner.query(
        `update files_imports.file_receipt set received_by_kind = 'service-identity' where received_by_kind = 'user'`,
      );
    } finally {
      await owner.end();
    }
    const results = await inSnapshot(copy, organisation.code, (context) => restoreRegistry.check(context));
    expect(
      results.find((result) => result.check === 'files_imports.attachment.attached_by_id -> user or service identity'),
    ).toMatchObject({ passed: false, failed: 1 });
    const receipts = results.find(
      (result) => result.check === 'files_imports.file_receipt.received_by_id -> user or service identity',
    );
    expect(receipts?.passed).toBe(false);
    expect(receipts?.failed).toBeGreaterThan(0);
    // The other actor columns still resolve.
    expect(
      results.find((result) => result.check === 'audit.audit_record.actor_id -> user or service identity')?.passed,
    ).toBe(true);
  });

  it('a check finds a reference that does not resolve', async () => {
    const organisation = world.organisations[1];
    // An append-only row cannot be changed in place, even by its owner (code-house-rules 7.1), so the dangling
    // reference is made in a loaded copy of the dump, as a restore would see one (GC-9 test 8 is S1-F14-T03's).
    const manifest = await manifestOf(first.backupId);
    const part = manifest.organisations.find((each) => each.organisationCode === organisation.code);
    if (part === undefined) throw new Error('The manifest lacks an Organisation');
    const copy = await loadDump(
      backupKey.privateKey.open(part.object, await objectOf(minio.client, backupBucket, part.object)),
      'backup_dangling',
    );
    loaded.push(copy);
    const owner = await connect(copy, 'migration');
    try {
      await owner.query('alter table files_imports.attachment disable trigger refuse_row_change');
      await owner.query('update files_imports.attachment set site_id = $1', [uuidv7()]);
    } finally {
      await owner.end();
    }
    const results = await inSnapshot(copy, organisation.code, (context) => restoreRegistry.check(context));
    expect(
      results.find((result) => result.check === 'files_imports.attachment.site_id -> organisation.site'),
    ).toMatchObject({
      passed: false,
      failed: 1,
    });
  });

  it('copies each Organisation’s objects into the backup store, and the manifest lists the keys and key versions its data needs', async () => {
    const manifest = await manifestOf(first.backupId);
    const stored = await backupKeys('files/');
    for (const part of manifest.organisations) {
      expect(part.objectKeys.length).toBeGreaterThan(0);
      for (const key of part.objectKeys) expect(stored).toContain(`files/${key}`);
      expect(part.objectKeys.every((key) => key.startsWith(`${part.organisationId}/`))).toBe(true);
      expect(part.keyVersions.map((use) => use.identifier)).toHaveLength(1);
      expect(part.keyVersions[0]?.identifier).toMatch(/^[0-9a-f]{32}$/);
      expect(part.latestSeal).toBeNull();
      expect(part.lastMigration).toMatch(/^\d{4}__/);
    }
    // Objects stored after the snapshot are copied too, and kept (3.3).
    expect(stored.length).toBeGreaterThan(manifest.organisations.flatMap((part) => part.objectKeys).length);
  });

  it('records the backup in each Organisation database it covered, and none in the directory (3.2 step 8; DEC-093)', async () => {
    for (const organisation of world.organisations) {
      expect(await backupRecords(organisation.database)).toEqual([
        { backup_id: first.backupId, result: 'complete', failures: [] },
      ]);
    }
    const directory = await connect(world.directory, 'migration');
    try {
      const table = await directory.query<{ present: boolean }>(
        "select pg_catalog.to_regclass('kernel.backup_record') is not null as present",
      );
      expect(table.rows[0]?.present).toBe(false);
    } finally {
      await directory.end();
    }
  });

  it('a second backup copies no object again: the file copy is incremental (3.3)', async () => {
    const before = await backupKeys('files/');
    const second = completed(await backup());
    expect(second.outcome).toBe('complete');
    const manifest = await manifestOf(second.backupId);
    for (const key of manifest.organisations.flatMap((part) => part.objectKeys))
      expect(before).toContain(`files/${key}`);
  });

  it('GC-9 12 test 12 POL-18.02 PRD-SEC-006 the dumps and the manifest are encrypted and hold no plaintext and no key', async () => {
    const organisationKeys = Object.values(
      JSON.parse(keysEnvironment[ORGANISATION_KEYS_VARIABLE] ?? '{}') as Record<string, string>,
    );
    const forbidden = [
      Buffer.from(MARKER),
      ...users.map((user) => Buffer.from(user.login)),
      ...organisationKeys.flatMap((key) => [Buffer.from(key), Buffer.from(key, 'base64url')]),
      Buffer.from(backupKey.privateText),
      Buffer.from(backupKey.privateText, 'base64'),
      ...Object.values(signingKey.backupRunner).flatMap((key) => [Buffer.from(key), Buffer.from(key, 'base64')]),
    ];
    for (const key of await backupKeys()) {
      const bytes = await objectOf(minio.client, backupBucket, key);
      for (const value of forbidden) expect(bytes.includes(value), key).toBe(false);
      // Every object of a backup is sealed but its signature, which holds hashes and a result only.
      if (key.startsWith('backups/') && !key.endsWith('.signature')) {
        expect(bytes.subarray(0, 4).toString('ascii'), key).toBe('AOSB');
      }
    }
    // The manifest, opened, holds no record data and no key either.
    const manifest = JSON.stringify(await manifestOf(first.backupId));
    for (const value of [MARKER, ...users.map((user) => user.login), ...organisationKeys, backupKey.privateText]) {
      expect(manifest).not.toContain(value);
    }
  });

  it('product owner 12 Oct 2026: signs each backup’s final result after its manifest is read back, and refuses without the signing key', async () => {
    const verifyKey = BackupVerifyKey.fromEnvironment(signingKey.restoreRunner);
    const statement = verifyKey.verify(
      await objectOf(minio.client, backupBucket, signatureName(first.backupId)),
      first.backupId,
    );
    expect(statement).toMatchObject({
      backupId: first.backupId,
      manifestObject: `backups/${first.backupId}/manifest`,
      manifestSha256: first.manifestSha256,
      result: 'complete',
      failures: [],
    });
    // Another backup's signature does not stand for this one.
    expect(() =>
      verifyKey.verify(Buffer.from(JSON.stringify({ statement: 'e30=', signature: 'AA==' })), first.backupId),
    ).toThrow(/does not verify/);
    const before = await backupKeys();
    const refused = await backup({ env: { AOS_BACKUP_SIGNING_KEY: '' } });
    expect(refused).toMatchObject({ outcome: 'refused' });
    expect(refused.outcome === 'refused' ? refused.reason : '').toContain('AOS_BACKUP_SIGNING_KEY is not set');
    expect(await backupKeys()).toEqual(before);
  });

  it('GC-9 12 test 15 PRD-SEC-018 cannot be reached through the API, and the runtime role cannot run it', async () => {
    const before = await backupKeys();
    for (const route of Object.values(routes)) {
      if (route.path.includes('backup')) expect(route.method).toBe('GET');
    }
    const refused = await backup({
      env: { AOS_MIGRATION_DATABASE_URL: databaseUrl(world.directory, 'runtime') },
    });
    expect(refused.outcome).toBe('refused');
    expect(refused.outcome === 'refused' ? refused.reason : '').toContain('not as aos_migration');
    expect(await backupKeys()).toEqual(before);
  });

  it('GC9-18 refuses a backup key that is not the last complete backup’s version, unless a new version is stated', async () => {
    const before = await backupKeys();
    const other = syntheticBackupKey();
    const refused = await backup({ env: { AOS_BACKUP_PUBLIC_KEY: other.publicText } });
    expect(refused.outcome).toBe('refused');
    expect(await backupKeys()).toEqual(before);
    const stated = completed(
      await backup({ env: { AOS_BACKUP_PUBLIC_KEY: other.publicText }, args: ['--new-backup-key-version'] }),
    );
    expect(stated.outcome).toBe('complete');
    // Back to the first key for the tests that follow.
    expect(completed(await backup({ args: ['--new-backup-key-version'] })).outcome).toBe('complete');
  });

  it('a backup whose dump fails its hash is recorded as failed and is not complete (3.2 step 7)', async () => {
    const store = (await import('../src/kernel/index.js')).S3Bucket;
    const real = new store({
      endpoint: backupEnvironment.AOS_BACKUP_STORE_ENDPOINT ?? '',
      region: backupEnvironment.AOS_BACKUP_STORE_REGION ?? '',
      bucket: backupBucket,
      accessKeyId: backupEnvironment.AOS_BACKUP_STORE_ACCESS_KEY_ID ?? '',
      secretAccessKey: backupEnvironment.AOS_BACKUP_STORE_SECRET_ACCESS_KEY ?? '',
      addressing: 'path',
    });
    // A store that changes one byte of every dump it is given, as a damaged copy would.
    const damaging: BackupStore = {
      async putOnce(name, body, length) {
        if (!name.endsWith('.dump')) return real.putOnce(name, body, length);
        const chunks: Buffer[] = [];
        for await (const chunk of body as AsyncIterable<Buffer>) chunks.push(chunk);
        const bytes = Buffer.concat(chunks);
        bytes[bytes.length - 30] = (bytes[bytes.length - 30] ?? 0) ^ 0xff;
        return real.putOnce(name, bytes, bytes.length);
      },
      get: (name) => real.get(name),
      list: (prefix) => real.list(prefix),
    };
    try {
      const failed = completed(await backup({ backupStore: damaging }));
      expect(failed.outcome).toBe('failed');
      expect(new Set(failed.failures.map((failure) => failure.kind))).toEqual(
        new Set(['dump-hash-differs', 'dump-does-not-decrypt']),
      );
      const manifest = await manifestOf(failed.backupId);
      expect(manifest.result).toBe('failed');
      // The signed statement says failed too, so a restore never takes it.
      expect(
        BackupVerifyKey.fromEnvironment(signingKey.restoreRunner).verify(
          await objectOf(minio.client, backupBucket, signatureName(failed.backupId)),
          failed.backupId,
        ).result,
      ).toBe('failed');
      for (const organisation of world.organisations) {
        expect((await backupRecords(organisation.database)).at(-1)).toEqual({
          backup_id: failed.backupId,
          result: 'failed',
          failures: ['dump-does-not-decrypt', 'dump-hash-differs'],
        });
      }
    } finally {
      real.destroy();
    }
  });

  it('a backup missing an object a record names is recorded as failed (3.2 step 7; PRD-IMP-002)', async () => {
    const organisation = world.organisations[0];
    const directory = await connect(world.directory, 'migration');
    let organisationId: string;
    try {
      organisationId =
        (
          await directory.query<{ id: string }>(
            'select id::text from kernel.directory_entry where organisation_code = $1',
            [organisation.code],
          )
        ).rows[0]?.id ?? '';
    } finally {
      await directory.end();
    }
    // A stored-file record whose object never reached the file store, written as a fixture.
    const client = await connect(organisation.database, 'migration');
    const hash = 'f'.repeat(64);
    try {
      await client.query(
        `insert into files_imports.stored_file (id, content_hash, size_bytes, format, object_key, encryption_scheme,
           key_version, restricted_classes)
         values ($1, $2, 1, 'pdf', $3, 'aes-256-gcm/hkdf-sha256/1', $4, null)`,
        [uuidv7(), hash, `${organisationId}/files/${hash}`, '5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e5e'],
      );
    } finally {
      await client.end();
    }
    const failed = completed(await backup());
    expect(failed.outcome).toBe('failed');
    expect(failed.failures).toEqual([{ kind: 'object-missing', part: organisation.code, count: 1 }]);
    expect((await manifestOf(failed.backupId)).result).toBe('failed');
    expect((await backupRecords(organisation.database)).at(-1)).toMatchObject({
      result: 'failed',
      failures: ['object-missing'],
    });
  });

  it('GC-9 12 test 17 PRD-SEC-014 its log and answers hold no secret, connection string or record data', () => {
    const organisationKeys = Object.values(
      JSON.parse(keysEnvironment[ORGANISATION_KEYS_VARIABLE] ?? '{}') as Record<string, string>,
    );
    const text = logLines.join('\n');
    expect(text).not.toBe('');
    for (const value of [
      backupEnvironment.AOS_MIGRATION_DATABASE_URL ?? '',
      backupEnvironment.AOS_BACKUP_STORE_SECRET_ACCESS_KEY ?? '',
      backupEnvironment.AOS_FILE_STORE_SECRET_ACCESS_KEY ?? '',
      backupKey.publicText,
      backupKey.privateText,
      ...Object.values(signingKey.backupRunner),
      MARKER,
      ...users.map((user) => user.login),
      ...organisationKeys,
    ]) {
      expect(text).not.toContain(value);
    }
  });

  it('PRD-SEC-013 PRD-SEC-005 shows backup status to an authorised operator of each Organisation, and to nobody else', async () => {
    const seen: string[][] = [];
    for (const [index, organisation] of world.organisations.entries()) {
      const operator = await writeSyntheticUser(organisation.database, organisation.code, keysEnvironment, {
        label: `OPERATOR${String(index)}`,
        enrolled: true,
      });
      await grantSynthetic(organisation.database, { kind: 'user', id: operator.id }, [
        { recordType: 'kernel.backup_record', action: 'view' },
      ]);
      const response = await fetch(`${api.baseUrl}${routes.listBackups.path}`, {
        headers: { cookie: await signIn(organisation.code, operator), origin: SYNTHETIC_ORIGIN },
      });
      expect(response.status).toBe(200);
      const status = backupStatusSchema.parse(await response.json());
      const recorded = await backupRecords(organisation.database);
      expect(status.backups.map((entry) => entry.backupId)).toEqual(recorded.map((row) => row.backup_id).reverse());
      expect(status.lastComplete?.result).toBe('complete');
      expect(status.backups.some((entry) => entry.result === 'failed')).toBe(true);
      seen.push(status.backups.map((entry) => entry.backupId));
    }
    // One backup covers both Organisations, so each sees the same backups, read from its own database.
    expect(seen[0]).toEqual(seen[1]);
    const refused = await fetch(`${api.baseUrl}${routes.listBackups.path}`, {
      headers: { cookie: cookies[0] ?? '', origin: SYNTHETIC_ORIGIN },
    });
    expect(refused.status).toBe(403);
  });
});

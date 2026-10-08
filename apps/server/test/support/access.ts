import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { uuidv7 } from '@apparel-os/domain';
import { permissionRegistry, Secret, type PersonaId, type RecordTypeDeclaration } from '@apparel-os/schemas';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { pino } from 'pino';
import { AppModule } from '../../src/app.module.js';
import {
  CLOCK,
  configureApp,
  serveWebApp,
  HTTP_ENVIRONMENT,
  LOGGER,
  ORGANISATION_TIMEZONE_SOURCE,
  PinoLoggerService,
  ROUTING_ENVIRONMENT,
  type Clock,
  type OrganisationTimezoneSource,
} from '../../src/kernel/index.js';
import {
  Access,
  ACCESS,
  ACCESS_ENVIRONMENT,
  ORGANISATION_KEYS,
  ORGANISATION_KEYS_VARIABLE,
} from '../../src/modules/access/index.js';
import { AUDIT, type AuditInterface } from '../../src/modules/audit/index.js';
import { FILE_STORE_ENVIRONMENT } from '../../src/modules/files-imports/index.js';
// The access module's own helpers, used only to write the fewest rows a test needs until the setup step and the user
// commands exist (code-house-rules 11.2): the factor secret is sealed exactly as the module seals it.
import { sealFactorSecret } from '../../src/modules/access/domain/factor-secret.js';
import { OrganisationKeys } from '../../src/modules/access/domain/organisation-keys.js';
import { hashPassword } from '../../src/modules/access/domain/password-hash.js';
import { timeStep, totpCode } from '../../src/modules/access/domain/totp.js';
import { syntheticCode, syntheticName } from '../fixtures/synthetic.js';
import type { SyntheticWorld } from './organisations.js';
import { connect, databaseUrl } from './postgres.js';

// S1-F01-T08: what a sign-in test needs: a test application on real PostgreSQL, synthetic users written directly
// (until the setup step, S1-F01-T10, and user creation, S1-F01-T13, replace these writes; code-house-rules 11.2), the
// synthetic settings sign-in reads, and a captured service log. Every value here is SYNTHETIC.

/** The SYNTHETIC own origin of the test application (AOS_PUBLIC_ORIGIN). */
export const SYNTHETIC_ORIGIN = 'http://synthetic.localhost';
/** A SYNTHETIC timezone for the test Organisations, standing in for configuration's setting (RR-231). */
const SYNTHETIC_TIMEZONE = 'Etc/UTC';
const SYNTHETIC_TIMEZONE_VERSION = '01900000-0000-7000-8000-00000000c0de';

/** The timezone source of the test application: one SYNTHETIC timezone for every Organisation. */
export const syntheticTimezone: OrganisationTimezoneSource = {
  read: () => Promise.resolve({ kind: 'set', timezone: SYNTHETIC_TIMEZONE, versionId: SYNTHETIC_TIMEZONE_VERSION }),
};

/** A SYNTHETIC key for each Organisation of the world, as AOS_ORGANISATION_KEYS holds them. */
export function syntheticKeysEnvironment(world: SyntheticWorld): Record<string, string> {
  return {
    [ORGANISATION_KEYS_VARIABLE]: JSON.stringify(
      Object.fromEntries(
        world.organisations.map((organisation) => [organisation.code, randomBytes(32).toString('base64url')]),
      ),
    ),
  };
}

function dayAgo(): string {
  return new Date(Date.now() - 86_400_000).toISOString();
}

export interface SyntheticUser {
  readonly id: string;
  readonly versionId: string;
  readonly login: string;
  readonly displayName: string;
  readonly password: string;
  /** The authenticator secret of a user written already enrolled. */
  readonly factorSecret: Buffer | undefined;
}

/**
 * Writes a SYNTHETIC user directly, as the migration role: an app_user, one version (Approved and Active by default)
 * with the personas asked for, a password credential (temporary or not) and, if asked, a confirmed second factor.
 */
export async function writeSyntheticUser(
  database: string,
  organisationCode: string,
  keysEnvironment: Record<string, string>,
  options: {
    readonly label: string;
    readonly temporary?: boolean;
    readonly enrolled?: boolean;
    readonly decision?: 'Approved' | 'Awaiting approval';
    readonly state?: 'Active' | 'Disabled';
    /** The personas the version holds, in order (S1-F01-T11). None by default. */
    readonly personas?: readonly PersonaId[];
  },
): Promise<SyntheticUser> {
  const id = uuidv7();
  const versionId = uuidv7();
  const login = syntheticCode(`USER-${options.label}`);
  const displayName = syntheticName(`User ${options.label}`);
  const password = `SYNTHETIC-password-${randomBytes(6).toString('hex')}`;
  const owner = await connect(database, 'migration');
  try {
    await owner.query('insert into access.app_user (id, login, partner_id) values ($1, $2, null)', [id, login]);
    await owner.query(
      `insert into access.app_user_version (id, app_user_id, display_name, state, valid_during, decision)
       values ($1, $2, $3, $4, tstzrange($5::timestamptz, null), $6)`,
      // User versions are dated by instants (access-and-approvals 9.5; DEC-118): from a day before now.
      [versionId, id, displayName, options.state ?? 'Active', dayAgo(), options.decision ?? 'Approved'],
    );
    for (const [index, persona] of (options.personas ?? []).entries()) {
      await owner.query(
        'insert into access.persona_held (id, app_user_version_id, persona, position) values ($1, $2, $3, $4)',
        [uuidv7(), versionId, persona, index + 1],
      );
    }
    await owner.query(
      `insert into access.password_credential (id, app_user_id, password_hash, temporary, entered_with_version_id, replaced_at)
       values ($1, $2, $3, $4, $5, null)`,
      [uuidv7(), id, await hashPassword(new Secret(password)), options.temporary ?? false, versionId],
    );
    let factorSecret: Buffer | undefined;
    if (options.enrolled === true) {
      factorSecret = randomBytes(20);
      const factorId = uuidv7();
      const sealed = sealFactorSecret(
        OrganisationKeys.fromEnvironment(keysEnvironment),
        organisationCode,
        factorId,
        factorSecret,
      );
      await owner.query(
        `insert into access.second_factor (id, app_user_id, secret_scheme, secret_ciphertext, state, last_used_step, confirmed_at)
         values ($1, $2, $3, $4, 'Confirmed', null, now())`,
        [factorId, id, sealed.scheme, sealed.ciphertext],
      );
    }
    return { id, versionId, login, displayName, password, factorSecret };
  } finally {
    await owner.end();
  }
}

/** Writes a SYNTHETIC setting of access, Approved, in force from a day before now, labelled synthetic (12.14; 11.1). */
export async function writeSyntheticSetting(
  database: string,
  key: 'access.sign-in-throttling' | 'access.password-rules' | 'access.office-session-limits',
  value: Record<string, number>,
): Promise<void> {
  const owner = await connect(database, 'migration');
  try {
    const settingId = uuidv7();
    await owner.query('insert into access.setting (id, setting_key) values ($1, $2)', [settingId, key]);
    await owner.query(
      `insert into access.setting_version (id, setting_id, value_format, value, origin, valid_during, decision)
       values ($1, $2, $3, $4, 'synthetic', tstzrange($5::timestamptz, null), 'Approved')`,
      // Setting versions are dated by instants (access-and-approvals 3.3; DEC-118): from a day before now.
      [uuidv7(), settingId, `${key}/1`, JSON.stringify(value), dayAgo()],
    );
  } finally {
    await owner.end();
  }
}

/**
 * Writes a SYNTHETIC approve or reject reason, Approved and in force from a day before now (access-and-approvals 9.5),
 * so a test can decide without first deciding a reason list. Returns the reason's identifier.
 */
export async function writeSyntheticReason(database: string, kind: 'approve' | 'reject'): Promise<string> {
  const owner = await connect(database, 'migration');
  try {
    const reasonId = uuidv7();
    await owner.query('insert into access.approval_reason (id, code, kind) values ($1, $2, $3)', [
      reasonId,
      syntheticCode(`REASON-${kind.toUpperCase()}-${reasonId.slice(-6).toUpperCase()}`),
      kind,
    ]);
    await owner.query(
      `insert into access.approval_reason_version (id, approval_reason_id, text, valid_during, decision)
       values ($1, $2, $3, daterange($4::date, null), 'Approved')`,
      [uuidv7(), reasonId, `SYNTHETIC ${kind} reason`, dayAgo().slice(0, 10)],
    );
    return reasonId;
  } finally {
    await owner.end();
  }
}

/** The code of the authenticator, for a step from now (0 now, 1 the next, ...), or from the instant given. */
export function codeFor(secret: Buffer, stepsFromNow = 0, at: Date = new Date()): string {
  return totpCode(secret, timeStep(at) + stepsFromNow);
}

/**
 * A clock a test moves forward (code-house-rules 9): the system time plus an offset, so session limits pass without
 * waiting (S1-F01-T09).
 */
export class SyntheticClock implements Clock {
  private offsetMs = 0;

  now(): Date {
    return new Date(Date.now() + this.offsetMs);
  }

  advance(seconds: number): void {
    this.offsetMs += seconds * 1000;
  }
}

export interface AccessTestApp {
  readonly app: INestApplication;
  readonly baseUrl: string;
  /** Every line the service log wrote, as text. */
  readonly logText: () => string;
  close(): Promise<void>;
}

/**
 * The whole application, as main.ts builds it, on the test world: routing to its directory, the SYNTHETIC keys,
 * origin and timezone, and a captured log. The browser journeys give the origin their pages are served from and a
 * fixed port (test/browser/serve.ts); other tests take any free port.
 */
export async function startAccessApp(
  world: SyntheticWorld,
  keysEnvironment: Record<string, string>,
  options: {
    readonly timezone?: OrganisationTimezoneSource;
    readonly origin?: string;
    readonly port?: number;
    /** The kernel's clock; the system clock unless a test moves time (S1-F01-T09). */
    readonly clock?: Clock;
    /** A built web app to serve from the same origin, as the real server does (S1-F01-T27). */
    readonly webApp?: string;
    /** The file store variables (files-imports); none by default, so file storage is not configured. */
    readonly fileStoreEnvironment?: Record<string, string>;
    /** Record types beside the declared ones, for a test-only record type (code-house-rules 11.4). */
    readonly extraRecordTypes?: readonly RecordTypeDeclaration[];
  } = {},
): Promise<AccessTestApp> {
  const lines: string[] = [];
  const logger = new PinoLoggerService(
    pino(
      new Writable({
        write(chunk: Buffer, _encoding, done) {
          lines.push(chunk.toString('utf8'));
          done();
        },
      }),
    ),
  );
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.clock !== undefined) builder = builder.overrideProvider(CLOCK).useValue(options.clock);
  if (options.extraRecordTypes !== undefined) {
    const registry = [...permissionRegistry, ...options.extraRecordTypes];
    builder = builder.overrideProvider(ACCESS).useFactory({
      factory: (audit: AuditInterface, keys: OrganisationKeys) => new Access({ audit, keys, registry }),
      inject: [AUDIT, ORGANISATION_KEYS],
    });
  }
  const moduleRef = await builder
    .overrideProvider(FILE_STORE_ENVIRONMENT)
    .useValue(options.fileStoreEnvironment ?? {})
    .overrideProvider(LOGGER)
    .useValue(logger)
    .overrideProvider(ROUTING_ENVIRONMENT)
    .useValue({ AOS_RUNTIME_DATABASE_URL: databaseUrl(world.directory, 'runtime'), AOS_DATABASE_POOL_MAX: '4' })
    .overrideProvider(HTTP_ENVIRONMENT)
    .useValue({ AOS_PUBLIC_ORIGIN: options.origin ?? SYNTHETIC_ORIGIN, AOS_TRUSTED_PROXY_HOPS: '1' })
    .overrideProvider(ACCESS_ENVIRONMENT)
    .useValue(keysEnvironment)
    .overrideProvider(ORGANISATION_TIMEZONE_SOURCE)
    .useValue(options.timezone ?? syntheticTimezone)
    .compile();
  const app = moduleRef.createNestApplication({ logger: false });
  configureApp(app);
  if (options.webApp !== undefined) serveWebApp(app, options.webApp);
  app.enableShutdownHooks();
  await app.listen(options.port ?? 0, '127.0.0.1');
  const baseUrl = await app.getUrl();
  return { app, baseUrl, logText: () => lines.join(''), close: () => app.close() };
}

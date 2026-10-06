import { bigint, boolean, customType, inet, jsonb, pgSchema, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// Drizzle definitions of the access module's tables (code-house-rules 3.4). They mirror the reviewed migrations
// (migrations/organisation/0005 and 0006) and never create or change a table; an integration test compares each with
// the migrated database. Never exported from the module's index.ts, so no other unit can name these tables
// (code-house-rules 2).

const access = pgSchema('access');

const at = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });

/** A half-open range of business dates, `[start, end)`, read and written as PostgreSQL's text form (7.3). */
const daterange = customType<{ data: string; driverData: string }>({
  dataType: () => 'daterange',
});

/** A user (access-and-approvals 2.1). Never changed or deleted. */
export const appUser = access.table('app_user', {
  id: uuid('id').primaryKey(),
  login: text('login').notNull(),
  partnerId: uuid('partner_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A user's effective-dated versions (access-and-approvals 2.1, 9.11; code-house-rules 7.3). */
export const appUserVersion = access.table('app_user_version', {
  id: uuid('id').primaryKey(),
  appUserId: uuid('app_user_id').notNull(),
  displayName: text('display_name').notNull(),
  state: text('state').notNull(),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Password credentials: an Argon2id hash only, the current one per user (access-and-approvals 3.2). */
export const passwordCredential = access.table('password_credential', {
  id: uuid('id').primaryKey(),
  appUserId: uuid('app_user_id').notNull(),
  passwordHash: text('password_hash'),
  temporary: boolean('temporary').notNull(),
  enteredWithVersionId: uuid('entered_with_version_id'),
  replacedAt: at('replaced_at'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Second factors: an authenticator app, its secret encrypted under the Organisation's key (access-and-approvals 6). */
export const secondFactor = access.table('second_factor', {
  id: uuid('id').primaryKey(),
  appUserId: uuid('app_user_id').notNull(),
  secretScheme: text('secret_scheme').notNull(),
  secretCiphertext: text('secret_ciphertext').notNull(),
  state: text('state').notNull(),
  lastUsedStep: bigint('last_used_step', { mode: 'number' }),
  confirmedAt: at('confirmed_at'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Sessions: the SHA-256 hash of the cookie's identifier, never the identifier (access-and-approvals 3.3). */
export const session = access.table('session', {
  id: uuid('id').primaryKey(),
  appUserId: uuid('app_user_id').notNull(),
  identifierHash: text('identifier_hash').notNull().unique(),
  kind: text('kind').notNull(),
  deviceId: uuid('device_id'),
  state: text('state').notNull(),
  startedAt: at('started_at').notNull(),
  lastActivityAt: at('last_activity_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Service identities (access-and-approvals 2.3; PRD-SEC-018). Never changed or deleted. */
export const serviceIdentity = access.table('service_identity', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  kind: text('kind').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A service identity's effective-dated versions (code-house-rules 7.3). */
export const serviceIdentityVersion = access.table('service_identity_version', {
  id: uuid('id').primaryKey(),
  serviceIdentityId: uuid('service_identity_id').notNull(),
  state: text('state').notNull(),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A service identity's credentials: an Argon2id hash only, revocable (access-and-approvals 2.3). */
export const serviceCredential = access.table('service_credential', {
  id: uuid('id').primaryKey(),
  serviceIdentityId: uuid('service_identity_id').notNull(),
  secretHash: text('secret_hash').notNull(),
  revokedAt: at('revoked_at'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A setting of access (code-house-rules 12.14). Never changed or deleted. */
export const setting = access.table('setting', {
  id: uuid('id').primaryKey(),
  settingKey: text('setting_key').notNull().unique(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A setting's effective-dated versions, with the origin of each (code-house-rules 7.3, 12.14). */
export const settingVersion = access.table('setting_version', {
  id: uuid('id').primaryKey(),
  settingId: uuid('setting_id').notNull(),
  valueFormat: text('value_format').notNull(),
  value: jsonb('value').notNull(),
  origin: text('origin').notNull(),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A failed sign-in, as throttling counts it: a keyed digest of the typed login and the source address (DEC-116). */
export const signInFailure = access.table('sign_in_failure', {
  id: uuid('id').primaryKey(),
  loginDigest: text('login_digest').notNull(),
  networkAddress: inet('network_address').notNull(),
  failedAt: at('failed_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

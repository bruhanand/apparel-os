// Public interface of the kernel. Other code imports only from here.
export {
  CommandCancelled,
  CommandDefect,
  CommandOutcomeUnknown,
  CommandTimedOut,
  sqlStateOf,
} from './command-runner/command-errors.js';
export { isInsideCommand, refuseInsideCommand } from './command-runner/command-mark.js';
export { CommandRunner } from './command-runner/command-runner.js';
export type { CommandRequest, CommandRunnerDependencies } from './command-runner/command-runner.js';
export {
  CLOCK,
  COMMAND_RUNNER,
  CommandRunnerModule,
  CONFIGURED_TIMEZONE_SOURCE,
  ORGANISATION_TIMEZONE_SOURCE,
} from './command-runner/command-runner.module.js';
export {
  CORRELATION_ID_HEADER,
  correlationIdMiddleware,
  correlationIdOf,
  isCorrelationId,
  newCorrelationId,
} from './command-runner/correlation.js';
export { LOCK_STEP, lockTable, planLockRuns } from './command-runner/lock-helper.js';
export type { LockMode, LockResult, LockRun, LockStep, LockTable, LockTarget } from './command-runner/lock-helper.js';
export type {
  ActorSetting,
  BusinessDate,
  NoActorPath,
  Transaction,
  TransactionContext,
} from './command-runner/transaction-context.js';
export { connectionToDatabase } from './db/connection.js';
export { createDb } from './db/create-db.js';
export type { Database, DatabaseHandle, PoolOptions } from './db/create-db.js';
export { applyDatabasePrivileges } from './db/database-privileges.js';
export { findDatabaseName, findDirectoryEntries, listDirectory, registerInDirectory } from './db/directory.js';
export type { DirectoryEntry } from './db/directory.js';
export { migrateAll } from './db/migrate-all.js';
export type { MigrateAllOptions } from './db/migrate-all.js';
export { migrateDatabase } from './db/migration-runner.js';
export type { MigrateDatabaseOptions } from './db/migration-runner.js';
export { migrationSetFolder, orderMigrationFileNames, readMigrationSet } from './db/migration-set.js';
export type { MigrationFile, MigrationSetName } from './db/migration-set.js';
export { ApiRefusal } from './http/api-refusal.js';
export type { RefusalBody } from './http/api-refusal.js';
export {
  ApiRoute,
  commandAnswer,
  requestContentOf,
  ROUTE_METADATA,
  RouteAnswer,
  routeAnswer,
  RouteInput,
} from './http/api-route.js';
export type { RouteInputOf } from './http/api-route.js';
export { configureApp } from './http/configure-app.js';
export type { HttpRequest, HttpResponse } from './http/http-types.js';
export {
  httpSettingsFromEnvironment,
  PUBLIC_ORIGIN_VARIABLE,
  TRUSTED_PROXY_HOPS_VARIABLE,
} from './http/http-settings.js';
export type { HttpSettings } from './http/http-settings.js';
export { HTTP_ENVIRONMENT, HTTP_SETTINGS } from './http/origin-check.guard.js';
export {
  canonicalJson,
  fieldName,
  IDEMPOTENCY_FORM_VERSION,
  prepareRequest,
  sha256Hex,
} from './idempotency/canonical-form.js';
export type {
  FieldPath,
  JsonObject,
  JsonValue,
  PreparedRequest,
  RequestContent,
  RestrictedField,
  SecretField,
} from './idempotency/canonical-form.js';
export { restrictedValueCipherNotConfigured, secretCheckNotImplemented } from './idempotency/contracts.js';
export type {
  CommandRefusal,
  EncryptedValue,
  KeptOutcome,
  KeptRefusalKind,
  MissingItem,
  ReplayAccess,
  ReplayAccessRefusal,
  ReplayAuthorisation,
  ReplaySecretCheck,
  RestrictedValueCipher,
} from './idempotency/contracts.js';
export { IdempotencyConflict } from './idempotency/idempotency-errors.js';
export type { IdempotencyConflictCode } from './idempotency/idempotency-errors.js';
export { IdempotencyHelper } from './idempotency/idempotency-helper.js';
export type {
  CommandOutcome,
  IdempotencyHelperDependencies,
  IdempotentAnswer,
  IdempotentCommand,
} from './idempotency/idempotency-helper.js';
export {
  IDEMPOTENCY_HELPER,
  IdempotencyModule,
  idempotencyModuleWith,
  REPLAY_SECRET_CHECK,
  RESTRICTED_VALUE_CIPHER,
} from './idempotency/idempotency.module.js';
export { KernelModule } from './kernel.module.js';
export { LOGGER, LoggingModule } from './logging/logging.module.js';
export { PinoLoggerService } from './logging/pino-logger.service.js';
export type { LogLevel, StructuredLogger } from './logging/pino-logger.service.js';
export { JOB_IDENTITIES } from './jobs/contracts.js';
export type { JobAuthority, JobIdentities } from './jobs/contracts.js';
export { JOB_SCHEMA, KEEP_EVERY_JOB, startJobQueue } from './jobs/job-queue.js';
export { checkRegistry, defineConsumer, defineJobKind } from './jobs/registry.js';
export type {
  ConsumerDefinition,
  ConsumerOutcome,
  DeliveredEvent,
  JobKindDefinition,
  JobRegistry,
  JobStepTools,
} from './jobs/registry.js';
export { WORKER_SETTINGS_VARIABLE, workerSettingsFromEnvironment } from './jobs/worker-settings.js';
export type { RetrySettings, WorkerSettings } from './jobs/worker-settings.js';
export { OUTBOX_AUTHORITY, OUTBOX_DELIVERY_QUEUE, OUTBOX_PROCESSOR_IDENTITY, Worker } from './jobs/worker.js';
export { WORKER, WORKER_ENVIRONMENT, WORKER_SETTINGS, workerModuleWith } from './jobs/worker.module.js';
export type { DeliveryData, StepResult, WorkerDependencies } from './jobs/worker.js';
export { defineEvent } from './outbox/event-definition.js';
export type { EventDefinition, EventScopeFacts, EventSubject, PublishedEvent } from './outbox/event-definition.js';
export { OrganisationRouter } from './routing/organisation-router.js';
export type { RoutedOrganisation, SessionRouting, SignInRouting } from './routing/organisation-router.js';
export {
  ORGANISATION_ROUTER,
  OrganisationRoutingModule,
  ROUTING_ENVIRONMENT,
} from './routing/organisation-routing.module.js';
export {
  DATABASE_POOL_MAX_VARIABLE,
  routingConfigFromEnvironment,
  RUNTIME_DATABASE_URL_VARIABLE,
} from './routing/routing-config.js';
export type { OrganisationRoutingConfig } from './routing/routing-config.js';
export {
  decodeSessionCookieValue,
  encodeSessionCookieValue,
  MIN_SESSION_IDENTIFIER_LENGTH,
} from './routing/session-cookie.js';
export type { SessionCookieParts } from './routing/session-cookie.js';
export { businessDateIn, isKnownTimezone } from './time/business-date.js';
export { systemClock } from './time/clock.js';
export type { Clock } from './time/clock.js';
export { timezoneNotConfigured } from './time/organisation-timezone.js';
export type { OrganisationTimezoneSource, TimezoneSetting } from './time/organisation-timezone.js';

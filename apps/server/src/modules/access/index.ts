// Public interface of the access module (module-map 4.3). Other code imports only from here.
export {
  ACCESS,
  ACCESS_ENVIRONMENT,
  AccessContractsModule,
  AccessJobIdentitiesModule,
  AccessModule,
  ORGANISATION_KEYS,
} from './access.module.js';
export { Access } from './access.js';
export type { AccessDependencies, AccessInterface, ActionNeed } from './access.js';
export type { Decider, Prepared, Preparer } from './commands/access-changes.js';
export type { FreshCode } from './commands/fresh-code.js';
export type { Revoker, RevocationTarget } from './commands/sessions.js';
export { sessionRevoked } from './events.js';
export type { Authorisation, AuthoriseRequest, FieldClassUse } from './queries/authorise.js';
export type { RecordFacts } from './domain/scope.js';
export { ACCESS_JOBS_IDENTITY, accessJobKinds } from './jobs/job-kinds.js';
export type { AuthenticatedServiceIdentity } from './queries/service-identities.js';
export { ORGANISATION_KEYS_VARIABLE } from './domain/organisation-keys.js';
export { SESSION_COOKIE_NAME } from './http/session-cookie.js';
export { runSetupStep, SetupRequestRefused } from './operator/setup-step.js';
export type { SetupStepOptions } from './operator/setup-step.js';
export { runRecovery } from './operator/recovery.js';
export type { RecoveryOptions, RecoveryOutcome, RecoveryRefusal } from './operator/recovery.js';
export type { Authority, ServiceIdentityGrant } from './commands/setup.js';
export { SETUP_IDENTITY } from './domain/first-roles.js';

// Public interface of the access module (module-map 4.3). Other code imports only from here.
export {
  ACCESS,
  ACCESS_ENVIRONMENT,
  AccessContractsModule,
  AccessJobIdentitiesModule,
  AccessModule,
  MODULE_APPROVALS,
  ORGANISATION_KEYS,
} from './access.module.js';
export { Access } from './access.js';
export type {
  AccessDependencies,
  AccessInterface,
  ActionNeed,
  ApprovalRequestRead,
  Decidable,
  DecidingActor,
  DecisionInput,
  DecisionOutcome,
  NewUser,
  PreparedWithCredential,
} from './access.js';
export type { Decider, EffectOptions, Prepared, Preparer } from './commands/access-changes.js';
export type { FreshCode, FreshCodeRefusal } from './commands/fresh-code.js';
export { freshCodeRefusal, takeFreshCode } from './commands/fresh-code.js';
export type { Revoker, RevocationTarget } from './commands/sessions.js';
export { approvalDecided, approvalRequested, assignmentChanged, sessionRevoked, standInChanged } from './events.js';
export type { BatchInput, BatchOutcome } from './commands/bulk.js';
export type { BatchItemInput } from './commands/decide.js';
export { accessApprovalRules } from './domain/approval-rules.js';
export type {
  ApprovalRule,
  DocumentEffect,
  EffectDecider,
  EffectOutcome,
  ModuleApprovals,
  ValueBasis,
} from './domain/approval-rules.js';
export type { LatestRequest } from './queries/access-records.js';
export type { PartyNames, RoleHeldQuestion } from './queries/parties.js';
export type { ApprovalCheck, ApprovalUseRecord, PostedDocument, PostingActor } from './commands/approval-use.js';
export type { ModuleApprovalRequest, RequestValue } from './commands/request-approval.js';
export type { Authorisation, AuthoriseRequest, FieldClassUse } from './queries/authorise.js';
export type { RecordFacts, UncoveredFact } from './domain/scope.js';
export { SCOPE_MEMBERS } from './contracts/scope-members.js';
export { DECISION_EVIDENCE, DECISION_EVIDENCE_KIND } from './contracts/decision-evidence.js';
export type { DecisionEvidence, DecisionEvidenceLink } from './contracts/decision-evidence.js';
export type {
  PlaceExpansion,
  ScopeMember,
  ScopeMembers,
  ScopeMemberType,
  SelectedPlace,
} from './contracts/scope-members.js';
export { ACCESS_JOBS_IDENTITY, accessJobKinds } from './jobs/job-kinds.js';
export type { AuthenticatedServiceIdentity } from './queries/service-identities.js';
export { ORGANISATION_KEYS_VARIABLE } from './domain/organisation-keys.js';
// The per-Organisation keys, for modules that encrypt before storing (stored files, imports-and-opening-data 11).
export type { OrganisationKeys, SealedValue } from './domain/organisation-keys.js';
export { SESSION_COOKIE_NAME } from './http/session-cookie.js';
// The signed-in user of a request, for the routes of modules that use access, such as My work (module-map 4.8).
export { SignedIn } from './http/authenticate.guard.js';
export type { SignedInUser } from './http/authenticate.guard.js';
export { missingSettingsRefusal, runSetupStep, SetupRequestRefused } from './operator/setup-step.js';
export type { SetupStepOptions } from './operator/setup-step.js';
export { runRecovery } from './operator/recovery.js';
export type { RecoveryOptions, RecoveryOutcome, RecoveryRefusal } from './operator/recovery.js';
export { runAddServiceIdentities } from './operator/add-service-identities.js';
export type {
  AddServiceIdentitiesOptions,
  AddServiceIdentitiesOutcome,
  DifferingIdentity,
} from './operator/add-service-identities.js';
export type { Authority, ServiceIdentityGrant } from './commands/setup.js';
export { SETUP_IDENTITY } from './domain/first-roles.js';

export { healthResponseSchema } from './health.js';
export type { HealthResponse } from './health.js';

export { Secret, secretRegistry, secretString, shownOnceSecret } from './secret.js';

export {
  businessDateSchema,
  displayNameSchema,
  idSchema,
  loginSchema,
  maybeKnownPaiseSchema,
  organisationCodeSchema,
  paiseSchema,
  personaIdSchema,
  personasHeldSchema,
  recordVersionRefSchema,
  totpCodeSchema,
} from './common.js';
export type { PersonaId, RecordVersionRef } from './common.js';

export {
  databaseNameSchema,
  setupFingerprintFieldsSchema,
  setupOutcomeSchema,
  setupRequestFileSchema,
  setupRequestSchema,
  setupSettingsSchema,
  setupUserSchema,
} from './setup.js';
export type {
  SetupFingerprintFields,
  SetupOutcome,
  SetupRequest,
  SetupRequestFile,
  SetupRequestInput,
  SetupSettings,
} from './setup.js';

export { passwordRulesSchema, sessionLimitsSchema, settingOriginSchema, signInThrottlingSchema } from './settings.js';
export type { PasswordRules, SessionLimits, SettingOrigin, SignInThrottling } from './settings.js';

export {
  enrolmentConfirmRequestSchema,
  enrolmentConfirmResponseSchema,
  enrolmentStartRequestSchema,
  enrolmentStartResponseSchema,
  passwordChangeRequestSchema,
  passwordChangeResponseSchema,
  sessionViewSchema,
  signInOutcomeSchema,
  signInRequestSchema,
  userCreateRequestSchema,
} from './sign-in.js';
export type { SessionView, SignInOutcome, SignInRequestInput, UserCreateRequestInput } from './sign-in.js';

export {
  credentialResetKindSchema,
  credentialResetRequestSchema,
  credentialResetResponseSchema,
  sessionRevocationRequestSchema,
  sessionRevocationResponseSchema,
  signOutRequestSchema,
  signOutResponseSchema,
  unlockRequestSchema,
  unlockResponseSchema,
} from './sessions.js';
export type { CredentialResetKind, CredentialResetRequestInput } from './sessions.js';

export { permissionRegistry, registryByCode } from './permissions.js';
export type { RecordTypeCode, RecordTypeDeclaration, ScopeFactsDeclared } from './permissions.js';

export {
  assignmentPreparedSchema,
  assignmentWithdrawalDraftSchema,
  grantSchema,
  rolePreparedSchema,
  roleVersionDraftSchema,
  withdrawalPreparedSchema,
  assignmentScopeSchema,
  fieldClassSchema,
  permissionActionSchema,
  permissionSchema,
  placeMemberSchema,
  recordTypeSchema,
  roleAssignmentDraftSchema,
  roleDraftSchema,
  scopeGrantsNothing,
} from './roles.js';
export type {
  AssignmentWithdrawalDraft,
  GrantView,
  RoleVersionDraft,
  AssignmentScope,
  FieldClass,
  Permission,
  PermissionAction,
  RoleAssignmentDraft,
  RoleDraft,
} from './roles.js';

export {
  approvalRequestStateSchema,
  approvalRequestViewSchema,
  approvalValueSchema,
  decisionReasonSchema,
  decisionRefusalSchema,
  decisionRequestSchema,
  moneyBasisSchema,
} from './approvals.js';
export type { ApprovalRequestView, ApprovalValue, DecisionRefusal, DecisionRequest } from './approvals.js';

export { dueSchema, exposureSchema, workItemSchema } from './work-item.js';
export type { Exposure, WorkItem } from './work-item.js';

export {
  errorCodes,
  errorCodeSchema,
  errorEnvelopeSchema,
  errorKindOf,
  errorKinds,
  errorKindSchema,
  accessCodes,
  accessRoleCodes,
  accessSessionCodes,
  issueSchema,
  kernelCodes,
  missingItemSchema,
  statusOfKind,
} from './errors.js';
export type { ErrorBody, ErrorCode, ErrorEnvelope, ErrorKind, Issue, MissingItem } from './errors.js';

export { CORRELATION_ID_HEADER, IDEMPOTENCY_KEY_HEADER, IDEMPOTENT_REPLAYED_HEADER } from './headers.js';

export { codesOfRoute, defineRoute, needsIdempotencyKey, routes } from './route-table.js';
export type {
  CommandRoute,
  ReadRoute,
  RestrictedFieldDeclaration,
  Route,
  RouteAccess,
  RouteTable,
  SecretFieldDeclaration,
  SignInStep,
} from './route-table.js';

export { openApiDocument, openApiText } from './openapi.js';

export { ApiContractError, createApiClient } from './client.js';
export type { ApiClient, ApiClientOptions, CallInput, CallResult } from './client.js';

export {
  accessHistoryEntrySchema,
  accessHistoryPageSchema,
  accessHistoryQuerySchema,
  actorHistoryQuerySchema,
  auditHistoryEntrySchema,
  auditHistoryPageSchema,
  HISTORY_PAGE_CAP,
  historyActorSchema,
  historyChangeSchema,
  historyCursorSchema,
  recordHistoryQuerySchema,
} from './history.js';
export type {
  AccessHistoryEntry,
  AccessHistoryPage,
  AuditHistoryEntry,
  AuditHistoryPage,
  HistoryActor,
  HistoryChange,
} from './history.js';

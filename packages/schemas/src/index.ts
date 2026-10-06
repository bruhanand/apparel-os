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
  setupFingerprintFieldsSchema,
  setupOutcomeSchema,
  setupRequestSchema,
  setupSettingsSchema,
  setupUserSchema,
} from './setup.js';
export type { SetupFingerprintFields, SetupOutcome, SetupRequest, SetupRequestInput } from './setup.js';

export {
  enrolmentConfirmRequestSchema,
  enrolmentStartResponseSchema,
  passwordChangeRequestSchema,
  signInOutcomeSchema,
  signInRefusal,
  signInRequestSchema,
  userCreateRequestSchema,
} from './sign-in.js';
export type { SignInOutcome, SignInRefusal, SignInRequestInput, UserCreateRequestInput } from './sign-in.js';

export {
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
} from './route-table.js';

export { openApiDocument, openApiText } from './openapi.js';

export { ApiContractError, createApiClient } from './client.js';
export type { ApiClient, ApiClientOptions, CallInput, CallResult } from './client.js';

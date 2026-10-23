import { z } from 'zod';
import { errorCodes, type ErrorCode } from './errors.js';
import { healthResponseSchema } from './health.js';
import {
  grnPtReadSchema,
  PT_TYPE,
  ptDownloadSchema,
  ptPreviewQuerySchema,
  ptPreviewSchema,
  ptRevisionParamsSchema,
  ptRevisionReadSchema,
  ptReversalDraftSchema,
  ptReversalParamsSchema,
  ptReversalProposedSchema,
  ptReversalReadSchema,
  ptTemplateQuerySchema,
  ptTemplateSchema,
  ptWithdrawalSchema,
  ptWithdrawnSchema,
} from './pt.js';
import {
  BOOKING_DRAFT_BODY_LIMIT_BYTES,
  BOOKING_TYPE,
  bookingAmendmentProposedSchema,
  bookingCancellationDraftSchema,
  bookingConfirmationDraftSchema,
  bookingDocumentsAttachedSchema,
  bookingDocumentsDraftSchema,
  bookingDraftChangeSchema,
  bookingDraftSchema,
  bookingExtensionDraftSchema,
  bookingIssueDraftSchema,
  bookingListSchema,
  bookingPageQuerySchema,
  bookingReadSchema,
  bookingRecordedSchema,
  bookingSavedSchema,
  bookingSubmissionSchema,
  bookingSubmittedSchema,
  OPEN_TO_BUY_BUDGET_TYPE,
  openToBuyBudgetDraftSchema,
  openToBuyBudgetListSchema,
  openToBuyBudgetPageQuerySchema,
  openToBuyBudgetPreparedSchema,
  openToBuyBudgetReadSchema,
  openToBuyBudgetVersionDraftSchema,
} from './booking.js';
import {
  ARRIVAL_TYPE,
  GRN_TYPE,
  arrivalDraftSchema,
  arrivalReadSchema,
  arrivalRecordedSchema,
  countLineDraftSchema,
  countLineRemovalSchema,
  countLineSavedSchema,
  grnBookingLinkedSchema,
  grnBookingLinksDraftSchema,
  grnIssueSchema,
  grnIssuedSchema,
  grnParamsSchema,
  HELD_LINE_TYPE,
  heldLineParamsSchema,
  heldLineProductDraftSchema,
  heldLineProductNamedSchema,
  heldLineReadSchema,
  inboxParamsSchema,
  inboxQuerySchema,
  inboxSchema,
  invoiceDraftSchema,
  invoiceRecordedSchema,
  photosAttachedSchema,
  photosDraftSchema,
  RECOUNT_TYPE,
  recountDraftSchema,
  recountParamsSchema,
  recountProposedSchema,
  recountReadSchema,
  SCAN_TYPE,
  scanAnsweredSchema,
  scanDraftSchema,
  scanInQuerySchema,
  scanInReadSchema,
} from './receiving.js';
import {
  DAMAGE_REPORT_TYPE,
  DAMAGE_REVERSAL_TYPE,
  damageDecisionRenewalSchema,
  damageDecisionRenewedSchema,
  damageReportDraftSchema,
  damageReportedSchema,
  damageReportReadSchema,
  damageReversalDraftSchema,
  damageReversalProposedSchema,
} from './damage.js';
import {
  demoSignInListSchema,
  demoSignInRequestSchema,
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
import {
  billingDeviceDraftSchema,
  billingDeviceListSchema,
  billingDeviceRegisteredSchema,
  billingDeviceEndedSchema,
  billingDeviceEndingRequestSchema,
  billingDeviceReplacedSchema,
  billingDeviceReplacementSchema,
  billingDeviceUnitChangeSchema,
  billingDeviceUnitsChangedSchema,
  billFormatDraftSchema,
  billFormatReadSchema,
  financialYearDraftSchema,
  financialYearListSchema,
  numberingChangePreparedSchema,
  numberingChangeWithdrawnSchema,
  deviceChallengeRequestSchema,
  deviceChallengeSchema,
  deviceEnrolledSchema,
  deviceEnrolmentSchema,
} from './devices.js';
import { idSchema, setupPageQuerySchema, totpCodeSchema } from './common.js';
import {
  credentialResetRequestSchema,
  credentialResetResponseSchema,
  sessionRevocationRequestSchema,
  sessionRevocationResponseSchema,
  signOutRequestSchema,
  signOutResponseSchema,
  unlockRequestSchema,
  unlockResponseSchema,
} from './sessions.js';
import {
  assignmentPreparedSchema,
  assignmentWithdrawalDraftSchema,
  roleAssignmentDraftSchema,
  roleDraftSchema,
  rolePreparedSchema,
  roleVersionDraftSchema,
  withdrawalPreparedSchema,
  type FieldClass,
  type PermissionAction,
} from './roles.js';
import { secretRegistry } from './secret.js';
import {
  taxRuleCaEvidenceDraftSchema,
  goodsClassificationDraftSchema,
  goodsClassificationVersionDraftSchema,
  priceBasisDraftSchema,
  registrationApplicabilityDraftSchema,
  roundingRuleDraftSchema,
  taxRateRuleDraftSchema,
  taxRuleChangedSchema,
  taxRuleKindSchema,
  taxRuleRecordListSchema,
  taxRuleRecordReadSchema,
  taxRulesQuerySchema,
  taxRulesReadSchema,
} from './tax-rules.js';
import {
  approvalLimitDraftSchema,
  approvalLimitPreparedSchema,
  approvalReasonDraftSchema,
  approvalReasonPreparedSchema,
  approvalReasonsInForceSchema,
  approvalReasonVersionDraftSchema,
  approvalRequestViewSchema,
  approvalRuleSettingDraftSchema,
  approvalRuleSettingPreparedSchema,
  approvalRuleSettingVersionDraftSchema,
  bulkDecisionAnswerSchema,
  bulkDecisionRequestSchema,
  decisionAnswerSchema,
  decisionRequestSchema,
  standInGrantDraftSchema,
  standInGrantListSchema,
  standInGrantPreparedSchema,
  userPreparedSchema,
  userVersionDraftSchema,
} from './approvals.js';
import {
  myWorkSchema,
  workItemRoutingDraftSchema,
  workItemRoutingListSchema,
  workItemRoutingPreparedSchema,
} from './work-item.js';
import { backupStatusSchema, failedJobListSchema, failedJobPageQuerySchema, liveMessageSchema } from './operations.js';
import {
  commentRequestSchema,
  exceptionChangedSchema,
  exceptionEvidenceAddedSchema,
  exceptionEvidenceRequestSchema,
  exceptionParamsSchema,
  exceptionViewSchema,
  noBodySchema,
  openExceptionsSchema,
  raisedSchema,
  raiseRequestSchema,
  reassignRequestSchema,
  recoveryGapSettlementSchema,
  routingListSchema,
  routingVersionDraftSchema,
  routingVersionPreparedSchema,
} from './exceptions.js';
import { attachedFileSchema, storedFileSchema, storeFileRequestSchema, STORE_FILE_BODY_LIMIT_BYTES } from './files.js';
import {
  COMPARISON_RUN_TYPE,
  comparisonRunListQuerySchema,
  comparisonRunListSchema,
  comparisonRunReadSchema,
  comparisonRunStartedSchema,
  runComparisonRequestSchema,
  detectLayoutQuerySchema,
  documentExclusionRequestSchema,
  IMPORT_BATCH_TYPE,
  IMPORT_LAYOUT_TYPE,
  IMPORT_MAPPING_TYPE,
  importBatchChangedSchema,
  importBatchReadSchema,
  importFileStoredSchema,
  importLayoutListSchema,
  importOutcomesQuerySchema,
  importOutcomesSchema,
  importPublishedSchema,
  importStartedSchema,
  importSubmittedSchema,
  submitImportRequestSchema,
  importValidatedSchema,
  issuesSeenRequestSchema,
  issuesSeenSchema,
  layoutDetectionSchema,
  layoutProposalSchema,
  layoutProposedSchema,
  MAPPING_RULE_TYPE,
  mappingProposalSchema,
  mappingProposedSchema,
  mappingRuleListSchema,
  mappingRuleProposalSchema,
  mappingRuleProposedSchema,
  publishImportRequestSchema,
  stagedValueEnteredSchema,
  stagedValueEntryRequestSchema,
  startImportRequestSchema,
  valueSuggestionsQuerySchema,
  valueSuggestionsSchema,
  withdrawImportRequestSchema,
} from './imports.js';
import {
  securitySettingPreparedSchema,
  securitySettingsSchema,
  securitySettingVersionDraftSchema,
} from './security-settings.js';
import {
  approvalLimitListSchema,
  assignmentListSchema,
  reasonListSchema,
  roleListSchema,
  userListSchema,
} from './access-records.js';
import {
  accessHistoryPageSchema,
  accessHistoryQuerySchema,
  actorHistoryQuerySchema,
  auditHistoryPageSchema,
  recordHistoryQuerySchema,
} from './history.js';

import {
  accountingBookDraftSchema,
  accountingBookListSchema,
  accountingBookReadSchema,
  areaDraftSchema,
  areaListSchema,
  areaReadSchema,
  cityDraftSchema,
  cityListSchema,
  cityReadSchema,
  countryDraftSchema,
  countryListSchema,
  countryReadSchema,
  classificationKindDraftSchema,
  classificationKindListSchema,
  classificationKindReadSchema,
  classificationValueDraftSchema,
  classificationValueListSchema,
  classificationValueReadSchema,
  groupingKindDraftSchema,
  groupingKindListSchema,
  groupingKindReadSchema,
  groupingDraftSchema,
  groupingListSchema,
  groupingReadSchema,
  groupingVersionDraftSchema,
  legalEntityDraftSchema,
  legalEntityListSchema,
  legalEntityReadSchema,
  legalEntityVersionDraftSchema,
  masterListsQuerySchema,
  masterPageQuerySchema,
  masterListsSchema,
  masterPreparedSchema,
  nameVersionDraftSchema,
  siteDraftSchema,
  siteListSchema,
  siteReadSchema,
  siteVersionDraftSchema,
  stateDraftSchema,
  stateListSchema,
  stateReadSchema,
  storeDraftSchema,
  storeListSchema,
  storeReadSchema,
  storeVersionDraftSchema,
  taxRegistrationDraftSchema,
  taxRegistrationListSchema,
  taxRegistrationReadSchema,
  taxRegistrationVersionDraftSchema,
  businessUnitDraftSchema,
  businessUnitListSchema,
  businessUnitMappingListSchema,
  businessUnitMappingReadSchema,
  businessUnitMappingVersionDraftSchema,
  businessUnitReadSchema,
  businessUnitVersionDraftSchema,
  locationDraftSchema,
  locationListSchema,
  locationReadSchema,
  locationVersionDraftSchema,
  mappingVerificationRequestSchema,
  mappingVerifiedSchema,
  storeDefaultWarehouseListSchema,
  storeDefaultWarehouseReadSchema,
  storeDefaultWarehouseVersionDraftSchema,
} from './organisation.js';
import {
  attributeDraftSchema,
  attributeListSchema,
  attributeReadSchema,
  brandDraftSchema,
  brandListSchema,
  brandReadSchema,
  brandVersionDraftSchema,
  businessUnitBrandListSchema,
  businessUnitBrandReadSchema,
  businessUnitBrandVersionDraftSchema,
  catalogueChangedSchema,
  catalogueNameVersionDraftSchema,
  categoryDraftSchema,
  categoryListSchema,
  categoryReadSchema,
  categoryVersionDraftSchema,
  sizeSetDraftSchema,
  sizeSetListSchema,
  sizeSetReadSchema,
  sizeSetVersionDraftSchema,
  vocabularyProposalDraftSchema,
  vocabularyProposalListSchema,
  vocabularyProposalReadSchema,
  vocabularyProposedSchema,
  vocabularyValueListSchema,
  vocabularyValueReadSchema,
  trackingProfileDraftSchema,
  trackingProfileListSchema,
  trackingProfileReadSchema,
  trackingProfileVersionDraftSchema,
  categoryTrackingProfileListSchema,
  categoryTrackingProfileReadSchema,
  categoryTrackingProfileVersionDraftSchema,
  styleListSchema,
  styleReadSchema,
  styleVersionDraftSchema,
  skuListSchema,
  skuReadSchema,
  skuVersionDraftSchema,
  packDraftSchema,
  packListSchema,
  packReadSchema,
  packVersionDraftSchema,
} from './catalogue.js';
import {
  attributeMarkSchema,
  MARKED_ATTRIBUTE_TYPE,
  markedAttributeListSchema,
  markedAttributePreparedSchema,
  markedAttributeVersionDraftSchema,
  markedAttributeVersionListSchema,
  markedAttributeVersionPageQuerySchema,
  markedAttributeVersionReadSchema,
} from './marked-attributes.js';
import {
  codeMappedSchema,
  codeMappingDraftSchema,
  codeMappingEndSchema,
  codeMappingListQuerySchema,
  codeMappingListSchema,
  productProposalDraftSchema,
  productProposalListSchema,
  productProposalReadSchema,
  productProposedSchema,
  resolveCodeAnswerSchema,
  resolveCodeQuerySchema,
  skuAsOfAnswerSchema,
  skuAsOfQuerySchema,
} from './products.js';
import {
  accountDraftSchema,
  accountListSchema,
  accountReadSchema,
  accountVersionDraftSchema,
  bookSettingDraftSchema,
  bookSettingListSchema,
  caEvidenceDraftSchema,
  caEvidenceRecordedSchema,
  costSettingQuerySchema,
  costSettingReadSchema,
  financeChangedSchema,
} from './books.js';
import {
  ledgerQuerySchema,
  ledgerSchema,
  periodDefinedSchema,
  periodDraftSchema,
  periodCloseSchema,
  periodLockedSchema,
  reopeningDraftSchema,
  reopeningReadSchema,
  reopeningRequestedSchema,
  reopeningWithdrawnSchema,
  periodListSchema,
  postingMapDraftSchema,
  postingMapListSchema,
  postingMapQuerySchema,
  trialBalanceQuerySchema,
  trialBalanceSchema,
} from './posting.js';
import {
  agreementDraftSchema,
  agreementListSchema,
  agreementReadSchema,
  agreementVersionDraftSchema,
  bankDetailsDraftSchema,
  bankDetailsShowRequestSchema,
  bankDetailsShownSchema,
  brandSupplierLinkDraftSchema,
  brandSupplierLinkListSchema,
  partyChangedSchema,
  partyDraftSchema,
  partyListSchema,
  partyReadSchema,
  partyRoleVersionDraftSchema,
  partyVersionDraftSchema,
  termsInForceQuerySchema,
  termsInForceSchema,
} from './parties.js';
import {
  availabilityQuerySchema,
  availabilitySchema,
  capabilityParamSchema,
  capabilitySwitchedSchema,
  capabilitySwitchSchema,
  policyNumberParamSchema,
  policyReadinessSchema,
  policySignatureDraftSchema,
  policySignatureRecordedSchema,
  policyValidationDraftSchema,
  policyValidationRecordedSchema,
} from './policy-readiness.js';
import {
  recoveryReopenedSchema,
  recoveryReopeningDraftSchema,
  recoveryStatusSchema,
  recoveryValidationDraftSchema,
  recoveryValidationRecordedSchema,
  seriesParamSchema,
  seriesReconciledSchema,
  seriesReconciliationDraftSchema,
} from './recovery.js';
import {
  activationRequestedSchema,
  readinessRanSchema,
  readinessRecordParamsSchema,
  readinessRecordReadSchema,
  siteActivityParamsSchema,
  unitActivityParamsSchema,
  unitParamsSchema,
  unitReadinessSchema,
  zeroStockDeclarationRequestSchema,
  zeroStockDeclaredSchema,
} from './site-lifecycle.js';

// The route table (code-house-rules 12.1, 12.2). The server, the web app's typed client and the OpenAPI document are
// all made from it, so they cannot drift apart (PRD Stack: API).

/**
 * Who may call a route (code-house-rules 12.1 "Access on every route"; access-and-approvals 7.1). `public`: sign-in
 * and the health check only, no session. `own`: a signed-in user's own credentials and sessions, Authenticate only.
 * `action`: Authenticate, Available and Authorise for that action on that record type (PRD-INT-001, PRD-SEC-005).
 * `decision`: Authenticate, then Authorise in the command on the decided request's record type (9.3). My work is an
 * `own` read: every signed-in user has it, with no permission (access-and-approvals 9.11, 11.2). So are the master
 * lists, which show only the masters the reader may view and name the others (structure-and-masters 3.8; product owner,
 * 8 Oct 2026).
 */
export type RouteAccess =
  | { readonly kind: 'public' }
  | {
      readonly kind: 'own';
      readonly signInStep?: SignInStep;
      /**
       * Reached by a locked session too, and before first sign-in is done: only the unlock and the sign-out
       * (access-and-approvals 3.3; S1-F01-T09). Every other route answers a locked session `access.session-locked`.
       */
      readonly whileLocked?: true;
      /**
       * Authenticated without counting as the session's activity, so it never keeps an idle session from locking: the
       * live-update stream, which reconnects on its own (access-and-approvals 3.3; code-house-rules 12.12; S1-F08-T04).
       */
      readonly passive?: true;
    }
  | {
      readonly kind: 'action';
      readonly action: PermissionAction;
      readonly recordType: string;
      /**
       * `command`: the record type carries scope facts, so the guard Authenticates only and the command runs
       * Authorise with each record's facts (access-and-approvals 5.3, 7.1 step 3; RR-296). Any other route on such a
       * type is a defect.
       */
      readonly authorisedIn?: 'command';
    }
  /**
   * Deciding an approval request (access-and-approvals 7.1 step 3, 9.3): the guard Authenticates only, and the
   * command authorises approve on the record type of the request it decides, with its facts, once it has read the
   * request (S1-F01-T13). A stand-in grant arrives with S1-F05.
   */
  | { readonly kind: 'decision' }
  /**
   * Reading a file through the record it is attached to (imports-and-opening-data 11, 13.1; S1-F06-T05): the guard
   * Authenticates only, and the command authorises view on the attached record's own type with its scope facts and
   * every restricted class the attachment carries, once it has read the attachment. Out of scope reads as not found.
   */
  | { readonly kind: 'attached-record' };

/**
 * A step of first sign-in, or of sign-in after a reset (access-and-approvals 3.2, 7.1 step 1). Until each is done, a
 * session reaches only the `own` routes of the first step still to do: enrolment, then the password change.
 */
export type SignInStep = 'enrolment' | 'password-change';

/**
 * A secret field of a command's body (code-house-rules 12.4, 12.5; access-and-approvals 3.2). It never enters the
 * idempotency hash, a kept request or a log in any form; only its name does (PRD-SEC-014). A path is the property
 * names from the top of the body, with no list wildcard.
 *
 * - `authenticator-code`: proves presence and is not content, so a replay is never compared on it (CH-8).
 * - `new-secret`: a password or temporary password the request sets, parsed by secretString() into a `Secret`.
 * - `presented-secret`: the password a person presents to sign in or to unlock a locked session, parsed by
 *   secretString(). Sign-in, a `public` route, carries no key (12.4); the unlock, an `own` route, carries one, and the
 *   password proves presence there as a code does, so a replay is never compared on it (12.5; S1-F01-T09).
 */
export interface SecretFieldDeclaration {
  readonly path: readonly string[];
  readonly kind: 'authenticator-code' | 'new-secret' | 'presented-secret';
}

/**
 * A field of a restricted field class (access-and-approvals 6). A kept refused request holds its value only
 * encrypted (code-house-rules 12.4). A `*` in its path stands for every element of a list.
 */
export interface RestrictedFieldDeclaration {
  readonly path: readonly string[];
  readonly fieldClass: FieldClass;
}

type ObjectSchema = z.ZodObject;

interface RouteBase {
  /** The full path, `/api/…`, with each path parameter as `{name}`. After `/api`, the unit that owns it. */
  readonly path: string;
  readonly params?: ObjectSchema;
  readonly query?: ObjectSchema;
  /** The success answer, encoded through this schema by the server and decoded by the client. */
  readonly response: z.ZodType;
  readonly access: RouteAccess;
  /** The route's own refusal codes; the shared ones of codesOfRoute come beside them. */
  readonly codes: readonly ErrorCode[];
}

/** A read: `GET`, never changes a record (code-house-rules 12.1). */
export interface ReadRoute extends RouteBase {
  readonly method: 'GET';
  readonly command: false;
  /**
   * `event-stream`: the answer is a `text/event-stream` (code-house-rules 12.12), each message's data encoded through
   * `response`, written by the handler itself; the route's refusals before the stream opens use the one envelope.
   */
  readonly stream?: 'event-stream';
}

/**
 * A command: `POST`, exactly one command of code-house-rules 8.1. Every command carries an `Idempotency-Key`, except
 * the one public command, sign-in (12.4). Its secret and restricted fields are stated, each list even when empty, and
 * whether its answer shows a secret or a restricted value unmasked, which is then never repeated (12.6).
 */
export interface CommandRoute extends RouteBase {
  readonly method: 'POST';
  readonly command: true;
  readonly body: z.ZodType;
  readonly secretFields: readonly SecretFieldDeclaration[];
  readonly restrictedFields: readonly RestrictedFieldDeclaration[];
  readonly shows: 'nothing' | 'secret' | 'restricted-value';
  /**
   * The most the request body may hold in bytes, where the body parser's ordinary limit is too small, as for a file
   * (imports-and-opening-data 9.3). Left out, the ordinary limit holds.
   */
  readonly bodyLimitBytes?: number;
}

export type Route = ReadRoute | CommandRoute;

const PATH = /^\/api(\/(?:[a-z0-9-]+|\{[a-zA-Z][a-zA-Z0-9]*\}))+$/;

/**
 * Declares one route and checks what can be checked before any request: the path is under `/api` and names exactly
 * the parameters its schema names, and every secret in a command's body is declared as one.
 */
export function defineRoute<const R extends Route>(route: R): R {
  if (!PATH.test(route.path)) throw new Error(`Route path ${route.path} is not /api/… in lower-case words`);
  const inPath = [...route.path.matchAll(/\{([a-zA-Z0-9]+)\}/g)].map((match) => match[1]).sort();
  const inSchema = Object.keys(route.params?.shape ?? {}).sort();
  if (JSON.stringify(inPath) !== JSON.stringify(inSchema)) {
    throw new Error(`Route ${route.path} names path parameters its schema does not, or the other way round`);
  }
  for (const code of route.codes) {
    if (!(code in errorCodes)) throw new Error(`Route ${route.path} lists an undeclared code ${code}`);
  }
  if (route.command) checkSecretFields(route);
  return route;
}

/** Whether a route needs the `Idempotency-Key` header: every command but the public one, sign-in (12.4). */
export function needsIdempotencyKey(route: Route): boolean {
  return route.command && route.access.kind !== 'public';
}

const READ_CODES: readonly ErrorCode[] = ['kernel.invalid-request', 'kernel.timed-out', 'kernel.failed'];
const KEYED_CODES: readonly ErrorCode[] = [
  'kernel.idempotency-key-required',
  'kernel.idempotency-key-reused',
  'kernel.request-in-progress',
  'kernel.outcome-unknown',
];

/** Every code a route can answer: the shared ones its kind brings, and its own (code-house-rules 12.2, 12.3). */
export function codesOfRoute(route: Route): ErrorCode[] {
  const codes = new Set<ErrorCode>([...READ_CODES, ...route.codes]);
  if (needsIdempotencyKey(route)) {
    for (const code of KEYED_CODES) codes.add(code);
    // Every command but those that run while a restored Organisation is held is refused with it (backup-and-restore
    // 4.3; S1-F14-T03); which run is the command runner's, by name, so every keyed command lists it.
    codes.add('kernel.recovery-hold');
    if (route.command && route.secretFields.some((field) => field.kind === 'new-secret')) {
      codes.add('kernel.secret-not-comparable');
    }
    if (route.command && route.shows !== 'nothing') codes.add('kernel.answer-not-repeatable');
  }
  return [...codes].sort();
}

function checkSecretFields(route: CommandRoute): void {
  const registered = new Set(registeredSecretPaths(route.body, []).map((path) => path.join('.')));
  const declared = new Map(route.secretFields.map((field) => [field.path.join('.'), field.kind]));
  for (const path of registered) {
    if (!declared.has(path)) throw new Error(`Route ${route.path} does not declare its secret field ${path}`);
  }
  for (const [path, kind] of declared) {
    if ((kind === 'new-secret' || kind === 'presented-secret') && !registered.has(path)) {
      throw new Error(`Route ${route.path}: secret ${path} must be a secretString()`);
    }
    if (kind === 'presented-secret' && (route.access.kind === 'action' || route.access.kind === 'decision')) {
      throw new Error(`Route ${route.path}: only sign-in and the unlock present a secret`);
    }
  }
}

/** The paths of the schemas registered as secrets within a body schema, through objects and optional fields. */
function registeredSecretPaths(schema: z.ZodType, at: readonly string[]): string[][] {
  if (secretRegistry.has(schema)) return [[...at]];
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return registeredSecretPaths(schema.unwrap() as z.ZodType, at);
  }
  if (schema instanceof z.ZodObject) {
    return Object.entries(schema.shape).flatMap(([key, value]) =>
      registeredSecretPaths(value as z.ZodType, [...at, key]),
    );
  }
  return [];
}

/** The codes every route that prepares an access change can answer (access-and-approvals 7.1, 9.11). */
const PREPARE_CODES = [
  'access.not-signed-in',
  'access.session-locked',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
  'access.starts-in-past',
  'kernel.cross-site-request',
] as const satisfies readonly ErrorCode[];

/**
 * The codes of every read of a workbook (imports-and-opening-data 9.3; S1-F06-T02): at intake, and whenever the stored
 * file is read again under the caps in force.
 */
const WORKBOOK_READ_CODES = [
  'files-imports.file-unreadable',
  'files-imports.over-intake-cap',
  'files-imports.workbook-active-content',
  'files-imports.workbook-depends-on-another',
  'files-imports.workbook-unapproved-link',
] as const satisfies readonly ErrorCode[];

/** The codes every read of access records and history can answer (access-and-approvals 7.1). */
const HISTORY_CODES = [
  'access.not-signed-in',
  'access.session-locked',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
] as const satisfies readonly ErrorCode[];

/** The codes a policy-status command can answer (module-map 4.4; DM-6; code-house-rules 12.14; S1-F04-T01). */
const POLICY_STATUS_CODES = [
  ...PREPARE_CODES,
  'configuration.origin-not-allowed',
] as const satisfies readonly ErrorCode[];

/** The codes a readiness read or command can answer (module-map 4.16; S1-F04-T02). */
const READINESS_CODES = [...HISTORY_CODES, 'site-lifecycle.unit-not-found'] as const satisfies readonly ErrorCode[];
const READINESS_COMMAND_CODES = [
  ...READINESS_CODES,
  'kernel.cross-site-request',
] as const satisfies readonly ErrorCode[];

/** The codes a read of an exception can answer (access-and-approvals 12, 14; S1-F08-T02). */
const EXCEPTION_READ_CODES = [
  ...HISTORY_CODES,
  'exceptions.exception-not-found',
] as const satisfies readonly ErrorCode[];

/** The codes an action on an exception can answer: the reads', and its lifecycle's (12.3). */
const EXCEPTION_ACTION_CODES = [
  ...EXCEPTION_READ_CODES,
  'exceptions.not-open',
  'exceptions.not-closed',
  'exceptions.already-owner',
  'exceptions.party-not-found',
  'exceptions.resolution-not-verified',
] as const satisfies readonly ErrorCode[];

/** The codes a read of one organisation master can answer: the reads' own, and a record that does not exist. */
const ORGANISATION_READ_CODES = [
  ...HISTORY_CODES,
  'organisation.record-not-found',
] as const satisfies readonly ErrorCode[];

/** The codes every preparation of an organisation master can answer (structure-and-masters 2.1, 2.2, 3.8). */
const ORGANISATION_PREPARE_CODES = [
  'access.not-signed-in',
  'access.session-locked',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
  'kernel.cross-site-request',
  'organisation.code-taken',
  'organisation.record-not-found',
  'organisation.starts-in-past',
] as const satisfies readonly ErrorCode[];

/**
 * The codes of the rules of business units, mappings, locations and default warehouses (structure-and-masters 3.3 to
 * 3.6; S1-F02-T02), answered when a change is prepared and again when it is approved under its locks.
 */
const ORGANISATION_STRUCTURE_RULE_CODES = [
  'organisation.mapping-legal-entity-mismatch',
  'organisation.registration-in-another-state',
  'organisation.mapping-out-of-step',
  'organisation.unit-without-mapping',
  'organisation.whole-store-unit-exists',
  'organisation.store-at-another-site',
  'organisation.not-a-warehouse',
  'organisation.location-unit-at-another-site',
  'organisation.location-in-use-unanswered',
  'organisation.location-holds-stock',
] as const satisfies readonly ErrorCode[];

/**
 * The codes a preparation of a Site or Store can answer: a classification of the other's kind, or two of one kind
 * (3.1; S1-F02-T04; product owner, 9 Oct 2026).
 */
const ORGANISATION_PLACE_PREPARE_CODES = [
  ...ORGANISATION_PREPARE_CODES,
  'organisation.classification-of-another-kind',
  'organisation.classification-kind-twice',
] as const satisfies readonly ErrorCode[];

/** The codes a preparation of a unit, a mapping, a location or a default warehouse can answer. */
const ORGANISATION_UNIT_PREPARE_CODES = [
  ...ORGANISATION_PREPARE_CODES,
  ...ORGANISATION_STRUCTURE_RULE_CODES,
] as const satisfies readonly ErrorCode[];

/**
 * The codes a preparation of a unit or a mapping can answer: those of 3.3 to 3.6, and a mapping's origin this
 * environment does not accept (code-house-rules 12.14; 3.4 "As built"; RR-558).
 */
const ORGANISATION_MAPPING_PREPARE_CODES = [
  ...ORGANISATION_UNIT_PREPARE_CODES,
  'configuration.origin-not-allowed',
] as const satisfies readonly ErrorCode[];

/** The codes a read of one catalogue master can answer (structure-and-masters 4.7; S1-F03-T01). */
const CATALOGUE_READ_CODES = [...HISTORY_CODES, 'merchandise.record-not-found'] as const satisfies readonly ErrorCode[];

/**
 * The codes every catalogue change can answer (structure-and-masters 2, 3.3, 4.1, 4.7): the code, the dates, the
 * records it names, the rules of 4.1 and brand coverage, and a stale version token (code-house-rules 12.7).
 */
const CATALOGUE_CHANGE_CODES = [
  'access.not-signed-in',
  'access.session-locked',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
  'kernel.cross-site-request',
  'kernel.stale-version',
  'merchandise.code-taken',
  'merchandise.record-not-found',
  'merchandise.starts-in-past',
  'merchandise.version-overlaps',
  'merchandise.reference-not-in-force',
  'merchandise.parent-cycle',
  'merchandise.size-set-of-another-category',
  'merchandise.office-unit-has-no-brand',
  'merchandise.brand-counter-one-brand',
  // Styles, SKUs, packs and tracking profiles (4.1, 4.4 to 4.6; S1-F03-T02).
  'merchandise.value-not-in-vocabulary',
  'merchandise.stock-recorded',
  'merchandise.labelling-count-not-planned',
  'merchandise.stock-presence-unanswered',
  'merchandise.pieces-held',
] as const satisfies readonly ErrorCode[];

/**
 * The codes a tracking profile change can answer: a catalogue change's, and a version's origin this environment does
 * not accept (code-house-rules 12.14; 4.6 "As built"; RR-558).
 */
const TRACKING_PROFILE_CHANGE_CODES = [
  ...CATALOGUE_CHANGE_CODES,
  'configuration.origin-not-allowed',
] as const satisfies readonly ErrorCode[];

/** The codes proposing a product can answer (4.2; S1-F03-T02), and its confirmation under the proposal's lock. */
const PRODUCT_RULE_CODES = [
  'merchandise.code-taken',
  'merchandise.record-not-found',
  'merchandise.reference-not-in-force',
  'merchandise.value-not-in-vocabulary',
  'merchandise.not-an-identity-attribute',
  'merchandise.size-not-in-size-set',
  'merchandise.sku-exists',
] as const satisfies readonly ErrorCode[];
const PRODUCT_PROPOSE_CODES = [
  'access.not-signed-in',
  'access.session-locked',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
  'kernel.cross-site-request',
  ...PRODUCT_RULE_CODES,
] as const satisfies readonly ErrorCode[];

/** The codes mapping a code or ending a mapping can answer (4.3; S1-F03-T02). */
const CODE_MAPPING_CODES = [
  'access.not-signed-in',
  'access.session-locked',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
  'kernel.cross-site-request',
  'merchandise.record-not-found',
  'merchandise.starts-in-past',
  'merchandise.reference-not-in-force',
  'merchandise.party-not-supplier',
  'merchandise.pack-of-another-sku',
  'merchandise.code-conflict',
  'merchandise.end-not-allowed',
] as const satisfies readonly ErrorCode[];

/** The codes proposing a vocabulary value can answer (4.2). */
const CATALOGUE_PROPOSE_CODES = [
  'access.not-signed-in',
  'access.session-locked',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
  'kernel.cross-site-request',
  'merchandise.code-taken',
  'merchandise.record-not-found',
  'merchandise.reference-not-in-force',
  'merchandise.attribute-not-list',
] as const satisfies readonly ErrorCode[];

/** The codes a decision on brand coverage or a vocabulary proposal can answer under its locks (3.3, 4.2). */
const CATALOGUE_DECISION_CODES = [
  'merchandise.record-not-found',
  'merchandise.starts-in-past',
  'merchandise.version-overlaps',
  'merchandise.reference-not-in-force',
  'merchandise.office-unit-has-no-brand',
  'merchandise.brand-counter-one-brand',
  'merchandise.code-taken',
  'merchandise.attribute-not-list',
  'merchandise.proposal-not-found',
  'merchandise.proposal-not-open',
  // An agreement version or a bank-detail change of the parties part (structure-and-masters 5.1, 5.2; S1-F03-T03).
  'merchandise.party-not-supplier',
  // A product proposal's confirmation (4.2; S1-F03-T02).
  ...PRODUCT_RULE_CODES,
  // The season or size attribute's approval: its origin and its attribute rechecked under the lock (4.2 "As built";
  // RR-550, RR-556); a version decided or superseded meanwhile is stale.
  'configuration.origin-not-allowed',
  'kernel.stale-version',
] as const satisfies readonly ErrorCode[];

/**
 * The codes preparing the season or size attribute can answer (structure-and-masters 4.2 "As built"; RR-550, RR-556):
 * the attribute it names, the origin and the version token (code-house-rules 12.7, 12.14).
 */
const MARKED_ATTRIBUTE_CHANGE_CODES = [
  ...HISTORY_CODES,
  'kernel.cross-site-request',
  'kernel.stale-version',
  'configuration.origin-not-allowed',
  'merchandise.record-not-found',
  'merchandise.reference-not-in-force',
  'merchandise.attribute-not-list',
] as const satisfies readonly ErrorCode[];

/** The codes every change of the parties part can answer (structure-and-masters 2, 5; S1-F03-T03). */
const PARTY_CHANGE_CODES = [
  'access.not-signed-in',
  'access.session-locked',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
  'kernel.cross-site-request',
  'kernel.stale-version',
  'merchandise.code-taken',
  'merchandise.record-not-found',
  'merchandise.starts-in-past',
  'merchandise.version-overlaps',
  'merchandise.reference-not-in-force',
  'merchandise.party-not-supplier',
] as const satisfies readonly ErrorCode[];

/** The codes preparing an agreement or its version can answer (5.2). */
const AGREEMENT_CHANGE_CODES = [
  ...PARTY_CHANGE_CODES,
  'merchandise.agreement-exists',
  'merchandise.supplier-terms-on-brand-agreement',
] as const satisfies readonly ErrorCode[];

/** The codes of a protected action of the parties part, which takes a fresh authenticator code (3.3). */
const PARTY_PROTECTED_CODES = [
  'access.authenticator-code-refused',
  'access.enrolment-not-started',
] as const satisfies readonly ErrorCode[];

/** The restricted fields of a bank-detail change (access-and-approvals 6; code-house-rules 12.4). */
const BANK_DETAIL_FIELDS = (['accountHolder', 'accountNumber', 'ifsc', 'bankName'] as const).map((field) => ({
  path: [field],
  fieldClass: 'bank-details' as const,
}));

/** The codes every change of the books part can answer (books-and-posting 2, 3, 6.3; S1-F09-T01). */
const FINANCE_CHANGE_CODES = [
  'access.not-signed-in',
  'access.session-locked',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
  'kernel.cross-site-request',
  'kernel.stale-version',
  'finance.record-not-found',
  'finance.code-taken',
  'finance.starts-in-past',
  'finance.version-overlaps',
  'finance.cost-change-after-stock',
  'finance.book-stock-unanswered',
] as const satisfies readonly ErrorCode[];
const FINANCE_READ_CODES = [...HISTORY_CODES, 'finance.record-not-found'] as const satisfies readonly ErrorCode[];
/** What a decision on an account or book-setting version adds (6.3; 2.2). */
const FINANCE_DECISION_CODES = [
  'finance.record-not-found',
  'finance.starts-in-past',
  'finance.version-overlaps',
  'finance.no-ca-evidence',
  'finance.cost-change-after-stock',
  'finance.book-stock-unanswered',
] as const satisfies readonly ErrorCode[];

/** The routes of the API. A unit adds its routes here as they are built. */
/** The codes every change of the tax rules part can answer (shared-calculations 3.3, 10; S1-F09-T04). */
const TAX_RULE_CHANGE_CODES = [
  'access.not-signed-in',
  'access.session-locked',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
  'kernel.cross-site-request',
  'kernel.stale-version',
  'configuration.origin-not-allowed',
  'finance.code-taken',
  'finance.record-not-found',
  'finance.starts-in-past',
  'finance.version-overlaps',
  'finance.reference-not-in-force',
  'finance.tax-registration-not-found',
  'finance.rate-rule-invalid',
  'finance.shares-invalid',
  'finance.rounding-unit-not-positive',
  'finance.rounding-level-invalid',
] as const satisfies readonly ErrorCode[];

/** The codes recording the CA's evidence can answer (10.1; books-and-posting 6.3). */
const TAX_RULE_CA_EVIDENCE_CODES = [
  'access.not-signed-in',
  'access.session-locked',
  'access.sign-in-incomplete',
  'access.not-authorised',
  'access.business-date-not-set',
  'kernel.cross-site-request',
  'finance.record-not-found',
  'finance.version-not-awaiting',
] as const satisfies readonly ErrorCode[];

/**
 * The codes preparing an open-to-buy budget or its version can answer (goods-in 3.3; S2-F01-T02): the budget carries
 * its brand, so each route authorises in its command with the brand's facts (access-and-approvals 5.3).
 */
const OPEN_TO_BUY_CHANGE_CODES = [
  ...HISTORY_CODES,
  'kernel.cross-site-request',
  'configuration.origin-not-allowed',
] as const satisfies readonly ErrorCode[];

/** A new budget's own: its brand, its season and its pair (3.3). */
const OPEN_TO_BUY_NEW_BUDGET_CODES = [
  ...OPEN_TO_BUY_CHANGE_CODES,
  'booking.brand-not-in-force',
  'booking.season-not-in-vocabulary',
  'booking.budget-exists',
  // No attribute is marked as the season (structure-and-masters 4.2 "As built"; RR-550).
  'merchandise.attribute-not-marked',
] as const satisfies readonly ErrorCode[];

/** A budget's next version's own: the budget, and the version token (code-house-rules 12.7). */
const OPEN_TO_BUY_VERSION_CODES = [
  ...OPEN_TO_BUY_CHANGE_CODES,
  'booking.record-not-found',
  'kernel.stale-version',
] as const satisfies readonly ErrorCode[];

/** The codes the check or the approval of a budget version can answer under Decide's locks (3.3; POL-05.09). */
const OPEN_TO_BUY_DECISION_CODES = [
  'booking.record-not-found',
  'booking.version-not-awaiting',
  'booking.budget-not-checked',
] as const satisfies readonly ErrorCode[];

/**
 * The codes a booking version's approval can answer under Decide's locks (goods-in 3.4, 10.3, 10.5; S2-F01-T03): the
 * policy gate under policies 5 and 1, the supplier's link, the Agreement in force, open-to-buy and the booking series.
 * The version and its booking are `OPEN_TO_BUY_DECISION_CODES`' own.
 */
const BOOKING_DECISION_CODES = [
  'configuration.operation-unavailable',
  'booking.supplier-not-linked',
  'booking.no-agreement-in-force',
  'booking.open-to-buy-missing',
  'booking.open-to-buy-short',
  'booking.no-booking-series',
  'booking.booking-series-paused',
  // A change after approval, rechecked against what is received and cancelled (goods-in 3.5, 3.10; S2-F01-T04).
  'booking.line-below-received',
  'booking.line-received',
  // A cancellation or an extension (goods-in 3.5, 3.10; S2-F01-T04).
  'booking.version-not-in-force',
  'booking.balance-changed',
  'booking.not-an-extension',
  // A proposal to link late or excess goods, rechecked under the booking's lock (goods-in 4.10; S2-F02-T04).
  'booking.line-not-found',
  'booking.goods-not-of-line',
  'booking.receipt-already-linked',
] as const satisfies readonly ErrorCode[];

/**
 * The codes every command on an existing booking can answer (goods-in 3.1, 3.4, 3.10; S2-F01-T03, S2-F01-T04): the
 * booking not found, and the version token's, which holding the actor's authority answers too when their role changed
 * under the lock (code-house-rules 8.2, 12.7).
 */
const BOOKING_COMMAND_CODES = [
  ...HISTORY_CODES,
  'kernel.cross-site-request',
  'kernel.stale-version',
  'booking.record-not-found',
] as const satisfies readonly ErrorCode[];

/**
 * The codes every change to a booking's Draft can answer (goods-in 3.1, 3.4; S2-F01-T03): those of a command on a
 * booking, and the booking no longer a Draft. Saving a Draft is not policy-gated (DEC-116; goods-in 10.5).
 */
const BOOKING_CHANGE_CODES = [...BOOKING_COMMAND_CODES, 'booking.not-draft'] as const satisfies readonly ErrorCode[];

/** What a Draft's content can answer: the brand, the destination, the supplier's link and the season (3.1). */
const BOOKING_CONTENT_CODES = [
  'booking.brand-not-in-force',
  'booking.site-not-in-force',
  'booking.supplier-not-linked',
  'booking.season-not-in-vocabulary',
  // No attribute is marked as the season (structure-and-masters 4.2 "As built"; RR-550).
  'merchandise.attribute-not-marked',
  // A line naming a line it continues, which a new booking has none of (3.10; S2-F01-T04).
  'booking.line-not-found',
] as const satisfies readonly ErrorCode[];

/** What a booking's next Draft can answer besides: its lines against what is received and cancelled (3.5, 3.10). */
const BOOKING_NEXT_DRAFT_CODES = [
  ...BOOKING_CONTENT_CODES,
  'booking.line-repeated',
  'booking.line-below-received',
  'booking.line-received',
] as const satisfies readonly ErrorCode[];

/**
 * What every change of an approved booking's lifecycle can answer (goods-in 3.4, 3.5, 3.10; S2-F01-T04): those of a
 * command on a booking, and the booking not approved. Recording Issued or Confirmed, and proposing a cancellation or an
 * extension, record no business effect, so they are not policy-gated; the decisions are (DEC-116; goods-in 10.5).
 */
const BOOKING_LIFECYCLE_CODES = [
  ...BOOKING_COMMAND_CODES,
  'booking.not-approved',
] as const satisfies readonly ErrorCode[];

/**
 * What proposing a cancellation or an extension can answer besides (3.5, 3.10): its lines, the communication, and one
 * of its kind waiting for its decision already.
 */
const BOOKING_AMENDMENT_CODES = [
  ...BOOKING_LIFECYCLE_CODES,
  'booking.line-not-found',
  'booking.communication-required',
  'booking.amendment-pending',
] as const satisfies readonly ErrorCode[];

/**
 * The codes every change to an Arrival before its GRN can answer (goods-in 4.1 to 4.3; S2-F02-T02): the Arrival not
 * found or its GRN issued, and the version token's, which holding the actor's authority answers too when their role
 * changed under the lock (code-house-rules 8.2, 12.7). Recording invoices and photos and the count is not gated
 * (goods-in 4.8): only recording the Arrival and issuing its GRN add the gate's code.
 */
const RECEIVING_CHANGE_CODES = [
  ...HISTORY_CODES,
  'kernel.cross-site-request',
  'kernel.stale-version',
  'receiving.record-not-found',
  'receiving.grn-issued',
] as const satisfies readonly ErrorCode[];

/**
 * The codes of issuing a GRN (goods-in 4.5, 4.9, 10.3; S2-F02-T02, S2-F02-T03), with the stock ledger's refusals of its
 * receipt counts and holds, the damage reports' gate and series, and the exceptions' series and routing of the
 * follow-ups the findings raise (access-and-approvals 12.1).
 */
const GRN_ISSUE_CODES = [
  ...RECEIVING_CHANGE_CODES,
  'configuration.operation-unavailable',
  'receiving.invoice-required',
  'receiving.no-lines',
  'receiving.extra-not-recorded',
  'receiving.batch-required',
  'receiving.batch-not-tracked',
  'receiving.sku-not-of-line',
  // A line of goods on the invoice, or of wrong goods, counted without a size (goods-in 4.3; RR-586).
  'receiving.size-required',
  'receiving.no-grn-series',
  'receiving.grn-series-paused',
  'stock.invalid-item',
  'stock.place-invalid',
  'stock.plan-stale',
  'stock.not-in-custody',
  'stock.rule-not-set',
  'stock.count-freeze-active',
  'stock.blocked',
  'stock.no-damage-report-series',
  'stock.damage-report-series-paused',
  'exceptions.no-exception-code-series',
  'exceptions.exception-code-series-paused',
  'exceptions.exception-code-series-exhausted',
  'exceptions.no-routing',
  // An Arrival against a booking the issuer may not see (goods-in 4.10; S2-F02-T04).
  'booking.record-not-found',
] as const satisfies readonly ErrorCode[];

/**
 * The codes of a held line's decision (goods-in 4.6, 10.3; S2-F02-T03): the policy gate, the held line not found or
 * decided already, and unidentified goods taken in before their product is named.
 */
const HELD_LINE_DECISION_CODES = [
  'configuration.operation-unavailable',
  'receiving.record-not-found',
  'receiving.held-line-decided',
  'receiving.product-not-named',
] as const satisfies readonly ErrorCode[];

/**
 * The stock ledger's refusals a recount's receipt counts and reversals can meet (stock-ledger 13.4, 13.8, 13.18;
 * goods-in 4.11; S2-F02-T05): read for its proposal's value and posted at its approval. A reversal takes free units
 * only, so held, reserved or hidden units, a count freeze and more than the count moved refuse it; goods whose cost is
 * established need their book's cost setting and posting map, and a value that does not divide (SL-2).
 */
const RECOUNT_LEDGER_CODES = [
  'stock.invalid-item',
  'stock.place-invalid',
  'stock.plan-stale',
  'stock.rule-not-set',
  'stock.insufficient-available',
  'stock.held',
  'stock.reserved',
  'stock.blocked',
  'stock.count-freeze-active',
  'stock.exceeds-source',
  'stock.no-cost-setting',
  'stock.posting-refused',
] as const satisfies readonly ErrorCode[];

/**
 * The refusals of a recount's lines (goods-in 4.7, 4.11; PRD-REC-019; S2-F02-T05), at its proposal and again under the
 * locks at its approval: the GRN's PT attached, another recount waiting, and each line a recount does not change.
 */
const RECOUNT_LINE_CODES = [
  'receiving.record-not-found',
  'receiving.pt-attached',
  'receiving.recount-unchanged',
  'receiving.recount-held-line',
  'receiving.recount-not-on-invoice',
  'receiving.recount-adds-extra',
  'receiving.recount-below-damage',
  'receiving.recount-linked',
  ...RECOUNT_LEDGER_CODES,
] as const satisfies readonly ErrorCode[];

/**
 * The codes of a recount's approval (goods-in 4.7, 4.11, 10.3; S2-F02-T05): the receiving gate at the unit, the recount
 * decided already, its lines checked again under the locks, the decision verified under the ledger's locks on the
 * goods' cost then (access-and-approvals 9.7), and the shortage follow-up a recount raises (goods-in 4.9).
 */
/**
 * The codes of a PT revision's decision (goods-in 6.3, 6.6; S2-F06-T01): the policy gate; the GRN changed since the
 * upload, a held line, damage report or recount waiting again, or the revision no longer the one waiting; a series
 * missing or paused; a new product the catalogue refuses under the locks; the decision verified under the ledger's
 * locks on the PT's cost (access-and-approvals 9.7); and the ledger's refusals of the identity step, the holds the PT
 * route ends, the coverage and the cost established: overlapping coverage, units held, reserved or taken by a claim the
 * approver cannot see, a count freeze, a missing cost setting or posting map, or a locked period (stock-ledger 13.8;
 * books-and-posting 10).
 */
const PT_DECISION_CODES = [
  'configuration.operation-unavailable',
  'merchandise.record-not-found',
  'merchandise.pt-not-a-draft',
  'merchandise.pt-held-lines-open',
  'merchandise.pt-grn-changed',
  'merchandise.no-pt-series',
  'merchandise.pt-series-paused',
  'merchandise.no-sku-code-series',
  'merchandise.sku-code-series-paused',
  'merchandise.pt-size-not-in-size-set',
  'merchandise.pt-colour-not-identity',
  'merchandise.pt-tracking-unknown',
  'merchandise.code-taken',
  'merchandise.sku-exists',
  'merchandise.code-conflict',
  'merchandise.reference-not-in-force',
  'merchandise.value-not-in-vocabulary',
  'access.approval-value-exceeded',
  'stock.invalid-item',
  'stock.place-invalid',
  'stock.plan-stale',
  'stock.held',
  'stock.reserved',
  'stock.blocked',
  'stock.insufficient-available',
  'stock.count-freeze-active',
  'stock.condition-route',
  'stock.coverage-overlap',
  'stock.not-covered',
  'stock.exceeds-source',
  'stock.wrong-release-event',
  'stock.no-cost-setting',
  'stock.posting-refused',
  'stock.rule-not-set',
] as const satisfies readonly ErrorCode[];

/**
 * The codes of a PT reversal's approval besides those a PT's decision answers (goods-in 6.4, 6.7, 10.3; DEC-137,
 * PRD-REC-019; S2-F09-T01): the reversal decided already or its revision no longer the PT's newest Official one, a
 * piece scanned in or held since the approval, and the GRN's mark no longer the revision's.
 */
const PT_REVERSAL_DECISION_CODES = [
  'merchandise.pt-reversal-decided',
  'merchandise.pt-scanned-in',
  'merchandise.pt-goods-held',
  'receiving.pt-not-attached',
] as const satisfies readonly ErrorCode[];

const RECOUNT_DECISION_CODES = [
  'configuration.operation-unavailable',
  'receiving.recount-decided',
  'access.approval-value-exceeded',
  ...RECOUNT_LINE_CODES,
  'exceptions.no-exception-code-series',
  'exceptions.exception-code-series-paused',
  'exceptions.exception-code-series-exhausted',
  'exceptions.no-routing',
] as const satisfies readonly ErrorCode[];

/**
 * The stock ledger's refusals a damage hold can meet, placed by a report or read for a request's value (stock-ledger
 * 13.8, 13.15; goods-in 8.2, 8.5; S2-F08-T01): the goods not of the line or not in custody, a cost pool that appeared
 * after Plan, and a cost that does not divide into whole paise (SL-2). A hold is stopped by no count freeze (13.9).
 */
const DAMAGE_HOLD_CODES = [
  'stock.invalid-item',
  'stock.place-invalid',
  'stock.plan-stale',
  'stock.not-in-custody',
  'stock.rule-not-set',
] as const satisfies readonly ErrorCode[];

/**
 * The codes of a damage report's decision and a reversal's approval (goods-in 8.3; S2-F08-T01): the policy gate, the
 * report already decided or its confirmation no longer the one it stands on, the decision verified under the ledger's
 * locks on the goods' cost then (access-and-approvals 9.7), and the ledger's refusals of the condition change and its
 * reversal: units held, reserved or taken by a claim the decider cannot see, a count freeze over them, more than the
 * change moved (stock-ledger 13.8, 13.15).
 */
const DAMAGE_DECISION_CODES = [
  'configuration.operation-unavailable',
  'stock.record-not-found',
  'stock.report-decided',
  'stock.report-not-confirmed',
  'access.approval-value-exceeded',
  ...DAMAGE_HOLD_CODES,
  'stock.insufficient-available',
  'stock.held',
  'stock.reserved',
  'stock.blocked',
  'stock.count-freeze-active',
  'stock.exceeds-source',
] as const satisfies readonly ErrorCode[];

/** The codes every change of a damage report can answer (goods-in 8.5; S2-F08-T01). */
const DAMAGE_CHANGE_CODES = [
  ...HISTORY_CODES,
  'kernel.cross-site-request',
  'kernel.stale-version',
  'configuration.operation-unavailable',
  'stock.record-not-found',
  ...DAMAGE_HOLD_CODES,
] as const satisfies readonly ErrorCode[];

export const routes = {
  health: defineRoute({
    method: 'GET',
    path: '/api/health',
    access: { kind: 'public' },
    command: false,
    response: healthResponseSchema,
    codes: [],
  }),
  // Sign-in (access-and-approvals 3.1; PRD-SEC-001, POL-02.17). The one public command: it carries no key, so each
  // attempt is its own attempt with its own access record (code-house-rules 12.4). The answer sets the cookie.
  signIn: defineRoute({
    method: 'POST',
    path: '/api/access/sign-in',
    access: { kind: 'public' },
    command: true,
    body: signInRequestSchema,
    secretFields: [
      { path: ['password'], kind: 'presented-secret' },
      { path: ['totpCode'], kind: 'authenticator-code' },
    ],
    restrictedFields: [],
    shows: 'nothing',
    response: signInOutcomeSchema,
    codes: [
      'access.sign-in-refused',
      'access.sign-in-slowed',
      'access.sign-in-unavailable',
      'kernel.cross-site-request',
    ],
  }),
  // The test sign-in of the development environments (access-and-approvals 3.4; POL-02.17, PRD-ACS-017; DEC-121):
  // the people listed, empty wherever it is off, and the sign-in itself, a public command like sign-in, with no key
  // (code-house-rules 12.4), each attempt its own access record. It carries no secret.
  demoSignInPeople: defineRoute({
    method: 'GET',
    path: '/api/access/demo-sign-in',
    access: { kind: 'public' },
    command: false,
    response: demoSignInListSchema,
    codes: [],
  }),
  demoSignIn: defineRoute({
    method: 'POST',
    path: '/api/access/demo-sign-in',
    access: { kind: 'public' },
    command: true,
    body: demoSignInRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: signInOutcomeSchema,
    codes: ['access.sign-in-refused', 'access.sign-in-unavailable', 'kernel.cross-site-request'],
  }),
  // A one-time challenge for a device to sign (offline-counter 3.2, 3.3; PRD-OFF-010; S1-F12-T01): on the sign-in path,
  // before anyone is signed in, a public command like sign-in, with no key. It carries no secret.
  issueDeviceChallenge: defineRoute({
    method: 'POST',
    path: '/api/access/device-challenges',
    access: { kind: 'public' },
    command: true,
    body: deviceChallengeRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: deviceChallengeSchema,
    codes: [
      'access.sign-in-refused',
      'access.sign-in-slowed',
      'access.sign-in-unavailable',
      'kernel.cross-site-request',
    ],
  }),
  // The signed-in user (access-and-approvals 3.3). Refused, naming the steps left, until first sign-in is done.
  session: defineRoute({
    method: 'GET',
    path: '/api/access/session',
    access: { kind: 'own' },
    command: false,
    response: sessionViewSchema,
    codes: ['access.not-signed-in', 'access.session-locked', 'access.sign-in-incomplete'],
  }),
  // Enrolment of an authenticator app (access-and-approvals 3.2): the secret is shown once (code-house-rules 12.6).
  startEnrolment: defineRoute({
    method: 'POST',
    path: '/api/access/enrolment/start',
    access: { kind: 'own', signInStep: 'enrolment' },
    command: true,
    body: enrolmentStartRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'secret',
    response: enrolmentStartResponseSchema,
    codes: [
      'access.not-signed-in',
      'access.session-locked',
      'access.sign-in-incomplete',
      'access.already-enrolled',
      'kernel.cross-site-request',
    ],
  }),
  confirmEnrolment: defineRoute({
    method: 'POST',
    path: '/api/access/enrolment/confirm',
    access: { kind: 'own', signInStep: 'enrolment' },
    command: true,
    body: enrolmentConfirmRequestSchema,
    secretFields: [{ path: ['totpCode'], kind: 'authenticator-code' }],
    restrictedFields: [],
    shows: 'nothing',
    response: enrolmentConfirmResponseSchema,
    codes: [
      'access.not-signed-in',
      'access.session-locked',
      'access.sign-in-incomplete',
      'access.authenticator-code-refused',
      'access.enrolment-not-started',
      'kernel.cross-site-request',
    ],
  }),
  // The user's own password change, after a fresh authenticator code (access-and-approvals 3.2, 3.3).
  changePassword: defineRoute({
    method: 'POST',
    path: '/api/access/password/change',
    access: { kind: 'own', signInStep: 'password-change' },
    command: true,
    body: passwordChangeRequestSchema,
    secretFields: [
      { path: ['newPassword'], kind: 'new-secret' },
      { path: ['totpCode'], kind: 'authenticator-code' },
    ],
    restrictedFields: [],
    shows: 'nothing',
    response: passwordChangeResponseSchema,
    codes: [
      'access.not-signed-in',
      'access.session-locked',
      'access.sign-in-incomplete',
      'access.authenticator-code-refused',
      'access.password-refused',
      'access.password-rules-not-set',
      'kernel.cross-site-request',
    ],
  }),
  // Preparing access changes (access-and-approvals 4, 5, 9.11; POL-02.07). Each saves a draft that a different
  // authorised person approves later (S1-F01-T13); nothing here takes effect. Authorise runs on the route's action and
  // record type before the command (7.1 step 3).
  prepareRole: defineRoute({
    method: 'POST',
    path: '/api/access/roles',
    access: { kind: 'action', action: 'create', recordType: 'access.role' },
    command: true,
    body: roleDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: rolePreparedSchema,
    codes: [
      ...PREPARE_CODES,
      'access.permission-not-declared',
      'access.service-only-permission',
      'access.role-code-taken',
    ],
  }),
  prepareRoleVersion: defineRoute({
    method: 'POST',
    path: '/api/access/roles/{roleId}/versions',
    params: z.strictObject({ roleId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'access.role' },
    command: true,
    body: roleVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: rolePreparedSchema,
    codes: [
      ...PREPARE_CODES,
      'access.permission-not-declared',
      'access.service-only-permission',
      'access.role-not-found',
    ],
  }),
  prepareRoleAssignment: defineRoute({
    method: 'POST',
    path: '/api/access/role-assignments',
    access: { kind: 'action', action: 'create', recordType: 'access.role_assignment' },
    command: true,
    body: roleAssignmentDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: assignmentPreparedSchema,
    codes: [
      ...PREPARE_CODES,
      'access.assignment-overlaps',
      'access.self-service-scope',
      'access.scope-members-not-available',
      'access.service-only-permission',
      'access.role-not-found',
      'access.actor-not-found',
    ],
  }),
  prepareAssignmentWithdrawal: defineRoute({
    method: 'POST',
    path: '/api/access/role-assignments/{assignmentId}/withdrawal',
    params: z.strictObject({ assignmentId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'access.role_assignment' },
    command: true,
    body: assignmentWithdrawalDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: withdrawalPreparedSchema,
    codes: [...PREPARE_CODES, 'access.assignment-not-found', 'access.not-withdrawable'],
  }),
  // Sessions (access-and-approvals 3.3; S1-F01-T09). The unlock and the sign-out are the only routes a locked session
  // reaches. A user's own sessions need no permission (3.2); another user's need edit on `access.session`.
  unlockSession: defineRoute({
    method: 'POST',
    path: '/api/access/unlock',
    access: { kind: 'own', whileLocked: true },
    command: true,
    body: unlockRequestSchema,
    secretFields: [{ path: ['password'], kind: 'presented-secret' }],
    restrictedFields: [],
    shows: 'nothing',
    response: unlockResponseSchema,
    codes: [
      'access.not-signed-in',
      'access.sign-in-refused',
      'access.sign-in-slowed',
      'access.sign-in-unavailable',
      'access.session-not-found',
      'kernel.cross-site-request',
    ],
  }),
  signOut: defineRoute({
    method: 'POST',
    path: '/api/access/sign-out',
    access: { kind: 'own', whileLocked: true },
    command: true,
    body: signOutRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: signOutResponseSchema,
    codes: ['access.not-signed-in', 'kernel.cross-site-request'],
  }),
  revokeOwnSessions: defineRoute({
    method: 'POST',
    path: '/api/access/own-sessions/revoke',
    access: { kind: 'own' },
    command: true,
    body: sessionRevocationRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: sessionRevocationResponseSchema,
    codes: [
      'access.not-signed-in',
      'access.session-locked',
      'access.sign-in-incomplete',
      'access.session-not-found',
      'kernel.cross-site-request',
    ],
  }),
  revokeUserSessions: defineRoute({
    method: 'POST',
    path: '/api/access/users/{userId}/sessions/revoke',
    params: z.strictObject({ userId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'access.session' },
    command: true,
    body: sessionRevocationRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: sessionRevocationResponseSchema,
    codes: [
      'access.not-signed-in',
      'access.session-locked',
      'access.sign-in-incomplete',
      'access.not-authorised',
      'access.user-not-found',
      'access.session-not-found',
      'kernel.cross-site-request',
    ],
  }),
  // Resetting another user's credential (access-and-approvals 3.2; GC3-4): a protected action asking a fresh code
  // (3.3, GC3-6); no second approver; nobody resets their own; every session of the user is revoked (PRD-SEC-008).
  resetCredential: defineRoute({
    method: 'POST',
    path: '/api/access/users/{userId}/credential-reset',
    params: z.strictObject({ userId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'access.user_credential' },
    command: true,
    body: credentialResetRequestSchema,
    secretFields: [
      { path: ['temporaryPassword'], kind: 'new-secret' },
      { path: ['totpCode'], kind: 'authenticator-code' },
    ],
    restrictedFields: [],
    shows: 'nothing',
    response: credentialResetResponseSchema,
    codes: [
      'access.not-signed-in',
      'access.session-locked',
      'access.sign-in-incomplete',
      'access.not-authorised',
      'access.business-date-not-set',
      'access.authenticator-code-refused',
      'access.enrolment-not-started',
      'access.own-credential-reset',
      'access.user-not-found',
      'access.password-refused',
      'access.password-rules-not-set',
      'kernel.cross-site-request',
    ],
  }),
  // History (numbering-and-audit 4.5, 5; access-and-approvals 6, 7.2, 9.11; module-map 4.3, 4.5). Served by
  // `access`, which reads the rows through `audit` and masks each restricted value its field permissions do not
  // grant, since `audit` uses only `kernel` (PRD-ACS-008). Each row is shown through one assignment that grants view
  // on it, inside the reader's scope (PRD-SEC-005); the answer names the time it was read (PRD-PRF-004).
  readRecordHistory: defineRoute({
    method: 'GET',
    path: '/api/access/history/record',
    query: recordHistoryQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'audit.audit_record' },
    command: false,
    response: auditHistoryPageSchema,
    codes: HISTORY_CODES,
  }),
  readActorHistory: defineRoute({
    method: 'GET',
    path: '/api/access/history/actor',
    query: actorHistoryQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'audit.audit_record' },
    command: false,
    response: auditHistoryPageSchema,
    codes: HISTORY_CODES,
  }),
  // The access history report: sign-ins, sessions, credential events and permission changes.
  readAccessHistory: defineRoute({
    method: 'GET',
    path: '/api/access/history/access-records',
    query: accessHistoryQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'audit.access_record', authorisedIn: 'command' },
    command: false,
    response: accessHistoryPageSchema,
    codes: HISTORY_CODES,
  }),
  // Sensitive access: an encrypted field shown unmasked, an export with a restricted field (numbering-and-audit 5.1).
  readSensitiveAccessHistory: defineRoute({
    method: 'GET',
    path: '/api/access/history/sensitive-access-records',
    query: accessHistoryQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'audit.sensitive_access_record', authorisedIn: 'command' },
    command: false,
    response: accessHistoryPageSchema,
    codes: HISTORY_CODES,
  }),
  // Users (access-and-approvals 2.1, 3.2, 9.11; DEC-112; S1-F01-T13). A new user and every change to a user is a
  // version, Awaiting approval until a different authorised person decides it; a new user cannot sign in until then.
  // The temporary password is a new secret: kept only as an Argon2 hash, never in the key's hash (12.5).
  prepareUser: defineRoute({
    method: 'POST',
    path: '/api/access/users',
    access: { kind: 'action', action: 'create', recordType: 'access.user' },
    command: true,
    body: userCreateRequestSchema,
    secretFields: [{ path: ['temporaryPassword'], kind: 'new-secret' }],
    restrictedFields: [],
    shows: 'nothing',
    response: userPreparedSchema,
    codes: [...PREPARE_CODES, 'access.login-taken', 'access.password-refused', 'access.password-rules-not-set'],
  }),
  prepareUserVersion: defineRoute({
    method: 'POST',
    path: '/api/access/users/{userId}/versions',
    params: z.strictObject({ userId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'access.user' },
    command: true,
    body: userVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: userPreparedSchema,
    codes: [...PREPARE_CODES, 'access.user-not-found'],
  }),
  // The approve and reject reasons (access-and-approvals 9.5; POL-02.23, DEC-104) and the approval rule settings (8).
  prepareApprovalReason: defineRoute({
    method: 'POST',
    path: '/api/access/approval-reasons',
    access: { kind: 'action', action: 'create', recordType: 'access.approval_reason' },
    command: true,
    body: approvalReasonDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: approvalReasonPreparedSchema,
    codes: [...PREPARE_CODES, 'access.reason-code-taken'],
  }),
  prepareApprovalReasonVersion: defineRoute({
    method: 'POST',
    path: '/api/access/approval-reasons/{reasonId}/versions',
    params: z.strictObject({ reasonId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'access.approval_reason' },
    command: true,
    body: approvalReasonVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: approvalReasonPreparedSchema,
    codes: [...PREPARE_CODES, 'access.reason-not-found'],
  }),
  listApprovalReasons: defineRoute({
    method: 'GET',
    path: '/api/access/approval-reasons',
    access: { kind: 'action', action: 'view', recordType: 'access.approval_reason' },
    command: false,
    response: approvalReasonsInForceSchema,
    codes: HISTORY_CODES,
  }),
  prepareApprovalRuleSetting: defineRoute({
    method: 'POST',
    path: '/api/access/approval-rule-settings',
    access: { kind: 'action', action: 'create', recordType: 'access.approval_rule_setting' },
    command: true,
    body: approvalRuleSettingDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: approvalRuleSettingPreparedSchema,
    codes: [...PREPARE_CODES, 'access.rule-setting-exists', 'access.action-type-not-declared'],
  }),
  prepareApprovalRuleSettingVersion: defineRoute({
    method: 'POST',
    path: '/api/access/approval-rule-settings/{settingId}/versions',
    params: z.strictObject({ settingId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'access.approval_rule_setting' },
    command: true,
    body: approvalRuleSettingVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: approvalRuleSettingPreparedSchema,
    codes: [...PREPARE_CODES, 'access.rule-setting-not-found'],
  }),
  // Approval limits (access-and-approvals 9.2, 9.11, 14; POL-02.07, POL-02.09, POL-02.15; S1-F05-T01): every limit
  // with its basis beside it, and a new one prepared for a different authorised person to approve.
  listApprovalLimits: defineRoute({
    method: 'GET',
    path: '/api/access/approval-limits',
    access: { kind: 'action', action: 'view', recordType: 'access.approval_limit' },
    command: false,
    query: setupPageQuerySchema,
    response: approvalLimitListSchema,
    codes: HISTORY_CODES,
  }),
  prepareApprovalLimit: defineRoute({
    method: 'POST',
    path: '/api/access/approval-limits',
    access: { kind: 'action', action: 'create', recordType: 'access.approval_limit' },
    command: true,
    body: approvalLimitDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: approvalLimitPreparedSchema,
    codes: [
      ...PREPARE_CODES,
      'access.action-type-not-declared',
      'access.action-type-not-limited',
      'access.role-not-found',
      'access.assignment-not-found',
      'access.assignment-not-of-user',
      'access.scope-members-not-available',
      'access.scope-member-not-found',
      'access.limit-overlaps',
    ],
  }),
  // Stand-in grants (access-and-approvals 10, 14; PRD-ACS-018, POL-02.20; GC3-7, DEC-105; S1-F05-T02): every grant,
  // and a new one recorded for a different authorised person to approve, from My work's "delegate during absence".
  listStandInGrants: defineRoute({
    method: 'GET',
    path: '/api/access/stand-in-grants',
    access: { kind: 'action', action: 'view', recordType: 'access.stand_in_grant' },
    command: false,
    query: setupPageQuerySchema,
    response: standInGrantListSchema,
    codes: HISTORY_CODES,
  }),
  prepareStandInGrant: defineRoute({
    method: 'POST',
    path: '/api/access/stand-in-grants',
    access: { kind: 'action', action: 'create', recordType: 'access.stand_in_grant' },
    command: true,
    body: standInGrantDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: standInGrantPreparedSchema,
    codes: [
      ...PREPARE_CODES,
      'access.action-type-not-declared',
      'access.user-not-found',
      'access.stand-in-for-self',
      'access.stand-in-wider-than-authority',
      'access.stand-in-overlaps',
    ],
  }),
  // The essential security settings (access-and-approvals 3.3, 9.11; POL-02.06, POL-02.07; DEC-118, RR-334): each
  // with its versions and the one in force, and a new version prepared for a different authorised person to approve.
  listSecuritySettings: defineRoute({
    method: 'GET',
    path: '/api/access/security-settings',
    access: { kind: 'action', action: 'view', recordType: 'access.setting' },
    command: false,
    response: securitySettingsSchema,
    codes: HISTORY_CODES,
  }),
  prepareSecuritySettingVersion: defineRoute({
    method: 'POST',
    path: '/api/access/security-settings/versions',
    access: { kind: 'action', action: 'edit', recordType: 'access.setting' },
    command: true,
    body: securitySettingVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: securitySettingPreparedSchema,
    codes: PREPARE_CODES,
  }),
  // The approval panel (access-and-approvals 9.3, 9.5; PRD-UXP-003): the request, its preparers, its decision, and
  // whether the reader may decide it now, naming what is missing.
  readApprovalRequest: defineRoute({
    method: 'GET',
    path: '/api/access/approval-requests/{requestId}',
    params: z.strictObject({ requestId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'access.approval_request' },
    command: false,
    response: approvalRequestViewSchema,
    codes: [...HISTORY_CODES, 'access.approval-request-not-found'],
  }),
  // Deciding (access-and-approvals 9.3, 9.5, 9.6; PRD-ACS-006, PRD-ACS-007, PRD-ACS-010; POL-02.23, DEC-104): a
  // protected action, asking a fresh authenticator code (3.3). In one transaction: the rechecks under the locks, the
  // decision, the version taking effect or rejected, effective grants, audit and outbox (module-map 6.2 flow A).
  decideApproval: defineRoute({
    method: 'POST',
    path: '/api/access/approval-requests/{requestId}/decision',
    params: z.strictObject({ requestId: idSchema }),
    access: { kind: 'decision' },
    command: true,
    body: decisionRequestSchema,
    secretFields: [{ path: ['totpCode'], kind: 'authenticator-code' }],
    restrictedFields: [],
    shows: 'nothing',
    response: decisionAnswerSchema,
    codes: [
      'access.not-signed-in',
      'access.session-locked',
      'access.sign-in-incomplete',
      'access.business-date-not-set',
      'access.approval-request-not-found',
      'access.no-reason-list-in-force',
      'access.free-text-not-allowed',
      'access.free-text-required',
      'access.reason-not-in-force',
      'access.not-eligible',
      'access.self-preparation',
      'access.stand-in-party',
      // A second step decided by none who decided the first (access-and-approvals 9.8b; DEC-142).
      'access.earlier-step-decider',
      'access.authenticator-code-refused',
      'access.enrolment-not-started',
      'access.approval-not-open',
      'access.approval-superseded',
      'access.user-not-approved',
      'access.setting-not-found',
      'access.starts-in-past',
      'access.assignment-overlaps',
      'access.version-overlaps',
      'access.not-withdrawable',
      // Approval limits (access-and-approvals 9.2, 9.3; S1-F05-T01).
      'access.no-approval-limit',
      'access.above-approval-limit',
      'access.unknown-value-not-covered',
      'access.limit-overlaps',
      // Stand-in grants and bulk items (access-and-approvals 9.9, 10; S1-F05-T02).
      'access.stand-in-overlaps',
      'access.stand-in-wider-than-authority',
      'access.stand-in-grant-not-found',
      'organisation.record-not-found',
      'organisation.starts-in-past',
      'organisation.version-overlaps',
      'organisation.reference-not-in-force',
      ...ORGANISATION_STRUCTURE_RULE_CODES,
      // Brand coverage and vocabulary confirmation (structure-and-masters 3.3, 4.2; S1-F03-T01).
      ...CATALOGUE_DECISION_CODES,
      // Account and book-setting versions (books-and-posting 6.3; S1-F09-T01).
      ...FINANCE_DECISION_CODES,
      // An open-to-buy budget version's check and approval (goods-in 3.3; POL-05.09; S2-F01-T02).
      ...OPEN_TO_BUY_DECISION_CODES,
      // A booking version's approval (goods-in 3.4, 10.3; S2-F01-T03).
      ...BOOKING_DECISION_CODES,
      // A damage report's decision and a reversal's approval (goods-in 8.3; S2-F08-T01).
      ...DAMAGE_DECISION_CODES,
      // A held line's decision (goods-in 4.6; S2-F02-T03).
      ...HELD_LINE_DECISION_CODES,
      // A recount's approval (goods-in 4.7, 4.11; S2-F02-T05).
      ...RECOUNT_DECISION_CODES,
      // A PT revision's approval or rejection (goods-in 6.3, 6.6; S2-F06-T01).
      ...PT_DECISION_CODES,
      // A PT's reversal before the scan-in (goods-in 6.4, 6.7; S2-F09-T01).
      ...PT_REVERSAL_DECISION_CODES,
      // Layout, mapping and mapping rule versions (imports-and-opening-data 6.4; S1-F06-T03).
      'files-imports.proposal-not-found',
      'files-imports.proposal-not-open',
      'files-imports.rule-conflict',
      'files-imports.starts-in-past',
      'files-imports.rule-target-refused',
      // An activity's approval (module-map 4.16; S1-F04-T02).
      'site-lifecycle.record-not-found',
      'site-lifecycle.unit-not-found',
      'site-lifecycle.check-failed',
      'site-lifecycle.activity-already-granted',
      'site-lifecycle.site-already-ready',
      // The financial years and the bill-number format, and the missing series their approval defines
      // (offline-counter 4.3b; S1-F12-T03).
      // Each code the effect can answer: the origin, the code and the year rechecked under the locks, numbering's
      // refusal of the format version, and the series refusals a device's missing series can meet (12.3).
      'pos.change-not-found',
      'pos.format-code-taken',
      'configuration.origin-not-allowed',
      'numbering.financial-year-invalid',
      'numbering.financial-year-label-taken',
      'numbering.financial-year-overlaps',
      'numbering.format-invalid',
      'numbering.format-could-repeat',
      'numbering.live-series-exists',
      'kernel.stale-version',
      'kernel.cross-site-request',
    ],
  }),
  // Bulk approval (access-and-approvals 9.9; code-house-rules 12.1; PRD-ACS-011, PRD-ACS-019, POL-02.19; S1-F05-T02):
  // the one route that runs several commands. The batch, with the one fresh authenticator code (3.3), in a command of
  // its own; then each item its own decision in its own transaction, rechecked, under the request's key with the
  // item's identifier added to its operation (12.4). An item that fails goes to individual review; the others go on.
  decideApprovalsInBulk: defineRoute({
    method: 'POST',
    path: '/api/access/approval-requests/bulk-decision',
    access: { kind: 'decision' },
    command: true,
    body: bulkDecisionRequestSchema,
    secretFields: [{ path: ['totpCode'], kind: 'authenticator-code' }],
    restrictedFields: [],
    shows: 'nothing',
    response: bulkDecisionAnswerSchema,
    codes: [
      'access.not-signed-in',
      'access.session-locked',
      'access.sign-in-incomplete',
      'access.business-date-not-set',
      'access.bulk-selection-empty',
      'access.no-reason-list-in-force',
      'access.reason-not-in-force',
      'access.not-eligible',
      'access.authenticator-code-refused',
      'access.enrolment-not-started',
      'kernel.cross-site-request',
    ],
  }),
  // The access setup screens' lists (access-and-approvals 2.1, 4, 5, 9.5, 14; S1-F01-T16; RR-326): every user, role,
  // role assignment and reason, each version with the state the screen shows. The records carry no scope fact, so the
  // view permission on the type decides (5.3).
  listUsers: defineRoute({
    method: 'GET',
    path: '/api/access/users',
    access: { kind: 'action', action: 'view', recordType: 'access.user' },
    command: false,
    response: userListSchema,
    codes: HISTORY_CODES,
  }),
  listRoles: defineRoute({
    method: 'GET',
    path: '/api/access/roles',
    access: { kind: 'action', action: 'view', recordType: 'access.role' },
    command: false,
    response: roleListSchema,
    codes: HISTORY_CODES,
  }),
  listRoleAssignments: defineRoute({
    method: 'GET',
    path: '/api/access/role-assignments',
    access: { kind: 'action', action: 'view', recordType: 'access.role_assignment' },
    command: false,
    response: assignmentListSchema,
    codes: HISTORY_CODES,
  }),
  listApprovalReasonRecords: defineRoute({
    method: 'GET',
    path: '/api/access/approval-reasons/records',
    access: { kind: 'action', action: 'view', recordType: 'access.approval_reason' },
    command: false,
    response: reasonListSchema,
    codes: HISTORY_CODES,
  }),
  // My work (access-and-approvals 11.2; module-map 4.8; PRD-ACS-009): every signed-in user's own list, needing no
  // permission; each item shows only while its reader may act on it.
  listMyWork: defineRoute({
    method: 'GET',
    path: '/api/inbox/my-work',
    access: { kind: 'own' },
    command: false,
    response: myWorkSchema,
    codes: ['access.not-signed-in', 'access.session-locked', 'access.sign-in-incomplete'],
  }),
  // Task and approval routing (access-and-approvals 9.4, 11.3, 14; GC3-8, DEC-105; S1-F05-T02): Setup › Exception
  // rules' tab for approvals and tasks. A version is prepared, then approved by a different authorised person.
  listWorkItemRouting: defineRoute({
    method: 'GET',
    path: '/api/inbox/routing',
    access: { kind: 'action', action: 'view', recordType: 'inbox.work_item_routing' },
    command: false,
    query: setupPageQuerySchema,
    response: workItemRoutingListSchema,
    codes: HISTORY_CODES,
  }),
  prepareWorkItemRouting: defineRoute({
    method: 'POST',
    path: '/api/inbox/routing',
    access: { kind: 'action', action: 'edit', recordType: 'inbox.work_item_routing' },
    command: true,
    body: workItemRoutingDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: workItemRoutingPreparedSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'inbox.action-type-not-routable',
      'inbox.starts-in-past',
      'inbox.version-overlaps',
      'inbox.party-not-found',
      'inbox.site-not-found',
    ],
  }),
  // Live updates (code-house-rules 12.12; deployment.md section 5; S1-F08-T04): one stream per session, every signed-in
  // user's, carrying only what the session's actor may view. It does not count as the session's activity.
  openLiveUpdates: defineRoute({
    method: 'GET',
    path: '/api/kernel/live',
    access: { kind: 'own', passive: true },
    command: false,
    stream: 'event-stream',
    response: liveMessageSchema,
    codes: ['access.not-signed-in', 'access.session-locked', 'access.sign-in-incomplete'],
  }),
  // The operations view's failed jobs (code-house-rules 12.9; module-map 4.1; PRD-SEC-013; S1-F08-T04): view on
  // `kernel.job`, which carries no scope fact.
  listFailedJobs: defineRoute({
    method: 'GET',
    path: '/api/kernel/failed-jobs',
    query: failedJobPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'kernel.job' },
    command: false,
    response: failedJobListSchema,
    codes: ['access.not-signed-in', 'access.session-locked', 'access.sign-in-incomplete', 'access.not-authorised'],
  }),
  // The operations view's backup status (backup-and-restore 3.2 step 8, 10.2; module-map 4.1; PRD-SEC-013;
  // S1-F14-T02): view on `kernel.backup_record`, which carries no scope fact. A read only: a backup is taken by the
  // operator command, never through the API (backup-and-restore 3.2, 10.3; PRD-SEC-018).
  listBackups: defineRoute({
    method: 'GET',
    path: '/api/kernel/backups',
    access: { kind: 'action', action: 'view', recordType: 'kernel.backup_record' },
    command: false,
    response: backupStatusSchema,
    codes: ['access.not-signed-in', 'access.session-locked', 'access.sign-in-incomplete', 'access.not-authorised'],
  }),
  // A restored Organisation's recovery (backup-and-restore 4.3, 5.3; GC9-8; POL-18.03, POL-18.04, PRD-SEC-013;
  // S1-F14-T03). `configuration` owns the commands and calls no one above it, so `access`, which uses it, serves the
  // routes, as it serves policy readiness (module-map section 3, rule 6). The status is a read for whoever holds view on
  // `kernel.recovery_event`; each command runs while the hold is on, under Authorise, with its audit record.
  readRecoveryStatus: defineRoute({
    method: 'GET',
    path: '/api/access/hold',
    access: { kind: 'action', action: 'view', recordType: 'kernel.recovery_event' },
    command: false,
    response: recoveryStatusSchema,
    codes: HISTORY_CODES,
  }),
  reconcileSeriesAfterRestore: defineRoute({
    method: 'POST',
    path: '/api/access/hold/series/{seriesId}/reconcile',
    params: seriesParamSchema,
    access: { kind: 'action', action: 'create', recordType: 'configuration.series_reconciliation' },
    command: true,
    body: seriesReconciliationDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: seriesReconciledSchema,
    codes: [...PREPARE_CODES, 'numbering.series-not-found', 'numbering.series-not-paused-after-restore'],
  }),
  recordRecoveryValidation: defineRoute({
    method: 'POST',
    path: '/api/access/hold/validations',
    access: { kind: 'action', action: 'create', recordType: 'configuration.recovery_validation' },
    command: true,
    body: recoveryValidationDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: recoveryValidationRecordedSchema,
    codes: [...PREPARE_CODES, 'configuration.not-held'],
  }),
  reopenAfterRestore: defineRoute({
    method: 'POST',
    path: '/api/access/hold/lift',
    access: { kind: 'action', action: 'create', recordType: 'configuration.reopening' },
    command: true,
    body: recoveryReopeningDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: recoveryReopenedSchema,
    codes: [
      ...PREPARE_CODES,
      'configuration.not-held',
      'configuration.restore-check-failed',
      'configuration.recovery-gaps-unsettled',
      'configuration.validations-missing',
      'configuration.series-not-reconciled',
    ],
  }),
  // Stored files and evidence (imports-and-opening-data 3.1, 9.3, 11, 13.1; PRD-IMP-002, PRD-SEC-005, PRD-SEC-006;
  // S1-F06-T05). The file travels as base64 in the JSON body. Storing needs create on the stored file; reading goes
  // through the attached record, authorised in the command.
  storeFile: defineRoute({
    method: 'POST',
    path: '/api/files-imports/files',
    access: { kind: 'action', action: 'create', recordType: 'files_imports.stored_file' },
    command: true,
    body: storeFileRequestSchema,
    bodyLimitBytes: STORE_FILE_BODY_LIMIT_BYTES,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: storedFileSchema,
    codes: [
      ...PREPARE_CODES,
      'files-imports.type-not-allowed',
      'files-imports.file-too-large',
      'files-imports.active-content',
      'files-imports.pdf-not-inspectable',
      'files-imports.file-store-not-configured',
    ],
  }),
  readAttachedFile: defineRoute({
    method: 'GET',
    path: '/api/files-imports/attachments/{attachmentId}/file',
    params: z.strictObject({ attachmentId: idSchema }),
    access: { kind: 'attached-record' },
    command: false,
    response: attachedFileSchema,
    codes: [
      'access.not-signed-in',
      'access.session-locked',
      'access.sign-in-incomplete',
      'access.not-authorised',
      'access.business-date-not-set',
      'files-imports.attachment-not-found',
      'files-imports.restricted-file-is-an-export',
      'files-imports.file-store-not-configured',
    ],
  }),
  downloadAttachedFile: defineRoute({
    method: 'POST',
    path: '/api/files-imports/attachments/{attachmentId}/download',
    params: z.strictObject({ attachmentId: idSchema }),
    access: { kind: 'attached-record' },
    command: true,
    // A file that carries a restricted class is an export: a protected action that takes a fresh authenticator code
    // (access-and-approvals 3.3; PRD-SEC-001; RR-432). A file with no restricted class takes none.
    body: z.strictObject({ totpCode: totpCodeSchema.optional() }),
    secretFields: [{ path: ['totpCode'], kind: 'authenticator-code' }],
    restrictedFields: [],
    shows: 'restricted-value',
    response: attachedFileSchema,
    codes: [
      ...PREPARE_CODES,
      'access.authenticator-code-refused',
      'access.enrolment-not-started',
      'files-imports.attachment-not-found',
      'files-imports.file-store-not-configured',
    ],
  }),
  // Imports (imports-and-opening-data 3.1, 13.1, 13.2; S1-F06-T01): the import upload, the layouts a batch may start
  // with, Start an import (which reads, maps and stages the file), one batch with its staged rows and preview,
  // Validate and Publish. A batch carries its scope facts; the command authorises with them (access-and-approvals 7.1).
  storeImportFile: defineRoute({
    method: 'POST',
    path: '/api/files-imports/import-files',
    access: { kind: 'action', action: 'create', recordType: 'files_imports.stored_file' },
    command: true,
    body: storeFileRequestSchema,
    bodyLimitBytes: STORE_FILE_BODY_LIMIT_BYTES,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: importFileStoredSchema,
    codes: [
      ...PREPARE_CODES,
      'files-imports.type-not-allowed',
      ...WORKBOOK_READ_CODES,
      'files-imports.customer-contact-columns',
      'files-imports.layout-needed-on-test-setup',
      'files-imports.file-store-not-configured',
    ],
  }),
  listImportLayouts: defineRoute({
    method: 'GET',
    path: '/api/files-imports/layouts',
    access: { kind: 'action', action: 'view', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: false,
    response: importLayoutListSchema,
    codes: [...HISTORY_CODES],
  }),
  // Layouts, mappings and mapping rules proposed and confirmed (imports-and-opening-data 6.1 to 6.4, 14; PRD-IMP-003,
  // PRD-IMP-008, POL-02.07; DEC-112 GC6-4; S1-F06-T03). A proposal changes no record; a different authorised person
  // confirms it through the approval panel (decideApproval).
  proposeLayoutVersion: defineRoute({
    method: 'POST',
    path: '/api/files-imports/layout-versions',
    access: { kind: 'action', action: 'create', recordType: IMPORT_LAYOUT_TYPE },
    command: true,
    body: layoutProposalSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: layoutProposedSchema,
    codes: [...PREPARE_CODES, 'files-imports.layout-code-taken', 'files-imports.layout-not-found'],
  }),
  proposeMappingVersion: defineRoute({
    method: 'POST',
    path: '/api/files-imports/mapping-versions',
    access: { kind: 'action', action: 'create', recordType: IMPORT_MAPPING_TYPE },
    command: true,
    body: mappingProposalSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: mappingProposedSchema,
    codes: [
      ...PREPARE_CODES,
      'files-imports.mapping-code-taken',
      'files-imports.mapping-not-found',
      'files-imports.layout-not-found',
      'files-imports.no-import-handler',
      'files-imports.mapping-field-unknown',
      'files-imports.mapping-column-unknown',
      'files-imports.mapping-encrypted-column',
    ],
  }),
  listMappingRules: defineRoute({
    method: 'GET',
    path: '/api/files-imports/mapping-rules',
    access: { kind: 'action', action: 'view', recordType: MAPPING_RULE_TYPE },
    command: false,
    response: mappingRuleListSchema,
    codes: [...HISTORY_CODES],
  }),
  proposeMappingRule: defineRoute({
    method: 'POST',
    path: '/api/files-imports/mapping-rules',
    access: { kind: 'action', action: 'create', recordType: MAPPING_RULE_TYPE },
    command: true,
    body: mappingRuleProposalSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: mappingRuleProposedSchema,
    codes: [
      ...PREPARE_CODES,
      'files-imports.rule-attribute-unknown',
      'files-imports.rule-target-refused',
      'files-imports.rule-scope-not-found',
      'files-imports.starts-in-past',
    ],
  }),
  // Detection by structure (6.5; PRD-IMP-004): the compatible versions of a file this person handed in.
  detectImportLayout: defineRoute({
    method: 'GET',
    path: '/api/files-imports/import-files/{storedFileId}/layouts',
    params: z.strictObject({ storedFileId: idSchema }),
    query: detectLayoutQuerySchema,
    access: { kind: 'action', action: 'create', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: false,
    response: layoutDetectionSchema,
    codes: [
      ...HISTORY_CODES,
      'files-imports.import-file-not-found',
      ...WORKBOOK_READ_CODES,
      'files-imports.file-store-not-configured',
    ],
  }),
  startImport: defineRoute({
    method: 'POST',
    path: '/api/files-imports/batches',
    access: { kind: 'action', action: 'create', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: true,
    body: startImportRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: importStartedSchema,
    codes: [
      ...PREPARE_CODES,
      'files-imports.import-file-not-found',
      ...WORKBOOK_READ_CODES,
      'files-imports.layout-not-found',
      'files-imports.layout-not-matched',
      'files-imports.layout-version-rejected',
      'files-imports.no-import-handler',
      'files-imports.file-already-imported',
      'files-imports.document-already-published',
      'files-imports.no-import-batch-series',
      'files-imports.import-batch-series-paused',
      'files-imports.file-store-not-configured',
      // An opening batch for a unit whose cutover is complete (imports-and-opening-data 10.1; PRD-LIF-011; S1-F13-T03).
      'files-imports.cutover-complete',
      // A batch about one record, such as the GRN a PT file is for (13.1, 13.2; S2-F04-T02).
      'files-imports.subject-required',
      'files-imports.subject-not-taken',
      'files-imports.subject-not-found',
      'files-imports.subject-refused',
      // A layout looking for the header where the target's files never have it (6.5; goods-in 5.2).
      'files-imports.header-rows-not-allowed',
    ],
  }),
  readImportBatch: defineRoute({
    method: 'GET',
    path: '/api/files-imports/batches/{batchId}',
    params: z.strictObject({ batchId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: false,
    response: importBatchReadSchema,
    codes: [...HISTORY_CODES, 'files-imports.batch-not-found'],
  }),
  // Staging edits (section 5, 3.2; PRD-IMP-009): a value entered by a person, the suggestions for one field, and a
  // document excluded or put back. Each returns a Validated batch to Staged, as a new batch version.
  enterStagedValue: defineRoute({
    method: 'POST',
    path: '/api/files-imports/batches/{batchId}/rows/{stagedRowId}/entries',
    params: z.strictObject({ batchId: idSchema, stagedRowId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: true,
    body: stagedValueEntryRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: stagedValueEnteredSchema,
    codes: [
      ...PREPARE_CODES,
      'files-imports.batch-not-found',
      'files-imports.batch-not-open',
      'files-imports.staged-row-not-found',
      'files-imports.document-not-staged',
      'files-imports.field-unknown',
      'files-imports.ai-suggestions-unavailable',
      'kernel.stale-version',
    ],
  }),
  stagedValueSuggestions: defineRoute({
    method: 'GET',
    path: '/api/files-imports/batches/{batchId}/rows/{stagedRowId}/suggestions',
    params: z.strictObject({ batchId: idSchema, stagedRowId: idSchema }),
    query: valueSuggestionsQuerySchema,
    access: { kind: 'action', action: 'edit', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: false,
    response: valueSuggestionsSchema,
    codes: [
      ...HISTORY_CODES,
      'files-imports.batch-not-found',
      'files-imports.staged-row-not-found',
      'files-imports.field-unknown',
    ],
  }),
  excludeImportDocument: defineRoute({
    method: 'POST',
    path: '/api/files-imports/batches/{batchId}/documents/{documentId}/exclusion',
    params: z.strictObject({ batchId: idSchema, documentId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: true,
    body: documentExclusionRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: importBatchChangedSchema,
    codes: [
      ...PREPARE_CODES,
      'files-imports.batch-not-found',
      'files-imports.batch-not-open',
      'files-imports.document-not-found',
      'files-imports.document-not-staged',
      'kernel.stale-version',
    ],
  }),
  validateImport: defineRoute({
    method: 'POST',
    path: '/api/files-imports/batches/{batchId}/validate',
    params: z.strictObject({ batchId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: true,
    body: z.strictObject({}),
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: importValidatedSchema,
    codes: [...PREPARE_CODES, 'files-imports.batch-not-found', 'files-imports.batch-not-staged'],
  }),
  // The validation report's Warnings marked seen, and Submit for review (8.2, 13.1; PRD-IMP-005, PRD-IMP-007).
  markImportIssuesSeen: defineRoute({
    method: 'POST',
    path: '/api/files-imports/batches/{batchId}/issues/seen',
    params: z.strictObject({ batchId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: true,
    body: issuesSeenRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: issuesSeenSchema,
    codes: [
      ...PREPARE_CODES,
      'files-imports.batch-not-found',
      'files-imports.batch-not-validated',
      'files-imports.issue-not-found',
      'files-imports.not-a-warning',
      'files-imports.already-submitted',
      'kernel.stale-version',
    ],
  }),
  submitImport: defineRoute({
    method: 'POST',
    path: '/api/files-imports/batches/{batchId}/submit',
    params: z.strictObject({ batchId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: true,
    body: submitImportRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: importSubmittedSchema,
    codes: [
      ...PREPARE_CODES,
      'files-imports.batch-not-found',
      'files-imports.batch-not-validated',
      'files-imports.not-validated-at-this-version',
      'files-imports.blocking-issues-remain',
      'files-imports.warnings-not-seen',
      'files-imports.already-submitted',
      'files-imports.counts-do-not-close',
      'kernel.stale-version',
    ],
  }),
  publishImport: defineRoute({
    method: 'POST',
    path: '/api/files-imports/batches/{batchId}/publish',
    params: z.strictObject({ batchId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: true,
    body: publishImportRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: importPublishedSchema,
    codes: [
      ...PREPARE_CODES,
      'files-imports.batch-not-found',
      'files-imports.batch-not-validated',
      'files-imports.review-missing',
      'files-imports.version-not-confirmed',
      'files-imports.counts-do-not-close',
      'kernel.stale-version',
      // A batch whose handler requires an approval in `access` (3.1 step 8; access-and-approvals 9.7).
      'access.approval-decision-not-found',
      'access.approval-not-approved',
      'access.approval-not-for-document',
      'access.approval-used',
      'access.approval-version-changed',
      'access.self-preparation',
      // An opening batch's gate (4.2, 10.1; PRD-SEC-017, PRD-LIF-011) and a queued publish (10.6; S1-F13-T03).
      'configuration.operation-unavailable',
      'files-imports.cutover-complete',
      'files-imports.publish-queued',
      'files-imports.nothing-to-publish',
      'files-imports.several-books',
      // A batch about one record the person may no longer see (13.1, 13.2; S2-F04-T02).
      'files-imports.subject-not-found',
    ],
  }),
  // Withdraw a batch, which becomes Failed (3.2, 13.1; S1-F06-T04).
  withdrawImport: defineRoute({
    method: 'POST',
    path: '/api/files-imports/batches/{batchId}/withdraw',
    params: z.strictObject({ batchId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: true,
    body: withdrawImportRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: importBatchChangedSchema,
    codes: [...PREPARE_CODES, 'files-imports.batch-not-found', 'files-imports.batch-not-open', 'kernel.stale-version'],
  }),
  // The import outcomes report (14; PRD-IMP-013, PRD-MOD-003, PRD-EXC-011, PRD-SEC-005; S1-F06-T04).
  importOutcomes: defineRoute({
    method: 'GET',
    path: '/api/files-imports/outcomes',
    query: importOutcomesQuerySchema,
    access: { kind: 'action', action: 'view', recordType: IMPORT_BATCH_TYPE, authorisedIn: 'command' },
    command: false,
    response: importOutcomesSchema,
    codes: [...HISTORY_CODES],
  }),
  // Comparison runs (imports-and-opening-data 2, 10.3, 13.1, 14; PRD-LIF-027, POL-14.07; S1-F13-T01): two sets
  // compared by the key the run kind names, every difference listed; neither set is changed. Create on the run with its
  // two sides' places, and view on each side, are authorised in the command, since the places are known only from the
  // sets.
  runComparison: defineRoute({
    method: 'POST',
    path: '/api/files-imports/comparison-runs',
    access: { kind: 'action', action: 'create', recordType: COMPARISON_RUN_TYPE, authorisedIn: 'command' },
    command: true,
    body: runComparisonRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: comparisonRunStartedSchema,
    codes: [
      ...PREPARE_CODES,
      'files-imports.comparison-set-not-found',
      'files-imports.comparison-set-wrong',
      'files-imports.comparison-side-masked',
      'files-imports.comparison-places-differ',
    ],
  }),
  listComparisonRuns: defineRoute({
    method: 'GET',
    path: '/api/files-imports/comparison-runs',
    query: comparisonRunListQuerySchema,
    access: { kind: 'action', action: 'view', recordType: COMPARISON_RUN_TYPE, authorisedIn: 'command' },
    command: false,
    response: comparisonRunListSchema,
    codes: [...HISTORY_CODES],
  }),
  readComparisonRun: defineRoute({
    method: 'GET',
    path: '/api/files-imports/comparison-runs/{runId}',
    params: z.strictObject({ runId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: COMPARISON_RUN_TYPE, authorisedIn: 'command' },
    command: false,
    response: comparisonRunReadSchema,
    codes: [...HISTORY_CODES, 'files-imports.comparison-run-not-found'],
  }),
  // The organisation structure (structure-and-masters 2.3, 3, 8; module-map 4.11, 6.2 flow A; S1-F02-T01): each master's
  // paged list and one record with every version, preparing a new master with its first version, and preparing a later version. Preparing
  // saves a version Awaiting approval and requests its approval; a different authorised person decides it through the
  // approval panel (decideApproval), which makes it take effect (GC2-2, DEC-105; PRD-ACS-006). The types carry no
  // scope fact, so the permission on the type decides (access-and-approvals 5.3).
  listCountries: defineRoute({
    method: 'GET',
    path: '/api/organisation/countries',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.country' },
    command: false,
    response: countryListSchema,
    codes: HISTORY_CODES,
  }),
  readCountry: defineRoute({
    method: 'GET',
    path: '/api/organisation/countries/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.country' },
    command: false,
    response: countryReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareCountry: defineRoute({
    method: 'POST',
    path: '/api/organisation/countries',
    access: { kind: 'action', action: 'create', recordType: 'organisation.country' },
    command: true,
    body: countryDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  prepareCountryVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/countries/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.country' },
    command: true,
    body: nameVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  listStates: defineRoute({
    method: 'GET',
    path: '/api/organisation/states',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.state' },
    command: false,
    response: stateListSchema,
    codes: HISTORY_CODES,
  }),
  readState: defineRoute({
    method: 'GET',
    path: '/api/organisation/states/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.state' },
    command: false,
    response: stateReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareState: defineRoute({
    method: 'POST',
    path: '/api/organisation/states',
    access: { kind: 'action', action: 'create', recordType: 'organisation.state' },
    command: true,
    body: stateDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  prepareStateVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/states/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.state' },
    command: true,
    body: nameVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  listCities: defineRoute({
    method: 'GET',
    path: '/api/organisation/cities',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.city' },
    command: false,
    response: cityListSchema,
    codes: HISTORY_CODES,
  }),
  readCity: defineRoute({
    method: 'GET',
    path: '/api/organisation/cities/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.city' },
    command: false,
    response: cityReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareCity: defineRoute({
    method: 'POST',
    path: '/api/organisation/cities',
    access: { kind: 'action', action: 'create', recordType: 'organisation.city' },
    command: true,
    body: cityDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  prepareCityVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/cities/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.city' },
    command: true,
    body: nameVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  listAreas: defineRoute({
    method: 'GET',
    path: '/api/organisation/areas',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.area' },
    command: false,
    response: areaListSchema,
    codes: HISTORY_CODES,
  }),
  readArea: defineRoute({
    method: 'GET',
    path: '/api/organisation/areas/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.area' },
    command: false,
    response: areaReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareArea: defineRoute({
    method: 'POST',
    path: '/api/organisation/areas',
    access: { kind: 'action', action: 'create', recordType: 'organisation.area' },
    command: true,
    body: areaDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  prepareAreaVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/areas/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.area' },
    command: true,
    body: nameVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  listLegalEntities: defineRoute({
    method: 'GET',
    path: '/api/organisation/legal-entities',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.legal_entity' },
    command: false,
    response: legalEntityListSchema,
    codes: HISTORY_CODES,
  }),
  readLegalEntity: defineRoute({
    method: 'GET',
    path: '/api/organisation/legal-entities/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.legal_entity' },
    command: false,
    response: legalEntityReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareLegalEntity: defineRoute({
    method: 'POST',
    path: '/api/organisation/legal-entities',
    access: { kind: 'action', action: 'create', recordType: 'organisation.legal_entity' },
    command: true,
    body: legalEntityDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  prepareLegalEntityVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/legal-entities/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.legal_entity' },
    command: true,
    body: legalEntityVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  listTaxRegistrations: defineRoute({
    method: 'GET',
    path: '/api/organisation/tax-registrations',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.tax_registration' },
    command: false,
    response: taxRegistrationListSchema,
    codes: HISTORY_CODES,
  }),
  readTaxRegistration: defineRoute({
    method: 'GET',
    path: '/api/organisation/tax-registrations/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.tax_registration' },
    command: false,
    response: taxRegistrationReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareTaxRegistration: defineRoute({
    method: 'POST',
    path: '/api/organisation/tax-registrations',
    access: { kind: 'action', action: 'create', recordType: 'organisation.tax_registration' },
    command: true,
    body: taxRegistrationDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  prepareTaxRegistrationVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/tax-registrations/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.tax_registration' },
    command: true,
    body: taxRegistrationVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  listAccountingBooks: defineRoute({
    method: 'GET',
    path: '/api/organisation/accounting-books',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.accounting_book' },
    command: false,
    response: accountingBookListSchema,
    codes: HISTORY_CODES,
  }),
  readAccountingBook: defineRoute({
    method: 'GET',
    path: '/api/organisation/accounting-books/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.accounting_book' },
    command: false,
    response: accountingBookReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareAccountingBook: defineRoute({
    method: 'POST',
    path: '/api/organisation/accounting-books',
    access: { kind: 'action', action: 'create', recordType: 'organisation.accounting_book' },
    command: true,
    body: accountingBookDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  prepareAccountingBookVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/accounting-books/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.accounting_book' },
    command: true,
    body: nameVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  listSites: defineRoute({
    method: 'GET',
    path: '/api/organisation/sites',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.site', authorisedIn: 'command' },
    command: false,
    response: siteListSchema,
    codes: HISTORY_CODES,
  }),
  readSite: defineRoute({
    method: 'GET',
    path: '/api/organisation/sites/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.site', authorisedIn: 'command' },
    command: false,
    response: siteReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareSite: defineRoute({
    method: 'POST',
    path: '/api/organisation/sites',
    access: { kind: 'action', action: 'create', recordType: 'organisation.site', authorisedIn: 'command' },
    command: true,
    body: siteDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PLACE_PREPARE_CODES,
  }),
  prepareSiteVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/sites/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.site', authorisedIn: 'command' },
    command: true,
    body: siteVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PLACE_PREPARE_CODES,
  }),
  listStores: defineRoute({
    method: 'GET',
    path: '/api/organisation/stores',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.store', authorisedIn: 'command' },
    command: false,
    response: storeListSchema,
    codes: HISTORY_CODES,
  }),
  readStore: defineRoute({
    method: 'GET',
    path: '/api/organisation/stores/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.store', authorisedIn: 'command' },
    command: false,
    response: storeReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareStore: defineRoute({
    method: 'POST',
    path: '/api/organisation/stores',
    access: { kind: 'action', action: 'create', recordType: 'organisation.store', authorisedIn: 'command' },
    command: true,
    body: storeDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PLACE_PREPARE_CODES,
  }),
  prepareStoreVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/stores/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.store', authorisedIn: 'command' },
    command: true,
    body: storeVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PLACE_PREPARE_CODES,
  }),
  listGroupings: defineRoute({
    method: 'GET',
    path: '/api/organisation/groupings',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.grouping' },
    command: false,
    response: groupingListSchema,
    codes: HISTORY_CODES,
  }),
  readGrouping: defineRoute({
    method: 'GET',
    path: '/api/organisation/groupings/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.grouping' },
    command: false,
    response: groupingReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareGrouping: defineRoute({
    method: 'POST',
    path: '/api/organisation/groupings',
    access: { kind: 'action', action: 'create', recordType: 'organisation.grouping' },
    command: true,
    body: groupingDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  prepareGroupingVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/groupings/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.grouping' },
    command: true,
    body: groupingVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  // The Organisation's own grouping kinds and classification kinds and values (structure-and-masters 3.1, 3.6, 8;
  // RR-440; S1-F02-T04): records of the Organisation as a whole, each version holding a name.
  listGroupingKinds: defineRoute({
    method: 'GET',
    path: '/api/organisation/grouping-kinds',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.grouping_kind' },
    command: false,
    response: groupingKindListSchema,
    codes: HISTORY_CODES,
  }),
  readGroupingKind: defineRoute({
    method: 'GET',
    path: '/api/organisation/grouping-kinds/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.grouping_kind' },
    command: false,
    response: groupingKindReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareGroupingKind: defineRoute({
    method: 'POST',
    path: '/api/organisation/grouping-kinds',
    access: { kind: 'action', action: 'create', recordType: 'organisation.grouping_kind' },
    command: true,
    body: groupingKindDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  prepareGroupingKindVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/grouping-kinds/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.grouping_kind' },
    command: true,
    body: nameVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  listClassificationKinds: defineRoute({
    method: 'GET',
    path: '/api/organisation/classification-kinds',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.classification_kind' },
    command: false,
    response: classificationKindListSchema,
    codes: HISTORY_CODES,
  }),
  readClassificationKind: defineRoute({
    method: 'GET',
    path: '/api/organisation/classification-kinds/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.classification_kind' },
    command: false,
    response: classificationKindReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareClassificationKind: defineRoute({
    method: 'POST',
    path: '/api/organisation/classification-kinds',
    access: { kind: 'action', action: 'create', recordType: 'organisation.classification_kind' },
    command: true,
    body: classificationKindDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  prepareClassificationKindVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/classification-kinds/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.classification_kind' },
    command: true,
    body: nameVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  listClassificationValues: defineRoute({
    method: 'GET',
    path: '/api/organisation/classification-values',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.classification_value' },
    command: false,
    response: classificationValueListSchema,
    codes: HISTORY_CODES,
  }),
  readClassificationValue: defineRoute({
    method: 'GET',
    path: '/api/organisation/classification-values/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.classification_value' },
    command: false,
    response: classificationValueReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareClassificationValue: defineRoute({
    method: 'POST',
    path: '/api/organisation/classification-values',
    access: { kind: 'action', action: 'create', recordType: 'organisation.classification_value' },
    command: true,
    body: classificationValueDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  prepareClassificationValueVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/classification-values/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.classification_value' },
    command: true,
    body: nameVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_PREPARE_CODES,
  }),
  // Business units, their mappings and the mappings' verification, locations and default warehouses
  // (structure-and-masters 3.3 to 3.6, 3.8; S1-F02-T02). A mapping is listed and read by its unit, a default warehouse
  // by its Store: they have versions only. Verifying is create on the verification record, a permission of its own
  // (3.4; GC2-2, DEC-105).
  listBusinessUnits: defineRoute({
    method: 'GET',
    path: '/api/organisation/business-units',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.business_unit', authorisedIn: 'command' },
    command: false,
    response: businessUnitListSchema,
    codes: HISTORY_CODES,
  }),
  readBusinessUnit: defineRoute({
    method: 'GET',
    path: '/api/organisation/business-units/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.business_unit', authorisedIn: 'command' },
    command: false,
    response: businessUnitReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareBusinessUnit: defineRoute({
    method: 'POST',
    path: '/api/organisation/business-units',
    access: { kind: 'action', action: 'create', recordType: 'organisation.business_unit', authorisedIn: 'command' },
    command: true,
    body: businessUnitDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_MAPPING_PREPARE_CODES,
  }),
  prepareBusinessUnitVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/business-units/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.business_unit', authorisedIn: 'command' },
    command: true,
    body: businessUnitVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_MAPPING_PREPARE_CODES,
  }),
  listBusinessUnitMappings: defineRoute({
    method: 'GET',
    path: '/api/organisation/business-unit-mappings',
    query: masterPageQuerySchema,
    access: {
      kind: 'action',
      action: 'view',
      recordType: 'organisation.business_unit_mapping',
      authorisedIn: 'command',
    },
    command: false,
    response: businessUnitMappingListSchema,
    codes: HISTORY_CODES,
  }),
  readBusinessUnitMapping: defineRoute({
    method: 'GET',
    path: '/api/organisation/business-unit-mappings/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: {
      kind: 'action',
      action: 'view',
      recordType: 'organisation.business_unit_mapping',
      authorisedIn: 'command',
    },
    command: false,
    response: businessUnitMappingReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareBusinessUnitMappingVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/business-unit-mappings/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: {
      kind: 'action',
      action: 'edit',
      recordType: 'organisation.business_unit_mapping',
      authorisedIn: 'command',
    },
    command: true,
    body: businessUnitMappingVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_MAPPING_PREPARE_CODES,
  }),
  verifyBusinessUnitMapping: defineRoute({
    method: 'POST',
    path: '/api/organisation/business-unit-mappings/{recordId}/versions/{versionId}/verification',
    params: z.strictObject({ recordId: idSchema, versionId: idSchema }),
    access: {
      kind: 'action',
      action: 'create',
      recordType: 'organisation.business_unit_mapping_verification',
      authorisedIn: 'command',
    },
    command: true,
    body: mappingVerificationRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: mappingVerifiedSchema,
    codes: [
      'access.not-signed-in',
      'access.session-locked',
      'access.sign-in-incomplete',
      'access.not-authorised',
      'access.business-date-not-set',
      'kernel.cross-site-request',
      'organisation.record-not-found',
      'organisation.mapping-not-approved',
      'organisation.verifier-made-mapping',
      'organisation.mapping-already-verified',
    ],
  }),
  listLocations: defineRoute({
    method: 'GET',
    path: '/api/organisation/locations',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'organisation.location', authorisedIn: 'command' },
    command: false,
    response: locationListSchema,
    codes: HISTORY_CODES,
  }),
  readLocation: defineRoute({
    method: 'GET',
    path: '/api/organisation/locations/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'organisation.location', authorisedIn: 'command' },
    command: false,
    response: locationReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareLocation: defineRoute({
    method: 'POST',
    path: '/api/organisation/locations',
    access: { kind: 'action', action: 'create', recordType: 'organisation.location', authorisedIn: 'command' },
    command: true,
    body: locationDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_UNIT_PREPARE_CODES,
  }),
  prepareLocationVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/locations/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'organisation.location', authorisedIn: 'command' },
    command: true,
    body: locationVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_UNIT_PREPARE_CODES,
  }),
  listStoreDefaultWarehouses: defineRoute({
    method: 'GET',
    path: '/api/organisation/store-default-warehouses',
    query: masterPageQuerySchema,
    access: {
      kind: 'action',
      action: 'view',
      recordType: 'organisation.store_default_warehouse',
      authorisedIn: 'command',
    },
    command: false,
    response: storeDefaultWarehouseListSchema,
    codes: HISTORY_CODES,
  }),
  readStoreDefaultWarehouse: defineRoute({
    method: 'GET',
    path: '/api/organisation/store-default-warehouses/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: {
      kind: 'action',
      action: 'view',
      recordType: 'organisation.store_default_warehouse',
      authorisedIn: 'command',
    },
    command: false,
    response: storeDefaultWarehouseReadSchema,
    codes: ORGANISATION_READ_CODES,
  }),
  prepareStoreDefaultWarehouseVersion: defineRoute({
    method: 'POST',
    path: '/api/organisation/store-default-warehouses/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: {
      kind: 'action',
      action: 'edit',
      recordType: 'organisation.store_default_warehouse',
      authorisedIn: 'command',
    },
    command: true,
    body: storeDefaultWarehouseVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: masterPreparedSchema,
    codes: ORGANISATION_UNIT_PREPARE_CODES,
  }),
  // The master lists read model (module-map 4.11; phases.md stage 1 reports): each master's version in force on the
  // date, as of the time read; a list whose own type the reader may not view is left out and named in `notShown`.
  readMasterLists: defineRoute({
    method: 'GET',
    path: '/api/organisation/master-lists',
    query: masterListsQuerySchema,
    // Every signed-in user may read it: it shows only the masters the reader may view and names the others
    // (product owner, 8 Oct 2026).
    access: { kind: 'own' },
    command: false,
    response: masterListsSchema,
    codes: HISTORY_CODES,
  }),
  // Exceptions (access-and-approvals 12, 14; module-map 4.13; S1-F08-T02). An exception carries its Site, Store,
  // business unit and brand, so its routes authorise in the command, with its facts; its owner, or a holder of the
  // owning role, acts on it by being its owner (module-map 4.13), and anyone else needs the route's action covering it.
  listExceptionRouting: defineRoute({
    method: 'GET',
    path: '/api/exceptions/routing',
    access: { kind: 'action', action: 'view', recordType: 'exceptions.exception_routing' },
    command: false,
    response: routingListSchema,
    codes: HISTORY_CODES,
  }),
  prepareExceptionRouting: defineRoute({
    method: 'POST',
    path: '/api/exceptions/routing',
    access: { kind: 'action', action: 'edit', recordType: 'exceptions.exception_routing' },
    command: true,
    body: routingVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: routingVersionPreparedSchema,
    codes: [
      ...HISTORY_CODES,
      'exceptions.type-not-registered',
      'exceptions.starts-in-past',
      'exceptions.version-overlaps',
      'exceptions.party-not-found',
      'exceptions.site-not-found',
    ],
  }),
  raiseException: defineRoute({
    method: 'POST',
    path: '/api/exceptions/exceptions',
    access: { kind: 'action', action: 'create', recordType: 'exceptions.exception', authorisedIn: 'command' },
    command: true,
    body: raiseRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: raisedSchema,
    codes: [
      ...HISTORY_CODES,
      'exceptions.type-not-registered',
      'exceptions.link-not-for-type',
      'exceptions.no-exception-code-series',
      'exceptions.exception-code-series-paused',
      'exceptions.exception-code-series-exhausted',
      'exceptions.no-routing',
    ],
  }),
  readException: defineRoute({
    method: 'GET',
    path: '/api/exceptions/exceptions/{exceptionId}',
    params: exceptionParamsSchema,
    access: { kind: 'action', action: 'view', recordType: 'exceptions.exception', authorisedIn: 'command' },
    command: false,
    response: exceptionViewSchema,
    codes: EXCEPTION_READ_CODES,
  }),
  commentOnException: defineRoute({
    method: 'POST',
    path: '/api/exceptions/exceptions/{exceptionId}/comment',
    params: exceptionParamsSchema,
    access: { kind: 'action', action: 'edit', recordType: 'exceptions.exception', authorisedIn: 'command' },
    command: true,
    body: commentRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: exceptionChangedSchema,
    codes: EXCEPTION_ACTION_CODES,
  }),
  // Evidence on an open exception (access-and-approvals 12.3; POL-03.05; S1-F08-T03): stored files, each stored
  // first, linked in this command's transaction as evidence events. Admitted as the comment is, and needs view on the
  // exception's type covering it besides, since the file is served only through that grant (imports-and-opening-data 11).
  addExceptionEvidence: defineRoute({
    method: 'POST',
    path: '/api/exceptions/exceptions/{exceptionId}/evidence',
    params: exceptionParamsSchema,
    access: { kind: 'action', action: 'edit', recordType: 'exceptions.exception', authorisedIn: 'command' },
    command: true,
    body: exceptionEvidenceRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: exceptionEvidenceAddedSchema,
    codes: EXCEPTION_ACTION_CODES,
  }),
  reassignException: defineRoute({
    method: 'POST',
    path: '/api/exceptions/exceptions/{exceptionId}/reassign',
    params: exceptionParamsSchema,
    access: { kind: 'action', action: 'edit', recordType: 'exceptions.exception', authorisedIn: 'command' },
    command: true,
    body: reassignRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: exceptionChangedSchema,
    codes: EXCEPTION_ACTION_CODES,
  }),
  takeException: defineRoute({
    method: 'POST',
    path: '/api/exceptions/exceptions/{exceptionId}/take',
    params: exceptionParamsSchema,
    access: { kind: 'action', action: 'edit', recordType: 'exceptions.exception', authorisedIn: 'command' },
    command: true,
    body: noBodySchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: exceptionChangedSchema,
    codes: EXCEPTION_ACTION_CODES,
  }),
  closeException: defineRoute({
    method: 'POST',
    path: '/api/exceptions/exceptions/{exceptionId}/close',
    params: exceptionParamsSchema,
    access: { kind: 'action', action: 'edit', recordType: 'exceptions.exception', authorisedIn: 'command' },
    command: true,
    body: noBodySchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: exceptionChangedSchema,
    codes: EXCEPTION_ACTION_CODES,
  }),
  // Settle the exception raised for a recovery gap or a failed check of a restore, while the Organisation is held and
  // after (backup-and-restore 4.3, 4.5; product owner, 12 Oct 2026).
  settleRecoveryGap: defineRoute({
    method: 'POST',
    path: '/api/exceptions/exceptions/{exceptionId}/gap-settlement',
    params: exceptionParamsSchema,
    access: { kind: 'action', action: 'edit', recordType: 'exceptions.exception', authorisedIn: 'command' },
    command: true,
    body: recoveryGapSettlementSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: exceptionChangedSchema,
    codes: [...EXCEPTION_ACTION_CODES, 'exceptions.not-a-recovery-gap'],
  }),
  reopenException: defineRoute({
    method: 'POST',
    path: '/api/exceptions/exceptions/{exceptionId}/reopen',
    params: exceptionParamsSchema,
    access: { kind: 'action', action: 'edit', recordType: 'exceptions.exception', authorisedIn: 'command' },
    command: true,
    body: commentRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: exceptionChangedSchema,
    codes: EXCEPTION_ACTION_CODES,
  }),
  // The read model (12.3; PRD-EXC-004): open exceptions by Store, brand and type, within the reader's scope.
  listOpenExceptions: defineRoute({
    method: 'GET',
    path: '/api/exceptions/open-summary',
    access: { kind: 'action', action: 'view', recordType: 'exceptions.exception', authorisedIn: 'command' },
    command: false,
    response: openExceptionsSchema,
    codes: HISTORY_CODES,
  }),
  // The merchandise catalogue (structure-and-masters 3.3, 4.1, 4.2, 4.7, 8; module-map 4.12; S1-F03-T01): each master's
  // paged list and one record with every version, a new record, a new version. A brand's coverage by a business unit
  // waits for a different authorised person's approval (3.3; GC2-2, DEC-105); the other masters' versions take effect
  // when recorded, as no rule names an approval for them (2.3). A vocabulary value exists only once a different person
  // confirms its proposal through the approval panel (decideApproval; PRD-IMP-008, POL-02.07).
  listBrands: defineRoute({
    method: 'GET',
    path: '/api/merchandise/brands',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.brand' },
    command: false,
    response: brandListSchema,
    codes: HISTORY_CODES,
  }),
  readBrand: defineRoute({
    method: 'GET',
    path: '/api/merchandise/brands/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.brand' },
    command: false,
    response: brandReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  prepareBrand: defineRoute({
    method: 'POST',
    path: '/api/merchandise/brands',
    access: { kind: 'action', action: 'create', recordType: 'merchandise.brand' },
    command: true,
    body: brandDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  prepareBrandVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/brands/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.brand' },
    command: true,
    body: brandVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  listBusinessUnitBrands: defineRoute({
    method: 'GET',
    path: '/api/merchandise/business-unit-brands',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.business_unit_brand' },
    command: false,
    response: businessUnitBrandListSchema,
    codes: HISTORY_CODES,
  }),
  readBusinessUnitBrand: defineRoute({
    method: 'GET',
    path: '/api/merchandise/business-unit-brands/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.business_unit_brand' },
    command: false,
    response: businessUnitBrandReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  prepareBusinessUnitBrandVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/business-unit-brands/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.business_unit_brand' },
    command: true,
    body: businessUnitBrandVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  listCategories: defineRoute({
    method: 'GET',
    path: '/api/merchandise/categories',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.category' },
    command: false,
    response: categoryListSchema,
    codes: HISTORY_CODES,
  }),
  readCategory: defineRoute({
    method: 'GET',
    path: '/api/merchandise/categories/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.category' },
    command: false,
    response: categoryReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  prepareCategory: defineRoute({
    method: 'POST',
    path: '/api/merchandise/categories',
    access: { kind: 'action', action: 'create', recordType: 'merchandise.category' },
    command: true,
    body: categoryDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  prepareCategoryVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/categories/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.category' },
    command: true,
    body: categoryVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  listSizeSets: defineRoute({
    method: 'GET',
    path: '/api/merchandise/size-sets',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.size_set' },
    command: false,
    response: sizeSetListSchema,
    codes: HISTORY_CODES,
  }),
  readSizeSet: defineRoute({
    method: 'GET',
    path: '/api/merchandise/size-sets/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.size_set' },
    command: false,
    response: sizeSetReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  prepareSizeSet: defineRoute({
    method: 'POST',
    path: '/api/merchandise/size-sets',
    access: { kind: 'action', action: 'create', recordType: 'merchandise.size_set' },
    command: true,
    body: sizeSetDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  prepareSizeSetVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/size-sets/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.size_set' },
    command: true,
    body: sizeSetVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  listAttributes: defineRoute({
    method: 'GET',
    path: '/api/merchandise/attributes',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.attribute' },
    command: false,
    response: attributeListSchema,
    codes: HISTORY_CODES,
  }),
  readAttribute: defineRoute({
    method: 'GET',
    path: '/api/merchandise/attributes/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.attribute' },
    command: false,
    response: attributeReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  prepareAttribute: defineRoute({
    method: 'POST',
    path: '/api/merchandise/attributes',
    access: { kind: 'action', action: 'create', recordType: 'merchandise.attribute' },
    command: true,
    body: attributeDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  prepareAttributeVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/attributes/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.attribute' },
    command: true,
    body: catalogueNameVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  listVocabularyValues: defineRoute({
    method: 'GET',
    path: '/api/merchandise/vocabulary-values',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.vocabulary_value' },
    command: false,
    response: vocabularyValueListSchema,
    codes: HISTORY_CODES,
  }),
  readVocabularyValue: defineRoute({
    method: 'GET',
    path: '/api/merchandise/vocabulary-values/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.vocabulary_value' },
    command: false,
    response: vocabularyValueReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  prepareVocabularyValueVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/vocabulary-values/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.vocabulary_value' },
    command: true,
    body: catalogueNameVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  listVocabularyProposals: defineRoute({
    method: 'GET',
    path: '/api/merchandise/vocabulary-proposals',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.vocabulary_proposal' },
    command: false,
    response: vocabularyProposalListSchema,
    codes: HISTORY_CODES,
  }),
  readVocabularyProposal: defineRoute({
    method: 'GET',
    path: '/api/merchandise/vocabulary-proposals/{proposalId}',
    params: z.strictObject({ proposalId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.vocabulary_proposal' },
    command: false,
    response: vocabularyProposalReadSchema,
    codes: [...HISTORY_CODES, 'merchandise.proposal-not-found'],
  }),
  proposeVocabularyValue: defineRoute({
    method: 'POST',
    path: '/api/merchandise/vocabulary-proposals',
    access: { kind: 'action', action: 'create', recordType: 'merchandise.vocabulary_proposal' },
    command: true,
    body: vocabularyProposalDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: vocabularyProposedSchema,
    codes: CATALOGUE_PROPOSE_CODES,
  }),
  // The season attribute and the size attribute (structure-and-masters 4.2 "As built"; goods-in GI-2, GI-3; RR-550,
  // RR-556): two Organisation settings, each marking one list-type attribute, prepared by one person and approved by a
  // different one through My work; every version kept. The record type carries no scope fact (access-and-approvals 5.3).
  listMarkedAttributes: defineRoute({
    method: 'GET',
    path: '/api/merchandise/marked-attributes',
    access: { kind: 'action', action: 'view', recordType: MARKED_ATTRIBUTE_TYPE },
    command: false,
    response: markedAttributeListSchema,
    codes: HISTORY_CODES,
  }),
  // A marking's versions, newest first, a page at a time (code-house-rules 12.1 "Reads").
  listMarkedAttributeVersions: defineRoute({
    method: 'GET',
    path: '/api/merchandise/marked-attributes/{mark}/versions',
    params: z.strictObject({ mark: attributeMarkSchema }),
    query: markedAttributeVersionPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: MARKED_ATTRIBUTE_TYPE },
    command: false,
    response: markedAttributeVersionListSchema,
    codes: HISTORY_CODES,
  }),
  // One version with its marking, for the approval panel in My work.
  readMarkedAttributeVersion: defineRoute({
    method: 'GET',
    path: '/api/merchandise/marked-attributes/versions/{versionId}',
    params: z.strictObject({ versionId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: MARKED_ATTRIBUTE_TYPE },
    command: false,
    response: markedAttributeVersionReadSchema,
    codes: [...HISTORY_CODES, 'merchandise.record-not-found'],
  }),
  prepareMarkedAttributeVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/marked-attributes/versions',
    access: { kind: 'action', action: 'edit', recordType: MARKED_ATTRIBUTE_TYPE },
    command: true,
    body: markedAttributeVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: markedAttributePreparedSchema,
    codes: MARKED_ATTRIBUTE_CHANGE_CODES,
  }),
  // Tracking profiles, a category's profile link, styles, SKUs and packs (structure-and-masters 4.1, 4.4 to 4.7, 8;
  // S1-F03-T02): each master's list, one record, a new record where it has one and a new version, taking effect when
  // recorded (2.3). A style and its SKUs enter the catalogue only when a different person confirms their product
  // proposal through the approval panel (4.2; DM-5, DEC-105). External codes are mapped and ended, and resolved (4.3).
  listTrackingProfiles: defineRoute({
    method: 'GET',
    path: '/api/merchandise/tracking-profiles',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.tracking_profile' },
    command: false,
    response: trackingProfileListSchema,
    codes: HISTORY_CODES,
  }),
  readTrackingProfile: defineRoute({
    method: 'GET',
    path: '/api/merchandise/tracking-profiles/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.tracking_profile' },
    command: false,
    response: trackingProfileReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  prepareTrackingProfile: defineRoute({
    method: 'POST',
    path: '/api/merchandise/tracking-profiles',
    access: { kind: 'action', action: 'create', recordType: 'merchandise.tracking_profile' },
    command: true,
    body: trackingProfileDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: TRACKING_PROFILE_CHANGE_CODES,
  }),
  prepareTrackingProfileVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/tracking-profiles/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.tracking_profile' },
    command: true,
    body: trackingProfileVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: TRACKING_PROFILE_CHANGE_CODES,
  }),
  listCategoryTrackingProfiles: defineRoute({
    method: 'GET',
    path: '/api/merchandise/category-tracking-profiles',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.category_tracking_profile' },
    command: false,
    response: categoryTrackingProfileListSchema,
    codes: HISTORY_CODES,
  }),
  readCategoryTrackingProfile: defineRoute({
    method: 'GET',
    path: '/api/merchandise/category-tracking-profiles/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.category_tracking_profile' },
    command: false,
    response: categoryTrackingProfileReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  prepareCategoryTrackingProfileVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/category-tracking-profiles/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.category_tracking_profile' },
    command: true,
    body: categoryTrackingProfileVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  listStyles: defineRoute({
    method: 'GET',
    path: '/api/merchandise/styles',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.style' },
    command: false,
    response: styleListSchema,
    codes: HISTORY_CODES,
  }),
  readStyle: defineRoute({
    method: 'GET',
    path: '/api/merchandise/styles/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.style' },
    command: false,
    response: styleReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  prepareStyleVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/styles/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.style' },
    command: true,
    body: styleVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  listSkus: defineRoute({
    method: 'GET',
    path: '/api/merchandise/skus',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.sku' },
    command: false,
    response: skuListSchema,
    codes: HISTORY_CODES,
  }),
  readSku: defineRoute({
    method: 'GET',
    path: '/api/merchandise/skus/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.sku' },
    command: false,
    response: skuReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  readSkuAsOf: defineRoute({
    method: 'GET',
    path: '/api/merchandise/skus/{recordId}/as-of',
    params: z.strictObject({ recordId: idSchema }),
    query: skuAsOfQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.sku' },
    command: false,
    response: skuAsOfAnswerSchema,
    codes: [...CATALOGUE_READ_CODES, 'merchandise.no-version-in-force'],
  }),
  prepareSkuVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/skus/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.sku' },
    command: true,
    body: skuVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  listPacks: defineRoute({
    method: 'GET',
    path: '/api/merchandise/packs',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.pack' },
    command: false,
    response: packListSchema,
    codes: HISTORY_CODES,
  }),
  readPack: defineRoute({
    method: 'GET',
    path: '/api/merchandise/packs/{recordId}',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.pack' },
    command: false,
    response: packReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  preparePack: defineRoute({
    method: 'POST',
    path: '/api/merchandise/packs',
    access: { kind: 'action', action: 'create', recordType: 'merchandise.pack' },
    command: true,
    body: packDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  preparePackVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/packs/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.pack' },
    command: true,
    body: packVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: catalogueChangedSchema,
    codes: CATALOGUE_CHANGE_CODES,
  }),
  listProductProposals: defineRoute({
    method: 'GET',
    path: '/api/merchandise/product-proposals',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.product_proposal' },
    command: false,
    response: productProposalListSchema,
    codes: HISTORY_CODES,
  }),
  readProductProposal: defineRoute({
    method: 'GET',
    path: '/api/merchandise/product-proposals/{proposalId}',
    params: z.strictObject({ proposalId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.product_proposal' },
    command: false,
    response: productProposalReadSchema,
    codes: [...HISTORY_CODES, 'merchandise.proposal-not-found'],
  }),
  proposeProduct: defineRoute({
    method: 'POST',
    path: '/api/merchandise/product-proposals',
    access: { kind: 'action', action: 'create', recordType: 'merchandise.product_proposal' },
    command: true,
    body: productProposalDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: productProposedSchema,
    codes: PRODUCT_PROPOSE_CODES,
  }),
  listCodeMappings: defineRoute({
    method: 'GET',
    path: '/api/merchandise/external-codes',
    query: codeMappingListQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.external_code' },
    command: false,
    response: codeMappingListSchema,
    codes: HISTORY_CODES,
  }),
  mapCode: defineRoute({
    method: 'POST',
    path: '/api/merchandise/external-codes',
    access: { kind: 'action', action: 'create', recordType: 'merchandise.external_code' },
    command: true,
    body: codeMappingDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: codeMappedSchema,
    codes: CODE_MAPPING_CODES,
  }),
  endCodeMapping: defineRoute({
    method: 'POST',
    path: '/api/merchandise/external-codes/{mappingId}/end',
    params: z.strictObject({ mappingId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.external_code' },
    command: true,
    body: codeMappingEndSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: codeMappedSchema,
    codes: CODE_MAPPING_CODES,
  }),
  resolveCode: defineRoute({
    method: 'GET',
    path: '/api/merchandise/external-codes/resolve',
    query: resolveCodeQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.external_code' },
    command: false,
    response: resolveCodeAnswerSchema,
    codes: [...HISTORY_CODES, 'merchandise.code-ambiguous', 'merchandise.code-not-found'],
  }),
  // The parties part of merchandise (structure-and-masters 5, 8; module-map 4.12; S1-F03-T03): parties with their
  // dated roles, brand–supplier links and agreements. A party's versions, roles and links take effect when recorded
  // (2.3); an agreement version and a bank-detail change wait for a different authorised person (GC2-2, GC2-6, DEC-105;
  // POL-02.07). Bank details are always masked in a read; showing one version is a protected action with a fresh code,
  // an access record and an answer never repeated (access-and-approvals 3.3, 6; DEC-114).
  listParties: defineRoute({
    method: 'GET',
    path: '/api/merchandise/parties',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.party' },
    command: false,
    response: partyListSchema,
    codes: HISTORY_CODES,
  }),
  readParty: defineRoute({
    method: 'GET',
    path: '/api/merchandise/parties/{partyId}',
    params: z.strictObject({ partyId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.party' },
    command: false,
    response: partyReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  prepareParty: defineRoute({
    method: 'POST',
    path: '/api/merchandise/parties',
    access: { kind: 'action', action: 'create', recordType: 'merchandise.party' },
    command: true,
    body: partyDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: partyChangedSchema,
    codes: PARTY_CHANGE_CODES,
  }),
  preparePartyVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/parties/{partyId}/versions',
    params: z.strictObject({ partyId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.party' },
    command: true,
    body: partyVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: partyChangedSchema,
    codes: PARTY_CHANGE_CODES,
  }),
  preparePartyRoleVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/parties/{partyId}/roles',
    params: z.strictObject({ partyId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.party' },
    command: true,
    body: partyRoleVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: partyChangedSchema,
    codes: PARTY_CHANGE_CODES,
  }),
  prepareBankDetails: defineRoute({
    method: 'POST',
    path: '/api/merchandise/parties/{partyId}/bank-details',
    params: z.strictObject({ partyId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.party_bank_details' },
    command: true,
    body: bankDetailsDraftSchema,
    secretFields: [{ path: ['totpCode'], kind: 'authenticator-code' }],
    restrictedFields: BANK_DETAIL_FIELDS,
    shows: 'nothing',
    response: partyChangedSchema,
    codes: [...PARTY_CHANGE_CODES, ...PARTY_PROTECTED_CODES],
  }),
  showBankDetails: defineRoute({
    method: 'POST',
    path: '/api/merchandise/parties/{partyId}/bank-details/{versionId}/show',
    params: z.strictObject({ partyId: idSchema, versionId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.party_bank_details' },
    command: true,
    body: bankDetailsShowRequestSchema,
    secretFields: [{ path: ['totpCode'], kind: 'authenticator-code' }],
    restrictedFields: [],
    shows: 'restricted-value',
    response: bankDetailsShownSchema,
    codes: [
      ...HISTORY_CODES,
      ...PARTY_PROTECTED_CODES,
      'kernel.cross-site-request',
      'merchandise.bank-details-not-found',
    ],
  }),
  listBrandSupplierLinks: defineRoute({
    method: 'GET',
    path: '/api/merchandise/brand-supplier-links',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.brand_supplier_link' },
    command: false,
    response: brandSupplierLinkListSchema,
    codes: HISTORY_CODES,
  }),
  prepareBrandSupplierLink: defineRoute({
    method: 'POST',
    path: '/api/merchandise/brand-supplier-links',
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.brand_supplier_link' },
    command: true,
    body: brandSupplierLinkDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: partyChangedSchema,
    codes: PARTY_CHANGE_CODES,
  }),
  listAgreements: defineRoute({
    method: 'GET',
    path: '/api/merchandise/agreements',
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.agreement' },
    command: false,
    response: agreementListSchema,
    codes: HISTORY_CODES,
  }),
  readAgreement: defineRoute({
    method: 'GET',
    path: '/api/merchandise/agreements/{agreementId}',
    params: z.strictObject({ agreementId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'merchandise.agreement' },
    command: false,
    response: agreementReadSchema,
    codes: CATALOGUE_READ_CODES,
  }),
  readTermsInForce: defineRoute({
    method: 'GET',
    path: '/api/merchandise/agreement-terms',
    query: termsInForceQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'merchandise.agreement' },
    command: false,
    response: termsInForceSchema,
    codes: [...HISTORY_CODES, 'merchandise.no-terms-in-force'],
  }),
  prepareAgreement: defineRoute({
    method: 'POST',
    path: '/api/merchandise/agreements',
    access: { kind: 'action', action: 'create', recordType: 'merchandise.agreement' },
    command: true,
    body: agreementDraftSchema,
    secretFields: [],
    restrictedFields: [{ path: ['margins'], fieldClass: 'margin' }],
    shows: 'nothing',
    response: partyChangedSchema,
    codes: AGREEMENT_CHANGE_CODES,
  }),
  prepareAgreementVersion: defineRoute({
    method: 'POST',
    path: '/api/merchandise/agreements/{agreementId}/versions',
    params: z.strictObject({ agreementId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'merchandise.agreement' },
    command: true,
    body: agreementVersionDraftSchema,
    secretFields: [],
    restrictedFields: [{ path: ['margins'], fieldClass: 'margin' }],
    shows: 'nothing',
    response: partyChangedSchema,
    codes: AGREEMENT_CHANGE_CODES,
  }),
  // Setup › Policy readiness (module-map 4.4; domain-model 3.6; ui-blueprint; S1-F04-T01): the 19 policies, Signed,
  // validated, configured and what is blocked. Served by `access`, which uses `configuration`, as the history of
  // `audit` is: `configuration` calls no one (module-map section 3, rule 6). Not policy-gated: it is how a policy gets
  // configured (DEC-116).
  readPolicyReadiness: defineRoute({
    method: 'GET',
    path: '/api/access/policy-readiness',
    access: { kind: 'action', action: 'view', recordType: 'configuration.policy_status' },
    command: false,
    response: policyReadinessSchema,
    codes: HISTORY_CODES,
  }),
  recordPolicySignature: defineRoute({
    method: 'POST',
    path: '/api/access/policy-readiness/{policyNumber}/signature',
    params: policyNumberParamSchema,
    access: { kind: 'action', action: 'create', recordType: 'configuration.policy_status' },
    command: true,
    body: policySignatureDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: policySignatureRecordedSchema,
    codes: POLICY_STATUS_CODES,
  }),
  recordPolicyValidation: defineRoute({
    method: 'POST',
    path: '/api/access/policy-readiness/{policyNumber}/validation',
    params: policyNumberParamSchema,
    access: { kind: 'action', action: 'create', recordType: 'configuration.policy_validation' },
    command: true,
    body: policyValidationDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: policyValidationRecordedSchema,
    codes: [...POLICY_STATUS_CODES, 'configuration.validator-entered-values', 'configuration.no-values-to-validate'],
  }),
  switchCapability: defineRoute({
    method: 'POST',
    path: '/api/access/capabilities/{capability}/switch',
    params: capabilityParamSchema,
    access: { kind: 'action', action: 'edit', recordType: 'configuration.capability' },
    command: true,
    body: capabilitySwitchSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: capabilitySwitchedSchema,
    codes: [...PREPARE_CODES, 'configuration.capability-not-found'],
  }),
  // Check availability (module-map 4.4; design-language 10.17; PRD-UXP-003): whether an operation is available here
  // and now, naming what is missing, for a screen to show its gated action enabled or disabled with the banner. Every
  // signed-in user may ask it; it names only policies, capabilities, settings and places, never a restricted value.
  checkAvailability: defineRoute({
    method: 'GET',
    path: '/api/access/availability',
    query: availabilityQuerySchema,
    access: { kind: 'own' },
    command: false,
    response: availabilitySchema,
    codes: [
      'access.not-signed-in',
      'access.session-locked',
      'access.sign-in-incomplete',
      'configuration.operation-not-found',
    ],
  }),
  // Readiness and unit activation (module-map 4.16; domain-model 3.6; PRD-LIF-001 to PRD-LIF-003; S1-F04-T02). The
  // records carry the unit's place, so each route authorises in its command with the unit's facts (5.3; RR-296).
  readUnitReadiness: defineRoute({
    method: 'GET',
    path: '/api/site-lifecycle/units/{businessUnitId}/readiness',
    params: unitParamsSchema,
    access: { kind: 'action', action: 'view', recordType: 'site_lifecycle.readiness_record', authorisedIn: 'command' },
    command: false,
    response: unitReadinessSchema,
    codes: READINESS_CODES,
  }),
  runReadinessChecks: defineRoute({
    method: 'POST',
    path: '/api/site-lifecycle/units/{businessUnitId}/readiness/{activity}/runs',
    params: unitActivityParamsSchema,
    access: {
      kind: 'action',
      action: 'create',
      recordType: 'site_lifecycle.readiness_record',
      authorisedIn: 'command',
    },
    command: true,
    body: noBodySchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: readinessRanSchema,
    codes: READINESS_COMMAND_CODES,
  }),
  runSiteReadinessChecks: defineRoute({
    method: 'POST',
    path: '/api/site-lifecycle/sites/{siteId}/readiness/{activity}/runs',
    params: siteActivityParamsSchema,
    access: {
      kind: 'action',
      action: 'create',
      recordType: 'site_lifecycle.readiness_record',
      authorisedIn: 'command',
    },
    command: true,
    body: noBodySchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: readinessRanSchema,
    codes: [...READINESS_COMMAND_CODES, 'site-lifecycle.site-not-found'],
  }),
  readReadinessRecord: defineRoute({
    method: 'GET',
    path: '/api/site-lifecycle/readiness-records/{readinessRecordId}',
    params: readinessRecordParamsSchema,
    access: { kind: 'action', action: 'view', recordType: 'site_lifecycle.readiness_record', authorisedIn: 'command' },
    command: false,
    response: readinessRecordReadSchema,
    codes: [...READINESS_CODES, 'site-lifecycle.record-not-found'],
  }),
  requestActivation: defineRoute({
    method: 'POST',
    path: '/api/site-lifecycle/readiness-records/{readinessRecordId}/activation-request',
    params: readinessRecordParamsSchema,
    access: {
      kind: 'action',
      action: 'create',
      recordType: 'site_lifecycle.readiness_record',
      authorisedIn: 'command',
    },
    command: true,
    body: noBodySchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: activationRequestedSchema,
    codes: [
      ...READINESS_COMMAND_CODES,
      'site-lifecycle.record-not-found',
      'site-lifecycle.check-failed',
      'kernel.stale-version',
      'site-lifecycle.activity-already-granted',
      'site-lifecycle.site-already-ready',
    ],
  }),
  declareZeroStock: defineRoute({
    method: 'POST',
    path: '/api/site-lifecycle/units/{businessUnitId}/zero-stock-declaration',
    params: unitParamsSchema,
    access: {
      kind: 'action',
      action: 'create',
      recordType: 'site_lifecycle.zero_stock_declaration',
      authorisedIn: 'command',
    },
    command: true,
    body: zeroStockDeclarationRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: zeroStockDeclaredSchema,
    codes: [...READINESS_COMMAND_CODES, 'site-lifecycle.unit-holds-stock'],
  }),
  // The books part of finance (books-and-posting 2, 3, 6.3, 9.1; S1-F09-T01): API only in stage 1 (DEC-116).
  listAccounts: defineRoute({
    method: 'GET',
    path: '/api/finance/books/{bookId}/accounts',
    params: z.strictObject({ bookId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'finance.account' },
    command: false,
    response: accountListSchema,
    codes: HISTORY_CODES,
  }),
  readAccount: defineRoute({
    method: 'GET',
    path: '/api/finance/accounts/{accountId}',
    params: z.strictObject({ accountId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'finance.account' },
    command: false,
    response: accountReadSchema,
    codes: FINANCE_READ_CODES,
  }),
  prepareAccount: defineRoute({
    method: 'POST',
    path: '/api/finance/accounts',
    access: { kind: 'action', action: 'create', recordType: 'finance.account' },
    command: true,
    body: accountDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: financeChangedSchema,
    codes: FINANCE_CHANGE_CODES,
  }),
  prepareAccountVersion: defineRoute({
    method: 'POST',
    path: '/api/finance/accounts/{accountId}/versions',
    params: z.strictObject({ accountId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'finance.account' },
    command: true,
    body: accountVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: financeChangedSchema,
    codes: FINANCE_CHANGE_CODES,
  }),
  listBookSettings: defineRoute({
    method: 'GET',
    path: '/api/finance/books/{bookId}/settings',
    params: z.strictObject({ bookId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'finance.book_setting' },
    command: false,
    response: bookSettingListSchema,
    codes: HISTORY_CODES,
  }),
  prepareBookSetting: defineRoute({
    method: 'POST',
    path: '/api/finance/books/{bookId}/settings',
    params: z.strictObject({ bookId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'finance.book_setting' },
    command: true,
    body: bookSettingDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: financeChangedSchema,
    codes: FINANCE_CHANGE_CODES,
  }),
  // Read the cost setting of a book on a date (books-and-posting 2.2; stock-ledger 13.1; code-house-rules 12.14).
  readCostSetting: defineRoute({
    method: 'GET',
    path: '/api/finance/books/{bookId}/cost-setting',
    params: z.strictObject({ bookId: idSchema }),
    query: costSettingQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'finance.book_setting' },
    command: false,
    response: costSettingReadSchema,
    codes: FINANCE_READ_CODES,
  }),
  // The CA's approval evidence, recorded against the versions it covers (6.3; POL-09.01; DEC-112, GC4-2).
  recordCaEvidence: defineRoute({
    method: 'POST',
    path: '/api/finance/ca-approval-evidence',
    access: { kind: 'action', action: 'create', recordType: 'finance.ca_approval_evidence' },
    command: true,
    body: caEvidenceDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: caEvidenceRecordedSchema,
    codes: [...FINANCE_CHANGE_CODES, 'finance.version-not-awaiting'],
  }),
  // The posting half of finance · books (books-and-posting 4.1, 6, 12, 14; S1-F09-T02): periods, posting maps, the
  // internal ledger and the trial balance.
  listPeriods: defineRoute({
    method: 'GET',
    path: '/api/finance/books/{bookId}/periods',
    params: z.strictObject({ bookId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'finance.financial_period' },
    command: false,
    response: periodListSchema,
    codes: HISTORY_CODES,
  }),
  definePeriod: defineRoute({
    method: 'POST',
    path: '/api/finance/books/{bookId}/periods',
    params: z.strictObject({ bookId: idSchema }),
    access: { kind: 'action', action: 'create', recordType: 'finance.financial_period' },
    command: true,
    body: periodDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: periodDefinedSchema,
    codes: [
      ...FINANCE_CHANGE_CODES,
      'finance.period-code-taken',
      'finance.period-overlaps',
      'finance.period-gap',
      'finance.period-dates-invalid',
    ],
  }),
  // Lock and reopening, and Money › Period close (books-and-posting 4.2, 4.3, 14; PRD-LED-009, PRD-LED-019,
  // PRD-LED-020; DEC-106, DEC-107; S1-F09-T03). The decision on a reopening is the ordinary Decide route.
  readPeriodClose: defineRoute({
    method: 'GET',
    path: '/api/finance/books/{bookId}/period-close',
    params: z.strictObject({ bookId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'finance.financial_period' },
    command: false,
    response: periodCloseSchema,
    codes: HISTORY_CODES,
  }),
  lockPeriod: defineRoute({
    method: 'POST',
    path: '/api/finance/periods/{periodId}/lock',
    params: z.strictObject({ periodId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'finance.financial_period' },
    command: true,
    body: z.strictObject({}),
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: periodLockedSchema,
    codes: [...FINANCE_CHANGE_CODES, 'finance.period-not-open', 'finance.earlier-period-open'],
  }),
  requestReopening: defineRoute({
    method: 'POST',
    path: '/api/finance/periods/{periodId}/reopenings',
    params: z.strictObject({ periodId: idSchema }),
    access: { kind: 'action', action: 'create', recordType: 'finance.period_reopening' },
    command: true,
    body: reopeningDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: reopeningRequestedSchema,
    codes: [...FINANCE_CHANGE_CODES, 'finance.period-not-locked', 'finance.no-correction-named'],
  }),
  readReopening: defineRoute({
    method: 'GET',
    path: '/api/finance/period-reopenings/{reopeningId}',
    params: z.strictObject({ reopeningId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'finance.period_reopening' },
    command: false,
    response: reopeningReadSchema,
    codes: FINANCE_READ_CODES,
  }),
  withdrawReopening: defineRoute({
    method: 'POST',
    path: '/api/finance/period-reopenings/{reopeningId}/withdraw',
    params: z.strictObject({ reopeningId: idSchema }),
    // RR-489 (product owner, 10 Oct 2026): the requester withdraws their own with no permission; the command
    // Authorises cancel on `finance.period_reopening` for anyone else (books-and-posting 4.3).
    access: { kind: 'own' },
    command: true,
    body: z.strictObject({}),
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: reopeningWithdrawnSchema,
    codes: [...FINANCE_CHANGE_CODES, 'finance.reopening-not-in-force'],
  }),
  listPostingMaps: defineRoute({
    method: 'GET',
    path: '/api/finance/books/{bookId}/posting-maps',
    params: z.strictObject({ bookId: idSchema }),
    query: postingMapQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'finance.posting_map' },
    command: false,
    response: postingMapListSchema,
    codes: HISTORY_CODES,
  }),
  preparePostingMap: defineRoute({
    method: 'POST',
    path: '/api/finance/posting-maps',
    access: { kind: 'action', action: 'edit', recordType: 'finance.posting_map' },
    command: true,
    body: postingMapDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: financeChangedSchema,
    codes: [
      ...FINANCE_CHANGE_CODES,
      'finance.event-kind-not-declared',
      'finance.component-not-of-kind',
      'finance.component-without-line',
      'finance.account-not-in-book',
    ],
  }),
  // The internal ledger and trial balance (12; POL-11.01): scoped by the journal lines' facts (PRD-SEC-005).
  readTrialBalance: defineRoute({
    method: 'GET',
    path: '/api/finance/books/{bookId}/trial-balance',
    params: z.strictObject({ bookId: idSchema }),
    query: trialBalanceQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'finance.journal', authorisedIn: 'command' },
    command: false,
    response: trialBalanceSchema,
    codes: FINANCE_READ_CODES,
  }),
  readLedger: defineRoute({
    method: 'GET',
    path: '/api/finance/accounts/{accountId}/ledger',
    params: z.strictObject({ accountId: idSchema }),
    query: ledgerQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'finance.journal', authorisedIn: 'command' },
    command: false,
    response: ledgerSchema,
    codes: FINANCE_READ_CODES,
  }),
  // finance · tax rules (shared-calculations 10; module-map 4.14; S1-F09-T04): API only in stage 1 (DEC-116). Each
  // version waits for a different authorised Accounts user, who records the CA's evidence and decides it (10.1).
  listTaxRuleRecords: defineRoute({
    method: 'GET',
    path: '/api/finance/tax-rules/{kind}',
    params: z.strictObject({ kind: taxRuleKindSchema }),
    query: masterPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'finance.tax_rule' },
    command: false,
    response: taxRuleRecordListSchema,
    codes: HISTORY_CODES,
  }),
  readTaxRuleRecord: defineRoute({
    method: 'GET',
    path: '/api/finance/tax-rules/{kind}/{recordId}',
    params: z.strictObject({ kind: taxRuleKindSchema, recordId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: 'finance.tax_rule' },
    command: false,
    response: taxRuleRecordReadSchema,
    codes: [...HISTORY_CODES, 'finance.record-not-found'],
  }),
  readTaxRules: defineRoute({
    method: 'GET',
    path: '/api/finance/tax-rules-in-force',
    query: taxRulesQuerySchema,
    access: { kind: 'action', action: 'view', recordType: 'finance.tax_rule' },
    command: false,
    response: taxRulesReadSchema,
    codes: HISTORY_CODES,
  }),
  prepareGoodsClassification: defineRoute({
    method: 'POST',
    path: '/api/finance/tax-rules/goods-classification',
    access: { kind: 'action', action: 'create', recordType: 'finance.tax_rule' },
    command: true,
    body: goodsClassificationDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: taxRuleChangedSchema,
    codes: TAX_RULE_CHANGE_CODES,
  }),
  prepareGoodsClassificationVersion: defineRoute({
    method: 'POST',
    path: '/api/finance/tax-rules/goods-classification/{recordId}/versions',
    params: z.strictObject({ recordId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'finance.tax_rule' },
    command: true,
    body: goodsClassificationVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: taxRuleChangedSchema,
    codes: TAX_RULE_CHANGE_CODES,
  }),
  prepareTaxRateRule: defineRoute({
    method: 'POST',
    path: '/api/finance/tax-rules/tax-rate-rule/versions',
    access: { kind: 'action', action: 'edit', recordType: 'finance.tax_rule' },
    command: true,
    body: taxRateRuleDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: taxRuleChangedSchema,
    codes: TAX_RULE_CHANGE_CODES,
  }),
  prepareRegistrationApplicability: defineRoute({
    method: 'POST',
    path: '/api/finance/tax-rules/registration-applicability/versions',
    access: { kind: 'action', action: 'edit', recordType: 'finance.tax_rule' },
    command: true,
    body: registrationApplicabilityDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: taxRuleChangedSchema,
    codes: TAX_RULE_CHANGE_CODES,
  }),
  preparePriceBasis: defineRoute({
    method: 'POST',
    path: '/api/finance/tax-rules/price-basis/versions',
    access: { kind: 'action', action: 'edit', recordType: 'finance.tax_rule' },
    command: true,
    body: priceBasisDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: taxRuleChangedSchema,
    codes: TAX_RULE_CHANGE_CODES,
  }),
  prepareRoundingRule: defineRoute({
    method: 'POST',
    path: '/api/finance/tax-rules/rounding-rule/versions',
    access: { kind: 'action', action: 'edit', recordType: 'finance.tax_rule' },
    command: true,
    body: roundingRuleDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: taxRuleChangedSchema,
    codes: TAX_RULE_CHANGE_CODES,
  }),
  recordTaxRuleCaEvidence: defineRoute({
    method: 'POST',
    path: '/api/finance/tax-rules/ca-evidence',
    access: { kind: 'action', action: 'create', recordType: 'finance.ca_approval_evidence' },
    command: true,
    body: taxRuleCaEvidenceDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: caEvidenceRecordedSchema,
    codes: TAX_RULE_CA_EVIDENCE_CODES,
  }),
  // Billing devices (offline-counter 3.1, 3.2, 4.1, 12.1; module-map 4.17; S1-F12-T01): Setup › Devices, tills and bill
  // series registers a device and lists them; the counter app enrols this browser as one. A device carries its Store's
  // place, so each route authorises in its command with the Store's facts (access-and-approvals 5.3).
  listBillingDevices: defineRoute({
    method: 'GET',
    path: '/api/pos/billing-devices',
    access: { kind: 'action', action: 'view', recordType: 'pos.billing_device', authorisedIn: 'command' },
    command: false,
    response: billingDeviceListSchema,
    codes: HISTORY_CODES,
  }),
  registerBillingDevice: defineRoute({
    method: 'POST',
    path: '/api/pos/billing-devices',
    access: { kind: 'action', action: 'create', recordType: 'pos.billing_device', authorisedIn: 'command' },
    command: true,
    body: billingDeviceDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: billingDeviceRegisteredSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'access.device-code-taken',
      'pos.store-not-found',
      'pos.unit-not-of-store',
      'pos.unit-listed-twice',
    ],
  }),
  enrolBillingDevice: defineRoute({
    method: 'POST',
    path: '/api/pos/billing-devices/{deviceId}/enrolment',
    params: z.strictObject({ deviceId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'pos.billing_device', authorisedIn: 'command' },
    command: true,
    body: deviceEnrolmentSchema,
    secretFields: [{ path: ['totpCode'], kind: 'authenticator-code' }],
    restrictedFields: [],
    shows: 'nothing',
    response: deviceEnrolledSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'access.authenticator-code-refused',
      'access.enrolment-not-started',
      'access.device-not-found',
      'access.device-already-enrolled',
      'access.device-ended',
      'access.device-proof-refused',
    ],
  }),
  revokeBillingDevice: defineRoute({
    method: 'POST',
    path: '/api/pos/billing-devices/{deviceId}/revocation',
    params: z.strictObject({ deviceId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'pos.billing_device', authorisedIn: 'command' },
    command: true,
    body: billingDeviceEndingRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: billingDeviceEndedSchema,
    codes: [...HISTORY_CODES, 'kernel.cross-site-request', 'access.device-not-found', 'access.device-ended'],
  }),
  retireBillingDevice: defineRoute({
    method: 'POST',
    path: '/api/pos/billing-devices/{deviceId}/retirement',
    params: z.strictObject({ deviceId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'pos.billing_device', authorisedIn: 'command' },
    command: true,
    body: billingDeviceEndingRequestSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: billingDeviceEndedSchema,
    codes: [...HISTORY_CODES, 'kernel.cross-site-request', 'access.device-not-found', 'access.device-ended'],
  }),
  replaceBillingDevice: defineRoute({
    method: 'POST',
    path: '/api/pos/billing-devices/{deviceId}/replacement',
    params: z.strictObject({ deviceId: idSchema }),
    access: { kind: 'action', action: 'create', recordType: 'pos.billing_device', authorisedIn: 'command' },
    command: true,
    body: billingDeviceReplacementSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: billingDeviceReplacedSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'access.device-not-found',
      'access.device-ended',
      'access.device-code-taken',
      'pos.unit-not-of-store',
    ],
  }),
  changeBillingDeviceUnits: defineRoute({
    method: 'POST',
    path: '/api/pos/billing-devices/{deviceId}/units',
    params: z.strictObject({ deviceId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: 'pos.billing_device', authorisedIn: 'command' },
    command: true,
    body: billingDeviceUnitChangeSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: billingDeviceUnitsChangedSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'access.device-not-found',
      'pos.device-not-active',
      'pos.starts-in-past',
      'pos.unit-change-scheduled',
      'pos.units-unchanged',
      'pos.unit-not-of-store',
      'pos.unit-listed-twice',
    ],
  }),
  // The financial years and the bill-number format (offline-counter 4.1, 4.3b; numbering-and-audit 3.3, 3.5;
  // S1-F12-T03): each change prepared by one person and decided by a different one through access's Decide route, whose
  // approval gives every Active billing device its missing series (DEC-117). Organisation-wide: no scope fact, so the
  // guard Authorises (access-and-approvals 5.3).
  listFinancialYears: defineRoute({
    method: 'GET',
    path: '/api/pos/financial-years',
    access: { kind: 'action', action: 'view', recordType: 'pos.financial_year_change' },
    command: false,
    response: financialYearListSchema,
    codes: HISTORY_CODES,
  }),
  prepareFinancialYearChange: defineRoute({
    method: 'POST',
    path: '/api/pos/financial-year-changes',
    access: { kind: 'action', action: 'create', recordType: 'pos.financial_year_change' },
    command: true,
    body: financialYearDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: numberingChangePreparedSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'configuration.origin-not-allowed',
      'numbering.financial-year-invalid',
      'numbering.financial-year-label-taken',
      'numbering.financial-year-overlaps',
    ],
  }),
  readBillFormat: defineRoute({
    method: 'GET',
    path: '/api/pos/bill-format',
    access: { kind: 'action', action: 'view', recordType: 'pos.bill_format_change' },
    command: false,
    response: billFormatReadSchema,
    codes: HISTORY_CODES,
  }),
  prepareBillFormatChange: defineRoute({
    method: 'POST',
    path: '/api/pos/bill-format-changes',
    access: { kind: 'action', action: 'create', recordType: 'pos.bill_format_change' },
    command: true,
    body: billFormatDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: numberingChangePreparedSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'configuration.origin-not-allowed',
      'numbering.format-invalid',
      'pos.bill-format-without-device',
      'pos.format-code-taken',
    ],
  }),
  // The preparer withdraws their own pending change with no permission; anyone else needs cancel, which the command
  // Authorises (offline-counter 4.3b; access-and-approvals 9.1a; RR-489; product owner, 12 Oct 2026).
  withdrawFinancialYearChange: defineRoute({
    method: 'POST',
    path: '/api/pos/financial-year-changes/{changeId}/withdraw',
    params: z.strictObject({ changeId: idSchema }),
    access: { kind: 'own' },
    command: true,
    body: z.strictObject({}),
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: numberingChangeWithdrawnSchema,
    codes: [...HISTORY_CODES, 'kernel.cross-site-request', 'pos.change-not-found', 'pos.change-not-awaiting'],
  }),
  withdrawBillFormatChange: defineRoute({
    method: 'POST',
    path: '/api/pos/bill-format-changes/{changeId}/withdraw',
    params: z.strictObject({ changeId: idSchema }),
    access: { kind: 'own' },
    command: true,
    body: z.strictObject({}),
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: numberingChangeWithdrawnSchema,
    codes: [...HISTORY_CODES, 'kernel.cross-site-request', 'pos.change-not-found', 'pos.change-not-awaiting'],
  }),
  // Booking › Open-to-buy (goods-in 3.3, section 11; PRD-BKG-004; POL-05.09; S2-F01-T02): budgets by brand and season,
  // each version prepared by Booking, checked by Accounts and approved by the Owner, or whoever holds the approval,
  // through My work. A budget carries its brand, so each route authorises in its command with the brand's facts
  // (access-and-approvals 5.3). Not policy-gated: a budget's own check and approval are its control (DEC-142).
  listOpenToBuyBudgets: defineRoute({
    method: 'GET',
    path: '/api/booking/open-to-buy-budgets',
    query: openToBuyBudgetPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: OPEN_TO_BUY_BUDGET_TYPE, authorisedIn: 'command' },
    command: false,
    response: openToBuyBudgetListSchema,
    codes: HISTORY_CODES,
  }),
  readOpenToBuyBudget: defineRoute({
    method: 'GET',
    path: '/api/booking/open-to-buy-budgets/{budgetId}',
    params: z.strictObject({ budgetId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: OPEN_TO_BUY_BUDGET_TYPE, authorisedIn: 'command' },
    command: false,
    response: openToBuyBudgetReadSchema,
    codes: [...HISTORY_CODES, 'booking.record-not-found'],
  }),
  prepareOpenToBuyBudget: defineRoute({
    method: 'POST',
    path: '/api/booking/open-to-buy-budgets',
    access: { kind: 'action', action: 'create', recordType: OPEN_TO_BUY_BUDGET_TYPE, authorisedIn: 'command' },
    command: true,
    body: openToBuyBudgetDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: openToBuyBudgetPreparedSchema,
    codes: OPEN_TO_BUY_NEW_BUDGET_CODES,
  }),
  prepareOpenToBuyBudgetVersion: defineRoute({
    method: 'POST',
    path: '/api/booking/open-to-buy-budgets/{budgetId}/versions',
    params: z.strictObject({ budgetId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: OPEN_TO_BUY_BUDGET_TYPE, authorisedIn: 'command' },
    command: true,
    body: openToBuyBudgetVersionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: openToBuyBudgetPreparedSchema,
    codes: OPEN_TO_BUY_VERSION_CODES,
  }),
  // Booking › Bookings and the booking form (goods-in 3.1 to 3.4, section 11; PRD-BKG-001 to PRD-BKG-004; DEC-129,
  // DEC-130, DEC-132, DEC-136; S2-F01-T03): Booking records a booking as a Draft, attaches its documents and submits
  // it; a different person approves or rejects it through `access`'s decision route from My work. A booking carries its
  // destination and brand, so each route authorises in its command with the booking's facts (access-and-approvals
  // 5.3). Only the approval is policy-gated, under policies 5 and 1 (goods-in 10.5).
  listBookings: defineRoute({
    method: 'GET',
    path: '/api/booking/bookings',
    query: bookingPageQuerySchema,
    access: { kind: 'action', action: 'view', recordType: BOOKING_TYPE, authorisedIn: 'command' },
    command: false,
    response: bookingListSchema,
    codes: HISTORY_CODES,
  }),
  readBooking: defineRoute({
    method: 'GET',
    path: '/api/booking/bookings/{bookingId}',
    params: z.strictObject({ bookingId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: BOOKING_TYPE, authorisedIn: 'command' },
    command: false,
    response: bookingReadSchema,
    codes: [...HISTORY_CODES, 'booking.record-not-found'],
  }),
  recordBooking: defineRoute({
    method: 'POST',
    path: '/api/booking/bookings',
    access: { kind: 'action', action: 'create', recordType: BOOKING_TYPE, authorisedIn: 'command' },
    command: true,
    body: bookingDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    bodyLimitBytes: BOOKING_DRAFT_BODY_LIMIT_BYTES,
    response: bookingSavedSchema,
    codes: [...HISTORY_CODES, 'kernel.cross-site-request', ...BOOKING_CONTENT_CODES],
  }),
  saveBookingDraft: defineRoute({
    method: 'POST',
    path: '/api/booking/bookings/{bookingId}/drafts',
    params: z.strictObject({ bookingId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: BOOKING_TYPE, authorisedIn: 'command' },
    command: true,
    body: bookingDraftChangeSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    bodyLimitBytes: BOOKING_DRAFT_BODY_LIMIT_BYTES,
    response: bookingSavedSchema,
    codes: [...BOOKING_CHANGE_CODES, ...BOOKING_NEXT_DRAFT_CODES],
  }),
  attachBookingDocuments: defineRoute({
    method: 'POST',
    path: '/api/booking/bookings/{bookingId}/documents',
    params: z.strictObject({ bookingId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: BOOKING_TYPE, authorisedIn: 'command' },
    command: true,
    body: bookingDocumentsDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: bookingDocumentsAttachedSchema,
    codes: BOOKING_CHANGE_CODES,
  }),
  submitBooking: defineRoute({
    method: 'POST',
    path: '/api/booking/bookings/{bookingId}/submission',
    params: z.strictObject({ bookingId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: BOOKING_TYPE, authorisedIn: 'command' },
    command: true,
    body: bookingSubmissionSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: bookingSubmittedSchema,
    codes: [
      ...BOOKING_CHANGE_CODES,
      'booking.no-document',
      'booking.no-lines',
      // A change after approval (goods-in 3.5; S2-F01-T04).
      'booking.no-change',
      'booking.communication-required',
    ],
  }),
  // An approved booking's lifecycle (goods-in 3.4 to 3.8, 3.10; PRD-BKG-005, PRD-BKG-013; POL-05.01, POL-05.04,
  // POL-05.07; DEC-099; S2-F01-T04): Booking records Issued and Confirmed with their dates, since nothing is sent from
  // the app, and proposes a cancellation of an undelivered balance or an extension of the window, which a different
  // person approves through `access`'s decision route from My work. A change is a new Draft, saved and submitted as
  // before.
  recordBookingIssue: defineRoute({
    method: 'POST',
    path: '/api/booking/bookings/{bookingId}/issue',
    params: z.strictObject({ bookingId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: BOOKING_TYPE, authorisedIn: 'command' },
    command: true,
    body: bookingIssueDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: bookingRecordedSchema,
    codes: [...BOOKING_LIFECYCLE_CODES, 'booking.already-issued', 'booking.date-in-future', 'booking.date-too-early'],
  }),
  recordBookingConfirmation: defineRoute({
    method: 'POST',
    path: '/api/booking/bookings/{bookingId}/confirmation',
    params: z.strictObject({ bookingId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: BOOKING_TYPE, authorisedIn: 'command' },
    command: true,
    body: bookingConfirmationDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: bookingRecordedSchema,
    codes: [
      ...BOOKING_LIFECYCLE_CODES,
      'booking.not-issued',
      'booking.already-confirmed',
      'booking.date-in-future',
      'booking.date-too-early',
    ],
  }),
  proposeBookingCancellation: defineRoute({
    method: 'POST',
    path: '/api/booking/bookings/{bookingId}/cancellations',
    params: z.strictObject({ bookingId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: BOOKING_TYPE, authorisedIn: 'command' },
    command: true,
    body: bookingCancellationDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: bookingAmendmentProposedSchema,
    codes: [...BOOKING_AMENDMENT_CODES, 'booking.nothing-outstanding'],
  }),
  proposeBookingExtension: defineRoute({
    method: 'POST',
    path: '/api/booking/bookings/{bookingId}/extensions',
    params: z.strictObject({ bookingId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: BOOKING_TYPE, authorisedIn: 'command' },
    command: true,
    body: bookingExtensionDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: bookingAmendmentProposedSchema,
    codes: [...BOOKING_AMENDMENT_CODES, 'booking.not-an-extension'],
  }),
  // Receive Goods (goods-in 4.1 to 4.5, section 11; PRD-REC-001 to PRD-REC-008; DEC-133, DEC-138; S2-F02-T02): the
  // inbox of a Site, the Arrival with its invoices first, the count line by line and the GRN. An Arrival and a GRN carry
  // every scope fact, so each route authorises in its command with the record's facts (access-and-approvals 5.3).
  // Recording an Arrival and issuing its GRN ask the policy gate for the unit's receiving activity (goods-in 10.5).
  readReceivingInbox: defineRoute({
    method: 'GET',
    path: '/api/receiving/sites/{siteId}/inbox',
    params: inboxParamsSchema,
    query: inboxQuerySchema,
    access: { kind: 'action', action: 'view', recordType: ARRIVAL_TYPE, authorisedIn: 'command' },
    command: false,
    response: inboxSchema,
    codes: [...HISTORY_CODES, 'receiving.record-not-found'],
  }),
  readArrival: defineRoute({
    method: 'GET',
    path: '/api/receiving/arrivals/{arrivalId}',
    params: z.strictObject({ arrivalId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: ARRIVAL_TYPE, authorisedIn: 'command' },
    command: false,
    response: arrivalReadSchema,
    codes: [...HISTORY_CODES, 'receiving.record-not-found'],
  }),
  recordArrival: defineRoute({
    method: 'POST',
    path: '/api/receiving/arrivals',
    access: { kind: 'action', action: 'create', recordType: ARRIVAL_TYPE, authorisedIn: 'command' },
    command: true,
    body: arrivalDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: arrivalRecordedSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'configuration.operation-unavailable',
      'receiving.unit-not-at-site',
      'receiving.location-not-of-unit',
      'receiving.brand-not-in-force',
      'receiving.supplier-not-linked',
      'receiving.arrival-in-future',
      // Against a booking (goods-in 3.7, 4.2, 4.10; S2-F02-T04): one the receiver may see, approved, of the Arrival's
      // supplier and brand.
      'booking.record-not-found',
      'booking.not-approved',
      'receiving.booking-not-of-arrival',
    ],
  }),
  recordArrivalInvoice: defineRoute({
    method: 'POST',
    path: '/api/receiving/arrivals/{arrivalId}/invoices',
    params: z.strictObject({ arrivalId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: ARRIVAL_TYPE, authorisedIn: 'command' },
    command: true,
    body: invoiceDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: invoiceRecordedSchema,
    codes: [...RECEIVING_CHANGE_CODES, 'receiving.invoice-number-repeated', 'receiving.possible-duplicate-invoice'],
  }),
  attachArrivalPhotos: defineRoute({
    method: 'POST',
    path: '/api/receiving/arrivals/{arrivalId}/photos',
    params: z.strictObject({ arrivalId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: ARRIVAL_TYPE, authorisedIn: 'command' },
    command: true,
    body: photosDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: photosAttachedSchema,
    codes: RECEIVING_CHANGE_CODES,
  }),
  saveCountLine: defineRoute({
    method: 'POST',
    path: '/api/receiving/arrivals/{arrivalId}/count-lines',
    params: z.strictObject({ arrivalId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: ARRIVAL_TYPE, authorisedIn: 'command' },
    command: true,
    body: countLineDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: countLineSavedSchema,
    codes: [
      ...RECEIVING_CHANGE_CODES,
      // No attribute is marked as the size list (structure-and-masters 4.2 "As built"; RR-556).
      'merchandise.attribute-not-marked',
      'receiving.invoice-required',
      'receiving.size-not-on-list',
      'receiving.line-repeated',
      'receiving.sku-not-of-line',
    ],
  }),
  removeCountLine: defineRoute({
    method: 'POST',
    path: '/api/receiving/arrivals/{arrivalId}/count-lines/{lineId}/removal',
    params: z.strictObject({ arrivalId: idSchema, lineId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: ARRIVAL_TYPE, authorisedIn: 'command' },
    command: true,
    body: countLineRemovalSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: countLineSavedSchema,
    codes: RECEIVING_CHANGE_CODES,
  }),
  issueGrn: defineRoute({
    method: 'POST',
    path: '/api/receiving/arrivals/{arrivalId}/grn',
    params: z.strictObject({ arrivalId: idSchema }),
    access: { kind: 'action', action: 'create', recordType: GRN_TYPE, authorisedIn: 'command' },
    command: true,
    body: grnIssueSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: grnIssuedSchema,
    codes: GRN_ISSUE_CODES,
  }),
  // A held line (goods-in 4.6, section 11; PRD-REC-013, POL-17.02, POL-17.11; S2-F02-T03): read with its GRN line for
  // its decision's panel in My work, and the product of unidentified goods named by Booking before they are taken in.
  // The decision itself is made through the approval panel (access-and-approvals 9.5). A held line carries every scope
  // fact, so each route authorises in its command with the Arrival's facts (access-and-approvals 5.3).
  readHeldLine: defineRoute({
    method: 'GET',
    path: '/api/receiving/held-lines/{heldLineId}',
    params: heldLineParamsSchema,
    access: { kind: 'action', action: 'view', recordType: ARRIVAL_TYPE, authorisedIn: 'command' },
    command: false,
    response: heldLineReadSchema,
    codes: [...HISTORY_CODES, 'receiving.record-not-found'],
  }),
  nameHeldLineProduct: defineRoute({
    method: 'POST',
    path: '/api/receiving/held-lines/{heldLineId}/product',
    params: heldLineParamsSchema,
    access: { kind: 'action', action: 'edit', recordType: HELD_LINE_TYPE, authorisedIn: 'command' },
    command: true,
    body: heldLineProductDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: heldLineProductNamedSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'kernel.stale-version',
      // No attribute is marked as the size list (structure-and-masters 4.2 "As built"; RR-556).
      'merchandise.attribute-not-marked',
      'receiving.record-not-found',
      'receiving.held-line-decided',
      'receiving.not-unidentified',
      'receiving.size-not-on-list',
      'receiving.sku-not-of-line',
    ],
  }),
  // A recount of a GRN's lines (goods-in 4.7, 4.11, section 11; PRD-REC-019; S2-F02-T05): proposed with a reason on the
  // GRN, and read with the GRN lines it names for its approval's panel in My work; approved or rejected through the
  // approval panel by a different person (access-and-approvals 9.5). A recount carries every scope fact of its GRN, so
  // each route authorises in its command with the Arrival's facts (access-and-approvals 5.3). Proposing records no
  // business effect, so it asks no gate (DEC-116).
  proposeRecount: defineRoute({
    method: 'POST',
    path: '/api/receiving/grns/{grnId}/recounts',
    params: grnParamsSchema,
    access: { kind: 'action', action: 'create', recordType: RECOUNT_TYPE, authorisedIn: 'command' },
    command: true,
    body: recountDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: recountProposedSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'kernel.stale-version',
      'receiving.recount-pending',
      ...RECOUNT_LINE_CODES,
    ],
  }),
  readRecount: defineRoute({
    method: 'GET',
    path: '/api/receiving/recounts/{recountId}',
    params: recountParamsSchema,
    access: { kind: 'action', action: 'view', recordType: ARRIVAL_TYPE, authorisedIn: 'command' },
    command: false,
    response: recountReadSchema,
    codes: [...HISTORY_CODES, 'receiving.record-not-found'],
  }),
  // The scan-in at the Site (goods-in 7, 7.5, section 11; PRD-REC-021, PRD-REC-022, PRD-MER-007; DEC-135, DEC-141;
  // S2-F07-T01): once the GRN's PT is approved, one piece a scan, to a floor or backstore at a Store or a bin at a
  // warehouse; a barcode the PT's products repeat asks which product it is; one the PT does not cover, or a product with
  // nothing left, is refused and kept in the record. A scan carries its GRN's facts, so it authorises in its command
  // with them (access-and-approvals 5.3); policy-gated as a GRN's issue is (goods-in 10.5). The read is the screen's.
  scanPiece: defineRoute({
    method: 'POST',
    path: '/api/receiving/grns/{grnId}/scans',
    params: grnParamsSchema,
    access: { kind: 'action', action: 'create', recordType: SCAN_TYPE, authorisedIn: 'command' },
    command: true,
    body: scanDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: scanAnsweredSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      // Holding the actor's authority answers it when their role changed under the lock (code-house-rules 8.2).
      'kernel.stale-version',
      'configuration.operation-unavailable',
      'receiving.record-not-found',
      'receiving.pt-not-official',
      'receiving.destination-not-allowed',
      'receiving.barcode-repeated',
      'receiving.product-not-of-barcode',
      // The ledger's refusals of the acceptance, the location move and the ownership change (stock-ledger 13.8, 13.20):
      // a piece held or taken since, a claim the scanner cannot see, a count freeze, and the ownership change of goods
      // whose cost is established, which waits for SL-26.
      'stock.invalid-item',
      'stock.place-invalid',
      'stock.plan-stale',
      'stock.rule-not-set',
      'stock.insufficient-available',
      'stock.held',
      'stock.reserved',
      'stock.blocked',
      'stock.count-freeze-active',
      'stock.exceeds-source',
    ],
  }),
  readScanIn: defineRoute({
    method: 'GET',
    path: '/api/receiving/grns/{grnId}/scan-in',
    params: grnParamsSchema,
    query: scanInQuerySchema,
    access: { kind: 'action', action: 'view', recordType: ARRIVAL_TYPE, authorisedIn: 'command' },
    command: false,
    response: scanInReadSchema,
    codes: [...HISTORY_CODES, 'receiving.record-not-found'],
  }),
  // Booking's later link of GRN lines to the lines of one booking (goods-in 3.7, 4.10, section 11; PRD-BKG-008;
  // POL-05.08; S2-F02-T04): a GRN received without a booking, or lines sent for review. Lines within the delivery window
  // and the booking line's outstanding link at once; late or excess ones are proposed for a different person's approval
  // through `access`. Authorised in the command with the booking's facts, and with view on the GRN's Arrival with its
  // own facts (access-and-approvals 5.3); policy-gated as a booking's approval is (goods-in 10.5).
  linkGrnToBooking: defineRoute({
    method: 'POST',
    path: '/api/receiving/grns/{grnId}/booking-links',
    params: grnParamsSchema,
    access: { kind: 'action', action: 'edit', recordType: BOOKING_TYPE, authorisedIn: 'command' },
    command: true,
    body: grnBookingLinksDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: grnBookingLinkedSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      // Holding the actor's authority answers it when their role changed under the lock (code-house-rules 8.2).
      'kernel.stale-version',
      'configuration.operation-unavailable',
      'booking.record-not-found',
      'booking.not-approved',
      'booking.line-not-found',
      'booking.goods-not-of-line',
      'booking.receipt-already-linked',
      'booking.receipt-link-proposed',
      'booking.link-proposal-pending',
      'receiving.record-not-found',
      'receiving.booking-not-of-arrival',
      'receiving.nothing-received',
      'receiving.product-not-named',
    ],
  }),
  // A PT file uploaded for a GRN (goods-in 5, section 11; DEC-134, DEC-135, DEC-137, DEC-138, DEC-140; S2-F04-T02): the
  // file is handed in, staged, validated, submitted and published through the import routes, as a transaction batch
  // about the GRN whose handler is `merchandise` · PT (imports-and-opening-data 4.1, 13.1, 13.2); these read the GRN's
  // PT, preview a file, withdraw a draft and give the blank template. A PT carries every scope fact of its GRN, so each
  // route authorises in its command with the GRN's facts (access-and-approvals 5.3).
  readGrnPt: defineRoute({
    method: 'GET',
    path: '/api/merchandise/pt/grns/{grnId}',
    params: z.strictObject({ grnId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: PT_TYPE, authorisedIn: 'command' },
    command: false,
    response: grnPtReadSchema,
    codes: [...HISTORY_CODES, 'merchandise.record-not-found'],
  }),
  previewPtUpload: defineRoute({
    method: 'GET',
    path: '/api/merchandise/pt/uploads/{batchId}/preview',
    params: z.strictObject({ batchId: idSchema }),
    query: ptPreviewQuerySchema,
    access: { kind: 'action', action: 'view', recordType: PT_TYPE, authorisedIn: 'command' },
    command: false,
    response: ptPreviewSchema,
    codes: [...HISTORY_CODES, 'merchandise.record-not-found'],
  }),
  withdrawPtRevision: defineRoute({
    method: 'POST',
    path: '/api/merchandise/pt/revisions/{revisionId}/withdraw',
    params: z.strictObject({ revisionId: idSchema }),
    access: { kind: 'action', action: 'edit', recordType: PT_TYPE, authorisedIn: 'command' },
    command: true,
    body: ptWithdrawalSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: ptWithdrawnSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'kernel.stale-version',
      'merchandise.record-not-found',
      'merchandise.pt-not-a-draft',
    ],
  }),
  // The reversal of an Official PT before the scan-in, proposed with a reason by whoever may change the PT, and read as
  // its approver reads it in My work (goods-in 6.4, 6.7, section 11; DEC-137, PRD-REC-019; S2-F09-T01). Approving or
  // rejecting it is `access`'s Decide (access-and-approvals 9.5); its effect is `merchandise` · PT's (9.8b).
  proposePtReversal: defineRoute({
    method: 'POST',
    path: '/api/merchandise/pt/revisions/{revisionId}/reversals',
    params: ptRevisionParamsSchema,
    access: { kind: 'action', action: 'edit', recordType: PT_TYPE, authorisedIn: 'command' },
    command: true,
    body: ptReversalDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: ptReversalProposedSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'kernel.stale-version',
      'merchandise.record-not-found',
      'merchandise.pt-not-official',
      'merchandise.pt-reversal-open',
      'merchandise.pt-scanned-in',
      'merchandise.pt-goods-held',
    ],
  }),
  readPtReversal: defineRoute({
    method: 'GET',
    path: '/api/merchandise/pt/reversals/{reversalId}',
    params: ptReversalParamsSchema,
    access: { kind: 'action', action: 'view', recordType: PT_TYPE, authorisedIn: 'command' },
    command: false,
    response: ptReversalReadSchema,
    codes: [...HISTORY_CODES, 'merchandise.record-not-found'],
  }),
  // A PT revision as its approver reviews it in My work and its GRN's screen shows it, and an Official PT downloaded in
  // its template's columns (goods-in 6.2, 6.5, 6.6, section 11; S2-F06-T01). Approving or rejecting it is `access`'s
  // Decide (access-and-approvals 9.5); its effect is `merchandise` · PT's (9.8b).
  readPtRevision: defineRoute({
    method: 'GET',
    path: '/api/merchandise/pt/revisions/{revisionId}',
    params: ptRevisionParamsSchema,
    query: ptPreviewQuerySchema,
    access: { kind: 'action', action: 'view', recordType: PT_TYPE, authorisedIn: 'command' },
    command: false,
    response: ptRevisionReadSchema,
    codes: [...HISTORY_CODES, 'merchandise.record-not-found'],
  }),
  downloadPt: defineRoute({
    method: 'GET',
    path: '/api/merchandise/pt/revisions/{revisionId}/download',
    params: ptRevisionParamsSchema,
    access: { kind: 'action', action: 'view', recordType: PT_TYPE, authorisedIn: 'command' },
    command: false,
    response: ptDownloadSchema,
    codes: [
      ...HISTORY_CODES,
      'merchandise.record-not-found',
      'merchandise.pt-not-official',
      'files-imports.layout-not-found',
    ],
  }),
  downloadPtTemplate: defineRoute({
    method: 'GET',
    path: '/api/merchandise/pt/grns/{grnId}/template',
    params: z.strictObject({ grnId: idSchema }),
    query: ptTemplateQuerySchema,
    access: { kind: 'action', action: 'create', recordType: PT_TYPE, authorisedIn: 'command' },
    command: false,
    response: ptTemplateSchema,
    codes: [
      ...HISTORY_CODES,
      'merchandise.record-not-found',
      'files-imports.layout-not-found',
      // A list of the template not marked yet (structure-and-masters 4.2 "As built"; S2-F04-T02).
      'merchandise.attribute-not-marked',
    ],
  }),
  // Damage reports (goods-in 8, section 11; PRD-DMG-001 to PRD-DMG-006, PRD-STK-017; S2-F08-T01): anyone authorised at
  // a Site reports damage on goods there, held at once; the decision is made in My work through the approval panel
  // (access-and-approvals 9.5); a confirmation's reversal is proposed here and approved there. A report carries every
  // scope fact, so each route authorises in its command with the report's facts (access-and-approvals 5.3), and each
  // asks the policy gate (goods-in 10.5).
  reportDamage: defineRoute({
    method: 'POST',
    path: '/api/stock/damage-reports',
    access: { kind: 'action', action: 'create', recordType: DAMAGE_REPORT_TYPE, authorisedIn: 'command' },
    command: true,
    body: damageReportDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: damageReportedSchema,
    codes: [
      ...HISTORY_CODES,
      'kernel.cross-site-request',
      'configuration.operation-unavailable',
      'stock.location-not-found',
      'stock.goods-not-found',
      'stock.no-damage-report-series',
      'stock.damage-report-series-paused',
      // The exception-code series and the routing are the gate's checks (goods-in 10.5); the series may still be used
      // up when the exception takes its number (numbering-and-audit 3.7).
      'exceptions.exception-code-series-exhausted',
      ...DAMAGE_HOLD_CODES,
    ],
  }),
  readDamageReport: defineRoute({
    method: 'GET',
    path: '/api/stock/damage-reports/{damageReportId}',
    params: z.strictObject({ damageReportId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: DAMAGE_REPORT_TYPE, authorisedIn: 'command' },
    command: false,
    response: damageReportReadSchema,
    codes: [...HISTORY_CODES, 'stock.record-not-found'],
  }),
  // The report a reversal belongs to, as its approval panel shows it (goods-in 8.3; access-and-approvals 9.5).
  readDamageReversal: defineRoute({
    method: 'GET',
    path: '/api/stock/damage-reversals/{damageReversalId}',
    params: z.strictObject({ damageReversalId: idSchema }),
    access: { kind: 'action', action: 'view', recordType: DAMAGE_REPORT_TYPE, authorisedIn: 'command' },
    command: false,
    response: damageReportReadSchema,
    codes: [...HISTORY_CODES, 'stock.record-not-found'],
  }),
  renewDamageDecision: defineRoute({
    method: 'POST',
    path: '/api/stock/damage-reports/{damageReportId}/decision-renewal',
    params: z.strictObject({ damageReportId: idSchema }),
    access: { kind: 'action', action: 'create', recordType: DAMAGE_REPORT_TYPE, authorisedIn: 'command' },
    command: true,
    body: damageDecisionRenewalSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: damageDecisionRenewedSchema,
    codes: [...DAMAGE_CHANGE_CODES, 'stock.report-decided'],
  }),
  proposeDamageReversal: defineRoute({
    method: 'POST',
    path: '/api/stock/damage-reports/{damageReportId}/reversals',
    params: z.strictObject({ damageReportId: idSchema }),
    access: { kind: 'action', action: 'create', recordType: DAMAGE_REVERSAL_TYPE, authorisedIn: 'command' },
    command: true,
    body: damageReversalDraftSchema,
    secretFields: [],
    restrictedFields: [],
    shows: 'nothing',
    response: damageReversalProposedSchema,
    codes: [...DAMAGE_CHANGE_CODES, 'stock.report-not-confirmed', 'stock.reversal-open'],
  }),
} as const satisfies Readonly<Record<string, Route>>;

export type RouteTable = Readonly<Record<string, Route>>;

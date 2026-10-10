import { z } from 'zod';
import { errorCodes, type ErrorCode } from './errors.js';
import { healthResponseSchema } from './health.js';
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
import { failedJobListSchema, failedJobPageQuerySchema, liveMessageSchema } from './operations.js';
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
  routingListSchema,
  routingVersionDraftSchema,
  routingVersionPreparedSchema,
} from './exceptions.js';
import { attachedFileSchema, storedFileSchema, storeFileRequestSchema, STORE_FILE_BODY_LIMIT_BYTES } from './files.js';
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

/** The routes of the API. A unit adds its routes here as they are built. */
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
    codes: ORGANISATION_UNIT_PREPARE_CODES,
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
    codes: ORGANISATION_UNIT_PREPARE_CODES,
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
    codes: ORGANISATION_UNIT_PREPARE_CODES,
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
    codes: CATALOGUE_CHANGE_CODES,
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
    codes: CATALOGUE_CHANGE_CODES,
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
    codes: [...POLICY_STATUS_CODES, 'configuration.validator-entered-values'],
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
} as const satisfies Readonly<Record<string, Route>>;

export type RouteTable = Readonly<Record<string, Route>>;

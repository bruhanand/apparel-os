import {
  bigint,
  boolean,
  customType,
  date,
  inet,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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

/** The personas a user version holds, in order (access-and-approvals 2.1; personas.md section 2). Never changed. */
export const personaHeld = access.table('persona_held', {
  id: uuid('id').primaryKey(),
  appUserVersionId: uuid('app_user_version_id').notNull(),
  persona: text('persona').notNull(),
  position: integer('position').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A role (access-and-approvals 4.2). Whether it is a self-service role is fixed. Never changed or deleted. */
export const role = access.table('role', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  selfService: boolean('self_service').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A role's effective-dated versions (access-and-approvals 4.2; code-house-rules 7.3). */
export const roleVersion = access.table('role_version', {
  id: uuid('id').primaryKey(),
  roleId: uuid('role_id').notNull(),
  name: text('name').notNull(),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A permission of a role version: an action on a record type, or a field class (access-and-approvals 4.1). */
export const rolePermission = access.table('role_permission', {
  id: uuid('id').primaryKey(),
  roleVersionId: uuid('role_version_id').notNull(),
  kind: text('kind').notNull(),
  recordType: text('record_type'),
  action: text('action'),
  fieldClass: text('field_class'),
  fieldAccess: text('field_access'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Who changed a role version: its preparers (access-and-approvals 9.1). */
export const roleVersionChange = access.table('role_version_change', {
  id: uuid('id').primaryKey(),
  roleVersionId: uuid('role_version_id').notNull(),
  changedByUserId: uuid('changed_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A role assignment: actor, role, scope and dates (access-and-approvals 4.3; code-house-rules 7.3). */
export const roleAssignment = access.table('role_assignment', {
  id: uuid('id').primaryKey(),
  appUserId: uuid('app_user_id'),
  serviceIdentityId: uuid('service_identity_id'),
  roleId: uuid('role_id').notNull(),
  roleSelfService: boolean('role_self_service').notNull(),
  ownRecords: boolean('own_records').notNull(),
  scopeKey: text('scope_key').notNull(),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').notNull(),
  withdrawalId: uuid('withdrawal_id'),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** One dimension of an assignment's scope (access-and-approvals 5.1). Never changed. */
export const assignmentScope = access.table('assignment_scope', {
  id: uuid('id').primaryKey(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  dimension: text('dimension').notNull(),
  kind: text('kind').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A selected member of a scope dimension (access-and-approvals 5.1, 5.2). Never changed. */
export const assignmentScopeMember = access.table('assignment_scope_member', {
  id: uuid('id').primaryKey(),
  assignmentScopeId: uuid('assignment_scope_id').notNull(),
  memberType: text('member_type').notNull(),
  memberId: uuid('member_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Who changed an assignment: its preparers (access-and-approvals 9.1). */
export const roleAssignmentChange = access.table('role_assignment_change', {
  id: uuid('id').primaryKey(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  changedByUserId: uuid('changed_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The withdrawal of a Scheduled assignment: a document (access-and-approvals 4.3; code-house-rules 7.2, 7.3). */
export const roleAssignmentWithdrawal = access.table('role_assignment_withdrawal', {
  id: uuid('id').primaryKey(),
  roleAssignmentId: uuid('role_assignment_id').notNull().unique(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A withdrawal's versions, frozen once decided (code-house-rules 7.2). */
export const roleAssignmentWithdrawalVersion = access.table('role_assignment_withdrawal_version', {
  id: uuid('id').primaryKey(),
  withdrawalId: uuid('withdrawal_id').notNull(),
  reason: text('reason').notNull(),
  decision: text('decision').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
  /** Before its start (7.3), or before approval, when the user's first version is rejected (DEC-117; 0013). */
  kind: text('kind').notNull(),
  causedByDecisionId: uuid('caused_by_decision_id'),
});

/** Who changed a withdrawal version: its preparers (access-and-approvals 9.1). */
export const roleAssignmentWithdrawalChange = access.table('role_assignment_withdrawal_change', {
  id: uuid('id').primaryKey(),
  withdrawalVersionId: uuid('withdrawal_version_id').notNull(),
  changedByUserId: uuid('changed_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The effective grants, derived from the assignments in force on `as_of` (access-and-approvals 7.2). */
export const effectiveGrant = access.table('effective_grant', {
  id: uuid('id').primaryKey(),
  actorId: uuid('actor_id').notNull(),
  recordType: text('record_type').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  actions: text('actions').array().notNull(),
  ownRecords: boolean('own_records').notNull(),
  declaresLegalEntity: boolean('declares_legal_entity').notNull(),
  declaresPlace: boolean('declares_place').notNull(),
  declaresBrand: boolean('declares_brand').notNull(),
  legalEntityAll: boolean('legal_entity_all').notNull(),
  legalEntityIds: uuid('legal_entity_ids').array().notNull(),
  placeAll: boolean('place_all').notNull(),
  siteIds: uuid('site_ids').array().notNull(),
  storeIds: uuid('store_ids').array().notNull(),
  businessUnitIds: uuid('business_unit_ids').array().notNull(),
  brandAll: boolean('brand_all').notNull(),
  brandIds: uuid('brand_ids').array().notNull(),
  asOf: date('as_of', { mode: 'string' }).notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Who changed a user version: its preparers (access-and-approvals 9.1; migration 0013). */
export const appUserVersionChange = access.table('app_user_version_change', {
  id: uuid('id').primaryKey(),
  appUserVersionId: uuid('app_user_version_id').notNull(),
  changedByUserId: uuid('changed_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** An approve or reject reason (access-and-approvals 9.5; POL-02.23). Never changed or deleted. */
export const approvalReason = access.table('approval_reason', {
  id: uuid('id').primaryKey(),
  code: text('code').notNull().unique(),
  kind: text('kind').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A reason's effective-dated versions (code-house-rules 7.3). */
export const approvalReasonVersion = access.table('approval_reason_version', {
  id: uuid('id').primaryKey(),
  approvalReasonId: uuid('approval_reason_id').notNull(),
  text: text('text').notNull(),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Who changed a reason version: its preparers (access-and-approvals 9.1). */
export const approvalReasonVersionChange = access.table('approval_reason_version_change', {
  id: uuid('id').primaryKey(),
  approvalReasonVersionId: uuid('approval_reason_version_id').notNull(),
  changedByUserId: uuid('changed_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The configured parts of one action type's approval rule (access-and-approvals 8). Never changed or deleted. */
export const approvalRuleSetting = access.table('approval_rule_setting', {
  id: uuid('id').primaryKey(),
  actionType: text('action_type').notNull().unique(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** A rule setting's effective-dated versions (code-house-rules 7.3). */
export const approvalRuleSettingVersion = access.table('approval_rule_setting_version', {
  id: uuid('id').primaryKey(),
  approvalRuleSettingId: uuid('approval_rule_setting_id').notNull(),
  bulkAllowed: boolean('bulk_allowed').notNull(),
  phoneAllowed: boolean('phone_allowed').notNull(),
  validDuring: daterange('valid_during').notNull(),
  decision: text('decision').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** Who changed a rule setting version: its preparers (access-and-approvals 9.1). */
export const approvalRuleSettingVersionChange = access.table('approval_rule_setting_version_change', {
  id: uuid('id').primaryKey(),
  approvalRuleSettingVersionId: uuid('approval_rule_setting_version_id').notNull(),
  changedByUserId: uuid('changed_by_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** An approval request: one document version and action type (access-and-approvals 9.1, 9.6). */
export const approvalRequest = access.table('approval_request', {
  id: uuid('id').primaryKey(),
  actionType: text('action_type').notNull(),
  documentModule: text('document_module').notNull(),
  documentRecordType: text('document_record_type').notNull(),
  documentRecordId: uuid('document_record_id').notNull(),
  documentVersionId: uuid('document_version_id').notNull(),
  valueKind: text('value_kind').notNull(),
  valueBasis: text('value_basis'),
  valueAmount: bigint('value_amount', { mode: 'number' }),
  state: text('state').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** The preparers a request binds to, frozen when requested (access-and-approvals 9.1). */
export const approvalRequestPreparer = access.table('approval_request_preparer', {
  id: uuid('id').primaryKey(),
  approvalRequestId: uuid('approval_request_id').notNull(),
  userId: uuid('user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/** An approval decision: an entry, never edited (access-and-approvals 9.5; domain-model 3.2). */
export const approvalDecision = access.table('approval_decision', {
  id: uuid('id').primaryKey(),
  approvalRequestId: uuid('approval_request_id').notNull().unique(),
  approverUserId: uuid('approver_user_id').notNull(),
  roleAssignmentId: uuid('role_assignment_id').notNull(),
  outcome: text('outcome').notNull(),
  documentVersionId: uuid('document_version_id').notNull(),
  approvalReasonVersionId: uuid('approval_reason_version_id'),
  reasonText: text('reason_text'),
  comment: text('comment'),
  valueKind: text('value_kind').notNull(),
  valueBasis: text('value_basis'),
  valueAmount: bigint('value_amount', { mode: 'number' }),
  decidedAt: at('decided_at').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

/**
 * The setup record (access-and-approvals 9.11, 13.1): the fingerprint of the setup request's non-secret fields, the
 * version of its canonical form, and the two first users. At most one row; append-only. Never a password.
 */
export const setupRecord = access.table('setup_record', {
  id: uuid('id').primaryKey(),
  organisationCode: text('organisation_code').notNull().unique(),
  fingerprint: text('fingerprint').notNull(),
  canonicalFormVersion: text('canonical_form_version').notNull(),
  firstAdminUserId: uuid('first_admin_user_id').notNull(),
  firstApproverUserId: uuid('first_approver_user_id').notNull(),
  recordedAt: at('recorded_at').notNull().defaultNow(),
});

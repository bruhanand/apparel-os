import {
  permissionRegistry,
  registryByCode,
  type ApprovalReasonDraft,
  type ApprovalReasonVersionDraft,
  type ApprovalRuleSettingDraft,
  type ApprovalRuleSettingVersionDraft,
  type AssignmentWithdrawalDraft,
  type FieldClass,
  type PermissionAction,
  type RecordTypeDeclaration,
  type RoleAssignmentDraft,
  type RoleDraft,
  type RoleVersionDraft,
  type Secret,
  type SecuritySettings,
  type SecuritySettingVersionDraft,
  type UserVersionDraft,
} from '@apparel-os/schemas';
import {
  CommandDefect,
  PRODUCTION_COMPOSITION,
  type CommandRefusal,
  type Composition,
  type LockTarget,
  type TransactionContext,
} from '../../kernel/index.js';
import type { AuditInterface } from '../audit/index.js';
import {
  AccessChanges,
  type Decider,
  type EffectOptions,
  type Prepared,
  type Preparer,
} from './commands/access-changes.js';
import { ApprovalSettingsChanges } from './commands/approval-settings.js';
import {
  approvalLockTargets,
  recordUse,
  verifyUnderLock,
  type ApprovalCheck,
  type ApprovalUseRecord,
} from './commands/approval-use.js';
import { requestModuleApproval, type ModuleApprovalRequest } from './commands/request-approval.js';
import { approvalRulesOf, effectsOf, type ApprovalRule, type DocumentEffect } from './domain/approval-rules.js';
import { latestRequests, type LatestRequest } from './queries/access-records.js';
import { holdAuthority, type AuthorityActor } from './commands/authority.js';
import { SecuritySettingsChanges } from './commands/security-settings.js';
import {
  Approvals,
  type Decidable,
  type DecidingActor,
  type DecisionInput,
  type DecisionOutcome,
} from './commands/decide.js';
import { checkFreshCode, type FreshCode } from './commands/fresh-code.js';
import { revokeSessions, type Revoker, type RevocationTarget } from './commands/sessions.js';
import { UserChanges, type NewUser, type PreparedWithCredential } from './commands/user-changes.js';
import type { OrganisationKeys } from './domain/organisation-keys.js';
import type { ScopeMembers } from './contracts/scope-members.js';
import {
  authorise,
  authoriseEach,
  restrictFields,
  type Authorisation,
  type AuthoriseRequest,
} from './queries/authorise.js';
import type { RecordFacts } from './domain/scope.js';
import { ownAccess, type OwnAccess } from './queries/own-access.js';
import { securitySettings } from './queries/security-settings.js';
import {
  authenticateInternalIdentity,
  authenticateServiceCredential,
  type AuthenticatedServiceIdentity,
} from './queries/service-identities.js';

/** A request as the approval panel reads it (access-and-approvals 9.3, 9.5; S1-F01-T13). */
export type ApprovalRequestRead = NonNullable<Awaited<ReturnType<Approvals['view']>>>;

/**
 * The access module's interface to other modules (module-map 4.3): Authenticate for service identities
 * (access-and-approvals 2.3, 7.1 step 1), Authorise and the Restrict-fields hook (7.1 step 3, 6), preparing users,
 * roles, role assignments, withdrawals, reasons and approval rule settings, each with its approval request (2.1, 4,
 * 5, 8, 9.1, 9.11), deciding them (9.3, 9.5), making a decided one take effect (module-map 6.2 flow A), the
 * eligibility My work asks (11.2), and rebuilding effective grants (7.2). Every operation joins the caller's
 * transaction through its context (code-house-rules 8.1).
 */
export interface AccessInterface {
  /** An internal identity, by its code, enabled today; undefined otherwise. */
  authenticateInternalIdentity(
    context: TransactionContext,
    code: string,
  ): Promise<AuthenticatedServiceIdentity | undefined>;
  /** An outside caller, by its credential and secret; undefined otherwise, whatever was wrong. */
  authenticateServiceCredential(
    context: TransactionContext,
    credentialId: string,
    secret: Secret,
  ): Promise<AuthenticatedServiceIdentity | undefined>;
  /** Authorise: the one assignment that grants the action, or what is missing (7.1 step 3). */
  authorise(context: TransactionContext, request: AuthoriseRequest): Promise<Authorisation>;
  /**
   * Authorise each of several records of one type for one action, as a list does for each row (7.1 step 3; RR-296):
   * each record's answer, or one refusal when no assignment grants the action on the type at all.
   */
  authoriseEach(
    context: TransactionContext,
    request: Omit<AuthoriseRequest, 'facts' | 'movesTo'>,
    facts: readonly RecordFacts[],
  ): ReturnType<typeof authoriseEach>;
  /**
   * Holds the authority a command relies on (code-house-rules 8.2 "Authority first"; 7.1 step 4; RR-325, RR-360):
   * locks the actor, the assignment Authorise returned and the role it grants in shared mode at step 0, with any
   * authority rows the command changes, then rechecks under the locks that the actor is Active, that no version of
   * the role took effect meanwhile (`kernel.stale-version`; DEC-118) and that the same assignment still grants the
   * action. Answers the refusal, or undefined while the authority holds. Called first in the command's transaction.
   */
  holdAuthority(
    context: TransactionContext,
    actor: AuthorityActor,
    roleAssignmentId: string,
    need: Omit<AuthoriseRequest, 'actorId'>,
    changed?: readonly LockTarget[],
  ): Promise<CommandRefusal | undefined>;
  /** Which of a record's field classes the assignment Authorise used grants for a use; the rest are masked (6). */
  restrictFields(
    context: TransactionContext,
    request: {
      readonly roleAssignmentId: string;
      readonly actorId: string;
      readonly fieldClasses: readonly FieldClass[];
    },
    use: 'view' | 'edit',
  ): Promise<{ readonly granted: FieldClass[]; readonly masked: FieldClass[] }>;
  /**
   * The personas a user holds today, their effective grants, whether any role assignment is in force and the
   * Organisation's timezone, for the shell (RR-261, RR-281; DEC-118, RR-260, RR-310).
   */
  ownAccess(context: TransactionContext, userId: string): Promise<OwnAccess>;
  prepareUser(
    context: TransactionContext,
    preparer: Preparer,
    user: NewUser,
  ): Promise<PreparedWithCredential<{ userId: string; versionId: string; requestId: string }>>;
  prepareUserVersion(
    context: TransactionContext,
    preparer: Preparer,
    userId: string,
    draft: UserVersionDraft,
  ): Promise<Prepared<{ userId: string; versionId: string; requestId: string }>>;
  prepareRole(
    context: TransactionContext,
    preparer: Preparer,
    draft: RoleDraft,
  ): Promise<Prepared<{ roleId: string; versionId: string; requestId: string }>>;
  prepareRoleVersion(
    context: TransactionContext,
    preparer: Preparer,
    roleId: string,
    draft: RoleVersionDraft,
  ): Promise<Prepared<{ roleId: string; versionId: string; requestId: string }>>;
  prepareAssignment(
    context: TransactionContext,
    preparer: Preparer,
    draft: RoleAssignmentDraft,
  ): Promise<Prepared<{ assignmentId: string; requestId: string }>>;
  prepareWithdrawal(
    context: TransactionContext,
    preparer: Preparer,
    assignmentId: string,
    draft: AssignmentWithdrawalDraft,
  ): Promise<Prepared<{ withdrawalId: string; versionId: string; requestId: string }>>;
  prepareApprovalReason(
    context: TransactionContext,
    preparer: Preparer,
    draft: ApprovalReasonDraft,
  ): Promise<Prepared<{ reasonId: string; versionId: string; requestId: string }>>;
  prepareApprovalReasonVersion(
    context: TransactionContext,
    preparer: Preparer,
    reasonId: string,
    draft: ApprovalReasonVersionDraft,
  ): Promise<Prepared<{ reasonId: string; versionId: string; requestId: string }>>;
  prepareApprovalRuleSetting(
    context: TransactionContext,
    preparer: Preparer,
    draft: ApprovalRuleSettingDraft,
  ): Promise<Prepared<{ settingId: string; versionId: string; requestId: string }>>;
  prepareApprovalRuleSettingVersion(
    context: TransactionContext,
    preparer: Preparer,
    settingId: string,
    draft: ApprovalRuleSettingVersionDraft,
  ): Promise<Prepared<{ settingId: string; versionId: string; requestId: string }>>;
  /**
   * Prepares a new version of an essential security setting (access-and-approvals 3.3; POL-02.06, POL-02.07;
   * DEC-118): the throttling, the password rules or the office session limits, for a different authorised person to
   * approve with a fresh code.
   */
  prepareSecuritySettingVersion(
    context: TransactionContext,
    preparer: Preparer,
    draft: SecuritySettingVersionDraft,
  ): Promise<Prepared<{ settingId: string; versionId: string; requestId: string }>>;
  /** The essential security settings, each with its versions and the one in force now (design-language 10.19). */
  securitySettings(context: TransactionContext): Promise<SecuritySettings>;
  /**
   * Request approval of another module's document under the rule it declares (access-and-approvals 8, 9.1; module-map
   * 4.3), in the preparing command's transaction. Returns the request's identifier.
   */
  requestApproval(context: TransactionContext, request: ModuleApprovalRequest): Promise<string>;
  /** The rows a posting locks with its document at step 1: the decision's request (stock-ledger 10.3; 9.7). */
  approvalLockTargets(context: TransactionContext, decisionId: string): Promise<LockTarget[]>;
  /**
   * Verify under lock (access-and-approvals 9.7; stock-ledger 10.4; DEC-097): the decision is Approved, unused, of the
   * version posted, by none of its preparers, and within the approved amount. Answers the refusal, or undefined.
   */
  verifyUnderLock(context: TransactionContext, check: ApprovalCheck): Promise<CommandRefusal | undefined>;
  /**
   * The latest approval request of each document version named, for an owning module's version history: its
   * identifier, for the approval panel, and its state, which says Superseded for a version a later one replaced
   * (access-and-approvals 9.1, 9.6).
   */
  approvalRequestsOf(
    context: TransactionContext,
    versionIds: readonly string[],
  ): Promise<ReadonlyMap<string, LatestRequest>>;
  /** Record use (9.8; DEC-097): this decision authorised this posting, in the posting transaction. */
  recordUse(context: TransactionContext, use: ApprovalUseRecord): Promise<CommandRefusal | undefined>;
  /**
   * Decide an approval request (access-and-approvals 9.3, 9.5; module-map 6.2 flow A): a protected action asking a
   * fresh code (3.3); never by a service identity or a preparer (PRD-ACS-006, PRD-SEC-018).
   */
  decide(context: TransactionContext, actor: DecidingActor, input: DecisionInput): Promise<DecisionOutcome>;
  /** A request as the approval panel reads it, or undefined when there is none (9.3, 9.5; PRD-UXP-003). */
  readApprovalRequest(
    context: TransactionContext,
    actor: DecidingActor,
    requestId: string,
  ): Promise<ApprovalRequestRead | undefined>;
  /** The approve and reject reasons in force today (9.5). */
  reasonsInForce(
    context: TransactionContext,
  ): Promise<{ id: string; versionId: string; code: string; kind: 'approve' | 'reject'; text: string }[]>;
  /** Of the requests named, those still open that the user may decide now: My work's eligibility (11.2). */
  eligibleRequests(context: TransactionContext, userId: string, requestIds: readonly string[]): Promise<string[]>;
  /** Authorise for a replayed decision: the same actor, still holding approve on the request's type (12.4). */
  decisionReplayAccess(
    context: TransactionContext,
    actor: DecidingActor,
    requestId: string,
  ): Promise<Authorisation | { readonly kind: 'allowed' }>;
  approveUserVersion(
    context: TransactionContext,
    decider: Decider,
    versionId: string,
    options?: EffectOptions,
  ): Promise<Prepared<{ userId: string; revokedSessionIds: string[] }>>;
  approveRoleVersion(
    context: TransactionContext,
    decider: Decider,
    versionId: string,
  ): Promise<Prepared<{ roleId: string }>>;
  rejectRoleVersion(
    context: TransactionContext,
    decider: Decider,
    versionId: string,
  ): Promise<Prepared<{ roleId: string }>>;
  approveAssignment(
    context: TransactionContext,
    decider: Decider,
    assignmentId: string,
  ): Promise<Prepared<{ assignmentId: string }>>;
  rejectAssignment(
    context: TransactionContext,
    decider: Decider,
    assignmentId: string,
  ): Promise<Prepared<{ assignmentId: string }>>;
  approveWithdrawal(
    context: TransactionContext,
    decider: Decider,
    withdrawalVersionId: string,
  ): Promise<Prepared<{ assignmentId: string }>>;
  rejectWithdrawal(
    context: TransactionContext,
    decider: Decider,
    withdrawalVersionId: string,
  ): Promise<Prepared<{ assignmentId: string }>>;
  /** Rebuilds the effective grants of the actors named, or of every actor (7.2). Returns the rows written. */
  rebuildGrants(context: TransactionContext, actorIds?: readonly string[]): Promise<number>;
  /**
   * Checks the fresh authenticator code a protected action asks for (3.3; GC3-6), such as a decision (S1-F01-T13);
   * `take` records its step, so it is never accepted again. Every protected action asks anew while no freshness
   * setting exists.
   */
  checkFreshCode(context: TransactionContext, userId: string, totpCode: string): Promise<FreshCode>;
  /**
   * Revokes one or every session of a user in the caller's transaction (3.3; PRD-SEC-008): for the decision that
   * disables the user (2.1, 4.3; S1-F01-T13) and the operator's recovery command (3.2; S1-F01-T10). Answers the
   * sessions revoked, or undefined when the one named is not the user's or is over.
   */
  revokeSessions(
    context: TransactionContext,
    by: Revoker,
    target: RevocationTarget,
    operation: string,
  ): Promise<string[] | undefined>;
}

export interface AccessDependencies {
  readonly audit: AuditInterface;
  /** The permission registry; the declared one unless a test gives another (access-and-approvals 4.1). */
  readonly registry?: readonly RecordTypeDeclaration[];
  /** The Organisation keys, which open authenticator secrets for the fresh-code check (access-and-approvals 6). */
  readonly keys?: OrganisationKeys;
  /** The approval rules other modules declare for their documents (access-and-approvals 8). None by default. */
  readonly approvalRules?: readonly ApprovalRule[];
  /** How the application was composed; a synthetic rule needs a test composition (stock-ledger 15.3). */
  readonly composition?: Composition;
  /** The effects of decisions on modules' master versions, by action type (9.8b; module-map 6.2 flow A). */
  readonly documentEffects?: ReadonlyMap<string, DocumentEffect>;
  /**
   * The scope contract's implementations, which check the members an assignment selects (5.1; module-map section 3,
   * rule 6). None by default: then no member can be selected.
   */
  readonly scopeMembers?: readonly ScopeMembers[];
}

/** One action on one record type, as a route or a job step declares it (access-and-approvals 7.1). */
export interface ActionNeed {
  readonly action: PermissionAction;
  readonly recordType: string;
}

export class Access implements AccessInterface {
  private readonly registry: ReadonlyMap<string, RecordTypeDeclaration>;
  private readonly changes: AccessChanges;
  private readonly users: UserChanges;
  private readonly settings: ApprovalSettingsChanges;
  private readonly securitySettingChanges: SecuritySettingsChanges;
  private readonly approvals: Approvals;
  private readonly rules: ReadonlyMap<string, ApprovalRule>;

  constructor(private readonly dependencies: AccessDependencies) {
    this.registry = registryByCode(dependencies.registry ?? permissionRegistry);
    this.rules = approvalRulesOf(
      dependencies.approvalRules ?? [],
      dependencies.composition ?? PRODUCTION_COMPOSITION,
      this.registry,
    );
    this.changes = new AccessChanges(dependencies.audit, this.registry, dependencies.scopeMembers);
    this.users = new UserChanges(dependencies.audit);
    this.settings = new ApprovalSettingsChanges(dependencies.audit);
    this.securitySettingChanges = new SecuritySettingsChanges(dependencies.audit);
    this.approvals = new Approvals({
      audit: dependencies.audit,
      registry: this.registry,
      changes: this.changes,
      users: this.users,
      settings: this.settings,
      securitySettings: this.securitySettingChanges,
      keys: dependencies.keys,
      rules: this.rules,
      effects: effectsOf(dependencies.documentEffects ?? new Map(), this.rules),
    });
  }

  checkFreshCode(context: TransactionContext, userId: string, totpCode: string) {
    const keys = this.dependencies.keys;
    if (keys === undefined) throw new CommandDefect('The fresh-code check needs the Organisation keys');
    return checkFreshCode(context, keys, userId, totpCode);
  }

  revokeSessions(context: TransactionContext, by: Revoker, target: RevocationTarget, operation: string) {
    return revokeSessions(context, this.dependencies.audit, by, target, operation);
  }

  authenticateInternalIdentity(context: TransactionContext, code: string) {
    return authenticateInternalIdentity(context, code);
  }

  authenticateServiceCredential(context: TransactionContext, credentialId: string, secret: Secret) {
    return authenticateServiceCredential(context, credentialId, secret);
  }

  authorise(context: TransactionContext, request: AuthoriseRequest) {
    return authorise(context, this.registry, request);
  }

  authoriseEach(
    context: TransactionContext,
    request: Omit<AuthoriseRequest, 'facts' | 'movesTo'>,
    facts: readonly RecordFacts[],
  ) {
    return authoriseEach(context, this.registry, request, facts);
  }

  holdAuthority(
    context: TransactionContext,
    actor: AuthorityActor,
    roleAssignmentId: string,
    need: Omit<AuthoriseRequest, 'actorId'>,
    changed: readonly LockTarget[] = [],
  ) {
    return holdAuthority(context, this.registry, actor, roleAssignmentId, need, changed);
  }

  restrictFields(
    context: TransactionContext,
    request: {
      readonly roleAssignmentId: string;
      readonly actorId: string;
      readonly fieldClasses: readonly FieldClass[];
    },
    use: 'view' | 'edit',
  ) {
    return restrictFields(context, request, use);
  }

  ownAccess(context: TransactionContext, userId: string) {
    return ownAccess(context, userId);
  }

  prepareUser(context: TransactionContext, preparer: Preparer, user: NewUser) {
    return this.users.prepareUser(context, preparer, user);
  }

  prepareUserVersion(context: TransactionContext, preparer: Preparer, userId: string, draft: UserVersionDraft) {
    return this.users.prepareUserVersion(context, preparer, userId, draft);
  }

  prepareRole(context: TransactionContext, preparer: Preparer, draft: RoleDraft) {
    return this.changes.prepareRole(context, preparer, draft);
  }

  prepareRoleVersion(context: TransactionContext, preparer: Preparer, roleId: string, draft: RoleVersionDraft) {
    return this.changes.prepareRoleVersion(context, preparer, roleId, draft);
  }

  prepareAssignment(context: TransactionContext, preparer: Preparer, draft: RoleAssignmentDraft) {
    return this.changes.prepareAssignment(context, preparer, draft);
  }

  prepareWithdrawal(
    context: TransactionContext,
    preparer: Preparer,
    assignmentId: string,
    draft: AssignmentWithdrawalDraft,
  ) {
    return this.changes.prepareWithdrawal(context, preparer, assignmentId, draft);
  }

  prepareApprovalReason(context: TransactionContext, preparer: Preparer, draft: ApprovalReasonDraft) {
    return this.settings.prepareReason(context, preparer, draft);
  }

  prepareApprovalReasonVersion(
    context: TransactionContext,
    preparer: Preparer,
    reasonId: string,
    draft: ApprovalReasonVersionDraft,
  ) {
    return this.settings.prepareReasonVersion(context, preparer, reasonId, draft);
  }

  prepareApprovalRuleSetting(context: TransactionContext, preparer: Preparer, draft: ApprovalRuleSettingDraft) {
    return this.settings.prepareRuleSetting(context, preparer, draft);
  }

  prepareApprovalRuleSettingVersion(
    context: TransactionContext,
    preparer: Preparer,
    settingId: string,
    draft: ApprovalRuleSettingVersionDraft,
  ) {
    return this.settings.prepareRuleSettingVersion(context, preparer, settingId, draft);
  }

  prepareSecuritySettingVersion(context: TransactionContext, preparer: Preparer, draft: SecuritySettingVersionDraft) {
    return this.securitySettingChanges.prepare(context, preparer, draft);
  }

  securitySettings(context: TransactionContext) {
    return securitySettings(context);
  }

  requestApproval(context: TransactionContext, request: ModuleApprovalRequest) {
    return requestModuleApproval(context, this.dependencies.audit, this.rules, request);
  }

  approvalLockTargets(context: TransactionContext, decisionId: string) {
    return approvalLockTargets(context, decisionId);
  }

  approvalRequestsOf(context: TransactionContext, versionIds: readonly string[]) {
    return latestRequests(context, versionIds);
  }

  verifyUnderLock(context: TransactionContext, check: ApprovalCheck) {
    return verifyUnderLock(context, this.rules, check);
  }

  recordUse(context: TransactionContext, use: ApprovalUseRecord) {
    return recordUse(context, this.rules, use);
  }

  decide(context: TransactionContext, actor: DecidingActor, input: DecisionInput) {
    return this.approvals.decide(context, actor, input);
  }

  readApprovalRequest(context: TransactionContext, actor: DecidingActor, requestId: string) {
    return this.approvals.view(context, actor, requestId);
  }

  reasonsInForce(context: TransactionContext) {
    return this.approvals.reasonsInForce(context);
  }

  eligibleRequests(context: TransactionContext, userId: string, requestIds: readonly string[]) {
    return this.approvals.eligibleRequests(context, userId, requestIds);
  }

  decisionReplayAccess(context: TransactionContext, actor: DecidingActor, requestId: string) {
    return this.approvals.replayAccess(context, actor, requestId);
  }

  approveUserVersion(context: TransactionContext, decider: Decider, versionId: string, options?: EffectOptions) {
    return this.users.approveUserVersion(context, decider, versionId, options);
  }

  approveRoleVersion(context: TransactionContext, decider: Decider, versionId: string) {
    return this.changes.approveRoleVersion(context, decider, versionId);
  }

  rejectRoleVersion(context: TransactionContext, decider: Decider, versionId: string) {
    return this.changes.rejectRoleVersion(context, decider, versionId);
  }

  approveAssignment(context: TransactionContext, decider: Decider, assignmentId: string) {
    return this.changes.approveAssignment(context, decider, assignmentId);
  }

  rejectAssignment(context: TransactionContext, decider: Decider, assignmentId: string) {
    return this.changes.rejectAssignment(context, decider, assignmentId);
  }

  approveWithdrawal(context: TransactionContext, decider: Decider, withdrawalVersionId: string) {
    return this.changes.approveWithdrawal(context, decider, withdrawalVersionId);
  }

  rejectWithdrawal(context: TransactionContext, decider: Decider, withdrawalVersionId: string) {
    return this.changes.rejectWithdrawal(context, decider, withdrawalVersionId);
  }

  rebuildGrants(context: TransactionContext, actorIds?: readonly string[]) {
    return this.changes.rebuildGrants(context, actorIds);
  }
}

export type { Decidable, DecidingActor, DecisionInput, DecisionOutcome, NewUser, PreparedWithCredential };

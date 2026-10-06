import {
  permissionRegistry,
  registryByCode,
  type AssignmentWithdrawalDraft,
  type FieldClass,
  type GrantView,
  type PermissionAction,
  type PersonaId,
  type RecordTypeDeclaration,
  type RoleAssignmentDraft,
  type RoleDraft,
  type RoleVersionDraft,
  type Secret,
} from '@apparel-os/schemas';
import { CommandDefect, type TransactionContext } from '../../kernel/index.js';
import type { AuditInterface } from '../audit/index.js';
import { AccessChanges, type Decider, type Prepared, type Preparer } from './commands/access-changes.js';
import { checkFreshCode, type FreshCode } from './commands/fresh-code.js';
import { revokeSessions, type Revoker, type RevocationTarget } from './commands/sessions.js';
import type { OrganisationKeys } from './domain/organisation-keys.js';
import { authorise, restrictFields, type Authorisation, type AuthoriseRequest } from './queries/authorise.js';
import { ownAccess } from './queries/own-access.js';
import {
  authenticateInternalIdentity,
  authenticateServiceCredential,
  type AuthenticatedServiceIdentity,
} from './queries/service-identities.js';

/**
 * The access module's interface to other modules (module-map 4.3): Authenticate for service identities
 * (access-and-approvals 2.3, 7.1 step 1), Authorise and the Restrict-fields hook (7.1 step 3, 6), preparing roles,
 * role assignments and withdrawals (4, 5, 9.11), making a decided one take effect (module-map 6.2 flow A), and
 * rebuilding effective grants (7.2). Every operation joins the caller's transaction through its context
 * (code-house-rules 8.1).
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
  /** The personas a user holds today and their effective grants, for the shell (RR-261, RR-281). */
  ownAccess(
    context: TransactionContext,
    userId: string,
  ): Promise<{ readonly personasHeld: PersonaId[]; readonly grants: GrantView[] }>;
  prepareRole(
    context: TransactionContext,
    preparer: Preparer,
    draft: RoleDraft,
  ): Promise<Prepared<{ roleId: string; versionId: string }>>;
  prepareRoleVersion(
    context: TransactionContext,
    preparer: Preparer,
    roleId: string,
    draft: RoleVersionDraft,
  ): Promise<Prepared<{ roleId: string; versionId: string }>>;
  prepareAssignment(
    context: TransactionContext,
    preparer: Preparer,
    draft: RoleAssignmentDraft,
  ): Promise<Prepared<{ assignmentId: string }>>;
  prepareWithdrawal(
    context: TransactionContext,
    preparer: Preparer,
    assignmentId: string,
    draft: AssignmentWithdrawalDraft,
  ): Promise<Prepared<{ withdrawalId: string; versionId: string }>>;
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
}

/** One action on one record type, as a route or a job step declares it (access-and-approvals 7.1). */
export interface ActionNeed {
  readonly action: PermissionAction;
  readonly recordType: string;
}

export class Access implements AccessInterface {
  private readonly registry: ReadonlyMap<string, RecordTypeDeclaration>;
  private readonly changes: AccessChanges;

  constructor(private readonly dependencies: AccessDependencies) {
    this.registry = registryByCode(dependencies.registry ?? permissionRegistry);
    this.changes = new AccessChanges(dependencies.audit, this.registry);
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

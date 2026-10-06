import { uuidv7 } from '@apparel-os/domain';
import type { PersonaId, Secret, UserVersionDraft } from '@apparel-os/schemas';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { LOCK_STEP, lockTable, type LockTarget, type TransactionContext } from '../../../kernel/index.js';
import type { AuditChange, AuditInterface } from '../../audit/index.js';
import { appUser, appUserVersion, appUserVersionChange, passwordCredential, personaHeld } from '../db/schema.js';
import { hashPassword } from '../domain/password-hash.js';
import { meetsPasswordRules } from '../domain/sign-in-rules.js';
import { readSetting } from '../queries/settings.js';
import { findUser, findUserByLogin } from '../queries/users.js';
import {
  rangeOf,
  refusal,
  today,
  type Decider,
  type EffectOptions,
  type Prepared,
  type Preparer,
} from './access-changes.js';
import { requestApproval } from './request-approval.js';
import { revokeSessions } from './sessions.js';

// Users (access-and-approvals 2.1, 3.2, 9.11; DEC-112; S1-F01-T13; RR-300). Creating a user after the setup step,
// and every change to a user's details, personas held or state, is a user version: Awaiting approval until an
// authorised person other than its preparers decides it (POL-02.07). A user version takes effect on the day it is
// approved: a disabling at once, revoking every session of the user in the decision's transaction (PRD-SEC-008).

const USER_VERSION = lockTable('access', 'app_user_version');

/** A command's outcome that may name the credential it wrote, for the replay check (code-house-rules 12.5). */
export type PreparedWithCredential<Answer> =
  | { readonly kind: 'success'; readonly answer: Answer; readonly credentialIds: readonly string[] }
  | (Prepared<Answer> & { readonly kind: 'refusal'; readonly causedBySecret: boolean });

/** A new user as the route gives it (access-and-approvals 2.1, 3.2). */
export interface NewUser {
  readonly login: string;
  readonly displayName: string;
  readonly personas: readonly PersonaId[];
  readonly temporaryPassword: Secret;
}

export class UserChanges {
  constructor(private readonly audit: AuditInterface) {}

  /**
   * Prepares a new user: the user, its first version Awaiting approval (state Active, so it may sign in once
   * approved), the personas it holds and its temporary password, kept only as an Argon2 hash marked temporary with
   * the version (access-and-approvals 2.1, 3.2; RR-213), then requests its approval. Refused when no password rules
   * are in force or the password fails them (GC3-5), or another user has the login, ignoring letter case. The user
   * cannot sign in until a different authorised person approves it (DEC-112). Nothing is sent (DEC-099).
   */
  async prepareUser(
    context: TransactionContext,
    preparer: Preparer,
    user: NewUser,
  ): Promise<PreparedWithCredential<{ userId: string; versionId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date, causedBySecret: false };
    const rules = await readSetting(context, 'access.password-rules', date);
    if (rules.kind === 'not-set') {
      return {
        kind: 'refusal',
        refusal: {
          kind: 'unavailable',
          code: 'access.password-rules-not-set',
          missing: [{ kind: 'setting', setting: 'access.password-rules' }],
        },
        causedBySecret: false,
      };
    }
    if (!meetsPasswordRules(rules.value, user.temporaryPassword)) {
      return {
        kind: 'refusal',
        refusal: { kind: 'refused', code: 'access.password-refused', missing: [] },
        causedBySecret: true,
      };
    }
    if ((await findUserByLogin(context, user.login)) !== undefined) {
      return {
        kind: 'refusal',
        refusal: { kind: 'refused', code: 'access.login-taken', missing: [] },
        causedBySecret: false,
      };
    }
    const userId = uuidv7();
    await context.tx.insert(appUser).values({ id: userId, login: user.login, partnerId: null });
    const versionId = await this.writeVersion(context, preparer, userId, {
      displayName: user.displayName,
      personas: [...user.personas],
      state: 'Active',
    });
    const credentialId = uuidv7();
    await context.tx.insert(passwordCredential).values({
      id: credentialId,
      appUserId: userId,
      passwordHash: await hashPassword(user.temporaryPassword),
      temporary: true,
      enteredWithVersionId: versionId,
      replacedAt: null,
    });
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'access', type: 'user', id: userId, versionId },
      operation: 'prepare-user',
      changes: [
        { kind: 'value', field: 'login', before: null, after: user.login },
        ...versionChanges({ displayName: user.displayName, personas: [...user.personas], state: 'Active' }),
        { kind: 'secret', field: 'password' },
      ],
      source: { kind: 'screen' },
    });
    const requestId = await requestApproval(context, this.audit, {
      actionType: 'access.user.change',
      document: { recordType: 'access.user', recordId: userId, versionId },
      preparer,
    });
    return { kind: 'success', answer: { userId, versionId, requestId }, credentialIds: [credentialId] };
  }

  /**
   * Prepares a new version of a user: its details, personas held or state, Disabled or Ended included
   * (access-and-approvals 2.1, 9.11; DEC-112), and requests its approval. A request open on an earlier version of the
   * user is Superseded (9.6).
   */
  async prepareUserVersion(
    context: TransactionContext,
    preparer: Preparer,
    userId: string,
    draft: UserVersionDraft,
  ): Promise<Prepared<{ userId: string; versionId: string; requestId: string }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    if ((await findUser(context, userId)) === undefined) return refusal('not-found', 'access.user-not-found');
    const versionId = await this.writeVersion(context, preparer, userId, draft);
    await this.audit.record(context, {
      actor: { kind: 'user', id: preparer.userId },
      roleAssignmentId: preparer.roleAssignmentId,
      record: { module: 'access', type: 'user', id: userId, versionId },
      operation: 'prepare-user-version',
      changes: versionChanges(draft),
      source: { kind: 'screen' },
    });
    const requestId = await requestApproval(context, this.audit, {
      actionType: 'access.user.change',
      document: { recordType: 'access.user', recordId: userId, versionId },
      preparer,
    });
    return { kind: 'success', answer: { userId, versionId, requestId } };
  }

  private async writeVersion(
    context: TransactionContext,
    preparer: Preparer,
    userId: string,
    draft: UserVersionDraft,
  ): Promise<string> {
    const date = await today(context);
    const versionId = uuidv7();
    // The start is written again on the day it is approved, which is when it takes effect (2.1).
    await context.tx.insert(appUserVersion).values({
      id: versionId,
      appUserId: userId,
      displayName: draft.displayName,
      state: draft.state,
      validDuring: rangeOf(typeof date === 'string' ? date : '-infinity', undefined),
      decision: 'Awaiting approval',
    });
    if (draft.personas.length > 0) {
      await context.tx.insert(personaHeld).values(
        draft.personas.map((persona, index) => ({
          id: uuidv7(),
          appUserVersionId: versionId,
          persona,
          position: index + 1,
        })),
      );
    }
    await context.tx
      .insert(appUserVersionChange)
      .values({ id: uuidv7(), appUserVersionId: versionId, changedByUserId: preparer.userId });
    return versionId;
  }

  /** The rows a decision on a user version locks at step 1 (code-house-rules 8.2). */
  userVersionTargets(versionId: string): LockTarget[] {
    return [{ table: USER_VERSION, id: versionId, mode: 'exclusive' }];
  }

  /** The user a version is of. */
  async userOfVersion(context: TransactionContext, versionId: string): Promise<string | undefined> {
    const [row] = await context.tx
      .select({ userId: appUserVersion.appUserId })
      .from(appUserVersion)
      .where(eq(appUserVersion.id, versionId));
    return row?.userId;
  }

  /** Whether the user has any Approved version: a new user's first version is approved (4.3; DEC-116). */
  async hasApprovedVersion(context: TransactionContext, userId: string): Promise<boolean> {
    const rows = await context.tx
      .select({ id: appUserVersion.id })
      .from(appUserVersion)
      .where(and(eq(appUserVersion.appUserId, userId), eq(appUserVersion.decision, 'Approved')));
    return rows.length > 0;
  }

  /**
   * Makes an approved user version take effect today (access-and-approvals 2.1; module-map 6.2 flow A): locks it,
   * rechecks it is Awaiting approval, ends the version in force on today and starts this one today. A disabled or
   * ended user's sessions are all revoked in the same transaction (PRD-SEC-008); Authenticate refuses any user not
   * Active from the next request (7.1 step 1). Every user change writes a permission-change access record (9.11;
   * RR-214). Refused when the version in force started today, since versions are dated by day and a second cannot
   * follow it until tomorrow (code-house-rules 7.3; RR-321).
   */
  async approveUserVersion(
    context: TransactionContext,
    decider: Decider,
    versionId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ userId: string; revokedSessionIds: string[] }>> {
    const date = await today(context);
    if (typeof date !== 'string') return { kind: 'refusal', refusal: date };
    if (options.locksHeld !== true) await context.lock(LOCK_STEP.document, this.userVersionTargets(versionId));
    const [version] = await context.tx.select().from(appUserVersion).where(eq(appUserVersion.id, versionId));
    if (version === undefined) return refusal('not-found', 'access.user-not-found');
    if (version.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    const startedToday = await context.tx
      .select({ id: appUserVersion.id })
      .from(appUserVersion)
      .where(
        and(
          eq(appUserVersion.appUserId, version.appUserId),
          eq(appUserVersion.decision, 'Approved'),
          sql`lower(${appUserVersion.validDuring}) >= ${date}::date`,
        ),
      );
    if (startedToday.length > 0) return refusal('refused', 'access.version-overlaps');
    const [inForce] = await context.tx
      .select({ id: appUserVersion.id, state: appUserVersion.state, displayName: appUserVersion.displayName })
      .from(appUserVersion)
      .where(
        and(
          eq(appUserVersion.appUserId, version.appUserId),
          eq(appUserVersion.decision, 'Approved'),
          sql`${appUserVersion.validDuring} @> ${date}::date`,
        ),
      );
    if (inForce !== undefined) {
      await context.tx
        .update(appUserVersion)
        .set({ validDuring: sql`daterange(lower(${appUserVersion.validDuring}), ${date}::date)` })
        .where(eq(appUserVersion.id, inForce.id));
    }
    await context.tx
      .update(appUserVersion)
      .set({ decision: 'Approved', validDuring: rangeOf(date, undefined) })
      .where(eq(appUserVersion.id, versionId));
    const auditRecord = await this.audit.record(context, {
      ...auditActor(decider),
      record: { module: 'access', type: 'user', id: version.appUserId, versionId },
      operation: 'approve-user-version',
      changes: [
        { kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Approved' },
        { kind: 'value', field: 'state', before: inForce?.state ?? null, after: version.state },
        { kind: 'value', field: 'displayName', before: inForce?.displayName ?? null, after: version.displayName },
      ],
      source: { kind: decider.actor.kind === 'service-identity' ? 'operator-command' : 'screen' },
    });
    await this.audit.recordAccess(context, {
      kind: 'permission-changed',
      outcome: 'succeeded',
      auditRecord,
      userId: version.appUserId,
    });
    let revokedSessionIds: string[] = [];
    if (version.state !== 'Active') {
      revokedSessionIds =
        (await revokeSessions(
          context,
          this.audit,
          {
            actor: decider.actor,
            ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
            ...(decider.approvalDecisionId === undefined ? {} : { approvalDecisionId: decider.approvalDecisionId }),
          },
          { userId: version.appUserId },
          version.state === 'Disabled' ? 'disable-user' : 'end-user',
        )) ?? [];
    }
    return { kind: 'success', answer: { userId: version.appUserId, revokedSessionIds } };
  }

  /**
   * Records a user version Rejected; it never takes effect (access-and-approvals 9.5). When the user then has no
   * Approved version, the first version was rejected: the temporary password's credential is retired, keeping no hash
   * (3.2, RR-213), and the caller withdraws the user's pending assignments (4.3; DEC-116, DEC-117).
   */
  async rejectUserVersion(
    context: TransactionContext,
    decider: Decider,
    versionId: string,
    options: EffectOptions = {},
  ): Promise<Prepared<{ userId: string; firstVersionRejected: boolean }>> {
    if (options.locksHeld !== true) await context.lock(LOCK_STEP.document, this.userVersionTargets(versionId));
    const [version] = await context.tx.select().from(appUserVersion).where(eq(appUserVersion.id, versionId));
    if (version === undefined) return refusal('not-found', 'access.user-not-found');
    if (version.decision !== 'Awaiting approval') return refusal('conflict', 'kernel.stale-version');
    await context.tx.update(appUserVersion).set({ decision: 'Rejected' }).where(eq(appUserVersion.id, versionId));
    const changes: AuditChange[] = [
      { kind: 'value', field: 'decision', before: 'Awaiting approval', after: 'Rejected' },
    ];
    const firstVersionRejected = !(await this.hasApprovedVersion(context, version.appUserId));
    if (firstVersionRejected) {
      const retired = await context.tx
        .update(passwordCredential)
        .set({ replacedAt: context.startedAt, passwordHash: null })
        .where(and(eq(passwordCredential.appUserId, version.appUserId), isNull(passwordCredential.replacedAt)))
        .returning({ id: passwordCredential.id });
      if (retired.length > 0) changes.push({ kind: 'secret', field: 'password' });
    }
    await this.audit.record(context, {
      ...auditActor(decider),
      record: { module: 'access', type: 'user', id: version.appUserId, versionId },
      operation: 'reject-user-version',
      changes,
      source: { kind: 'screen' },
    });
    return { kind: 'success', answer: { userId: version.appUserId, firstVersionRejected } };
  }
}

function versionChanges(draft: UserVersionDraft): AuditChange[] {
  return [
    { kind: 'value', field: 'displayName', before: null, after: draft.displayName },
    { kind: 'value', field: 'personas', before: null, after: [...draft.personas] },
    { kind: 'value', field: 'state', before: null, after: draft.state },
  ];
}

function auditActor(decider: Decider) {
  return {
    actor: decider.actor,
    ...(decider.roleAssignmentId === undefined ? {} : { roleAssignmentId: decider.roleAssignmentId }),
    ...(decider.approvalDecisionId === undefined ? {} : { approval: { decisionId: decider.approvalDecisionId } }),
    ...(decider.reason === undefined ? {} : { reason: decider.reason }),
  };
}
